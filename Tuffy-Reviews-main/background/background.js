/**
 * Tuffy Reviews – Background service worker
 * Handles:
 * - mock cross-site reviews
 * - backend /insights fetch for price tab
 * - mock competitor price comparison for sellers tab
 */

const INSIGHTS_API_URL = 'https://1j22dbprfj.execute-api.us-east-2.amazonaws.com/dev/insights';

/** Retailers shown in the Sellers-tab comparison (order preserved in UI). */
const COMPARISON_RETAILERS = ['amazon', 'walmart', 'ebay', 'target', 'bestbuy', 'newegg'];

const RETAILER_LABEL = {
  amazon: 'Amazon',
  walmart: 'Walmart',
  ebay: 'eBay',
  target: 'Target',
  bestbuy: 'Best Buy',
  newegg: 'Newegg',
};

const COGNITO_DOMAIN =
  'https://us-east-2tm2ugrdhm.auth.us-east-2.amazoncognito.com';

const COGNITO_CLIENT_ID =
  '3c80gv6ukt11t4fla3m3nfmrci';

const COGNITO_REDIRECT_URI =
  'https://hcpkophckilnlccepoanlipedjebcaoi.chromiumapp.org/';

const COGNITO_SCOPES =
  'openid+email+profile';

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomPkceString(length = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);

  return Array.from(values)
    .map((v) => chars[v % chars.length])
    .join('');
}

async function sha256Base64Url(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

async function startCognitoLogin() {
  const codeVerifier = randomPkceString();
  const codeChallenge = await sha256Base64Url(codeVerifier);

  const authUrl =
    `${COGNITO_DOMAIN}/login` +
    `?client_id=${encodeURIComponent(COGNITO_CLIENT_ID)}` +
    `&response_type=code` +
    `&scope=${COGNITO_SCOPES}` +
    `&redirect_uri=${encodeURIComponent(COGNITO_REDIRECT_URI)}` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true
      },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        if (!redirectUrl) {
          reject(new Error('No redirect URL received'));
          return;
        }

        try {
          const redirected = new URL(redirectUrl);
          const code = redirected.searchParams.get('code');

          if (!code) {
            throw new Error('Missing authorization code');
          }

          const tokenResponse = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: COGNITO_CLIENT_ID,
              code,
              redirect_uri: COGNITO_REDIRECT_URI,
              code_verifier: codeVerifier
            })
          });

          const tokenData = await tokenResponse.json();

          if (!tokenResponse.ok) {
            throw new Error(
              tokenData?.error_description ||
              tokenData?.error ||
              'Token exchange failed'
            );
          }

          if (!tokenData.id_token || !tokenData.access_token) {
            throw new Error('Missing Cognito tokens from token response');
          }

          await chrome.storage.local.set({
            cognitoAccessToken: tokenData.access_token,
            cognitoIdToken: tokenData.id_token,
            cognitoRefreshToken: tokenData.refresh_token || null,
            cognitoLoggedIn: true
          });

          resolve({ ok: true });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

function retailerLabel(key) {
  return RETAILER_LABEL[key] || key;
}

function mockPriceOffset(seed, shiftBits, spreadCents) {
  const half = Math.floor(spreadCents / 2);
  return (((seed >> shiftBits) % spreadCents) - half) / 100;
}

// Open Side Panel when the toolbar icon is clicked (no popup UI).
function ensureSidePanelOnActionClick() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}
chrome.runtime.onInstalled.addListener(ensureSidePanelOnActionClick);
ensureSidePanelOnActionClick();

// Backend price fetch
async function getAuthHeaders() {
  const auth = await chrome.storage.local.get([
    'cognitoIdToken',
    'cognitoLoggedIn'
  ]);

  if (!auth?.cognitoIdToken) {
    throw new Error('Please sign in first.');
  }

  const payload = JSON.parse(atob(auth.cognitoIdToken.split('.')[1]));
  const expiresAtMs = payload.exp * 1000;

  if (Date.now() >= expiresAtMs) {
    await chrome.storage.local.remove([
      'cognitoAccessToken',
      'cognitoIdToken',
      'cognitoRefreshToken',
      'cognitoLoggedIn'
    ]);

    throw new Error('Your session expired. Please sign in again.');
  }

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${auth.cognitoIdToken}`
  };
}

async function fetchInsightsByAsin(asin) {
  if (!asin) {
    throw new Error('Missing ASIN');
  }

  const response = await fetch(INSIGHTS_API_URL, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      retailer: 'amazon',
      productId: asin,
    }),
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    throw new Error(`API returned non-JSON response (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(data?.error || `API request failed (${response.status})`);
  }

  if (!data?.meta?.ok) {
    throw new Error(data?.error || 'Insights API returned an unsuccessful response');
  }

  return data;
}

async function fetchReviewIntelligence(payload) {
  const reviewPayload = {
    asin: payload.asin || payload.productId || null,
    productId: payload.productId || payload.asin || null,
    url: payload.url || null,
    retailer: payload.retailer || "amazon",
    pageReviewContext: payload.pageReviewContext || null
  };


  const response = await fetch(
    "https://1j22dbprfj.execute-api.us-east-2.amazonaws.com/dev/tuffy-review-intelligence",
    {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify(reviewPayload)
    }
  );

  const raw = await response.json();

  let data = raw;
  if (raw && typeof raw.body === "string") {
    data = JSON.parse(raw.body);
  }

  if (!response.ok || data?.meta?.ok === false) {
    console.error('Review API failed:', {
      status: response.status,
      statusText: response.statusText,
      data
    });

    throw new Error(
      data?.message ||
      data?.error ||
      data?.details ||
      `Review API failed (${response.status})`
    );
  }

  return data;
}

// Sellers-tab mock comparison helpers

function hashString(input) {
  const str = String(input || '');
  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function formatMoney(value) {
  if (value == null || Number.isNaN(value)) return '$--';
  return `$${Number(value).toFixed(2)}`;
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Long marketplace titles break other retailers’ search (Target errors, Newegg 404-ish pages, noisy BB SERPs).
 */
function compactSearchQuery(productName) {
  let s = decodeHtmlEntities(productName).replace(/\s+/g, ' ').trim();
  if (!s) return '';

  let head = s.split(/\s*\|\s*/)[0].trim();
  const dashParts = head.split(/\s+-\s+/);
  if (dashParts.length > 1 && dashParts[0].length >= 12) {
    head = dashParts[0].trim();
  }

  const words = head.split(/\s+/).filter(Boolean);
  const MAX_WORDS = 8;
  let out = words.length > MAX_WORDS ? words.slice(0, MAX_WORDS).join(' ') : head;

  const MAX_CHARS = 64;
  if (out.length > MAX_CHARS) {
    out = out.slice(0, MAX_CHARS);
    const lastSpace = out.lastIndexOf(' ');
    if (lastSpace >= 12) out = out.slice(0, lastSpace);
  }

  if (!/\s/.test(out) && out.length > 48) {
    out = out.slice(0, 48);
  }

  return out.trim();
}

function buildRetailerUrl(retailer, asin, productName) {
  const compact = compactSearchQuery(productName);
  const query = encodeURIComponent(compact);

  if (retailer === 'amazon') {
    if (asin) {
      return `https://www.amazon.com/dp/${encodeURIComponent(asin)}`;
    }
    return query ? `https://www.amazon.com/s?k=${query}` : null;
  }

  if (retailer === 'walmart') {
    return query ? `https://www.walmart.com/search?q=${query}` : 'https://www.walmart.com/';
  }

  if (retailer === 'ebay') {
    return query ? `https://www.ebay.com/sch/i.html?_nkw=${query}` : 'https://www.ebay.com/';
  }

  if (retailer === 'target') {
    if (!compact) return 'https://www.target.com/';
    // Target’s real SERPs use …/s/term+term+… (canonical). The ?searchTerm= form often breaks in normal Chrome/extension navigation even when server-side fetches succeed.
    const segment = encodeURIComponent(compact).replace(/%20/g, '+');
    return `https://www.target.com/s/${segment}`;
  }

  if (retailer === 'bestbuy') {
    return query ? `https://www.bestbuy.com/site/searchpage.jsp?st=${query}` : 'https://www.bestbuy.com/';
  }

  if (retailer === 'newegg') {
    return query ? `https://www.newegg.com/p/pl?d=${query}` : 'https://www.newegg.com/';
  }

  return null;
}

function fallbackListing(retailerKey, productName, asin) {
  const label = retailerLabel(retailerKey);
  return {
    retailer: retailerKey,
    label,
    price: null,
    sellerName: 'Unknown',
    url: buildRetailerUrl(retailerKey, asin, productName),
    source: 'fallback',
  };
}

async function fetchWalmartPublicListing(productName) {
  const query = compactSearchQuery(productName);
  if (!query) return fallbackListing('walmart', productName, null);

  const response = await fetch(`https://www.walmart.com/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) return fallbackListing('walmart', productName, null);

  const html = await response.text();
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!nextDataMatch) return fallbackListing('walmart', productName, null);

  let nextData = null;
  try {
    nextData = JSON.parse(nextDataMatch[1]);
  } catch (_) {
    return fallbackListing('walmart', productName, null);
  }

  function findFirstProduct(node, depth) {
    if (!node || depth <= 0) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = findFirstProduct(item, depth - 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof node !== 'object') return null;

    const looksLikeProduct =
      typeof node.name === 'string' &&
      (typeof node.productPageUrl === 'string' || typeof node.canonicalUrl === 'string' || typeof node.usItemId === 'string');
    if (looksLikeProduct) return node;

    for (const value of Object.values(node)) {
      const found = findFirstProduct(value, depth - 1);
      if (found) return found;
    }
    return null;
  }

  const product = findFirstProduct(nextData, 24);
  if (!product) return fallbackListing('walmart', productName, null);

  const rawUrl = product.productPageUrl || product.canonicalUrl || (product.usItemId ? `/ip/${product.usItemId}` : null);
  const url = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `https://www.walmart.com${rawUrl}`) : null;
  const price =
    product.priceInfo?.currentPrice?.price ??
    product.primaryOffer?.offerPrice ??
    product.price ??
    null;

  return {
    retailer: 'walmart',
    label: 'Walmart',
    price: typeof price === 'number' ? roundMoney(price) : null,
    sellerName: product.primaryOffer?.sellerName || product.sellerName || 'Walmart seller',
    url,
    source: 'public',
  };
}

async function fetchEbayPublicListing(productName) {
  const query = compactSearchQuery(productName);
  if (!query) return fallbackListing('ebay', productName, null);

  const response = await fetch(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`);
  if (!response.ok) return fallbackListing('ebay', productName, null);

  const html = await response.text();
  const block = html.match(/<li[^>]*class="[^"]*s-item[^"]*"[\s\S]*?<\/li>/i)?.[0];
  if (!block) return fallbackListing('ebay', productName, null);

  const priceMatch = block.match(/s-item__price[^>]*>\s*\$([\d,]+(?:\.\d{2})?)/i);
  const urlMatch = block.match(/<a[^>]+class="[^"]*s-item__link[^"]*"[^>]+href="([^"]+)"/i);
  const sellerMatch = block.match(/s-item__seller-info-text[^>]*>([\s\S]*?)<\/span>/i);

  return {
    retailer: 'ebay',
    label: 'eBay',
    price: priceMatch ? roundMoney(parseFloat(priceMatch[1].replace(/,/g, ''))) : null,
    sellerName: decodeHtmlEntities((sellerMatch?.[1] || 'Marketplace seller').replace(/<[^>]+>/g, ' ')),
    url: urlMatch ? decodeHtmlEntities(urlMatch[1]) : buildRetailerUrl('ebay', null, productName),
    source: 'public',
  };
}

async function fetchTargetListingStatus(productName) {
  const query = compactSearchQuery(productName);
  if (!query) {
    return { found: false, url: null };
  }

  const url = buildRetailerUrl('target', null, productName);
  if (!url) {
    return { found: false, url: null };
  }

  const response = await fetch(url);
  if (!response.ok) {
    return { found: false, url: null };
  }

  const html = (await response.text()).toLowerCase();
  const clearlyUnavailable =
    html.includes("we're sorry! this page is currently unavailable") ||
    html.includes('page is currently unavailable') ||
    html.includes("we couldn't find what you're looking for") ||
    html.includes('0 results');

  return {
    found: !clearlyUnavailable,
    url: clearlyUnavailable ? null : url,
  };
}

function parseUsdFromHtmlFragments(html, patterns) {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1] != null) {
      const n = parseFloat(String(m[1]).replace(/,/g, ''));
      if (!Number.isNaN(n) && n > 0 && n < 500_000) return roundMoney(n);
    }
  }
  return null;
}

/** Best-effort: Best Buy varies by bot protection; falls back to mock in the comparison merge. */
async function fetchBestBuyPublicListing(productName) {
  const query = compactSearchQuery(productName);
  if (!query) return fallbackListing('bestbuy', productName, null);

  const response = await fetch(`https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(query)}`);
  if (!response.ok) return fallbackListing('bestbuy', productName, null);

  const html = await response.text();
  const price = parseUsdFromHtmlFragments(html, [
    /"customerPrice"\s*:\s*([\d.]+)/,
    /"salePrice"\s*:\s*([\d.]+)/,
    /"skuPrice"\s*:\s*"?\$([\d,.]+)"?/,
    /data-testid="price-block"[\s\S]{0,200}?\$\s*([\d,.]+\.\d{2})/i,
    /pricing-price[^>]*>\s*\$\s*([\d,.]+\.\d{2})/i,
  ]);

  let url = buildRetailerUrl('bestbuy', null, productName);
  const pathMatch =
    html.match(/href="(\/site\/[^"]+-p\d+\.p[^\s"]*skuId=\d+)/i)?.[1] ||
    html.match(/href="(\/site\/[^"]+\.p\?[^\s"]*skuId=\d+)/i)?.[1];
  if (pathMatch) {
    url = `https://www.bestbuy.com${pathMatch}`;
  }

  if (price == null) return fallbackListing('bestbuy', productName, null);

  return {
    retailer: 'bestbuy',
    label: 'Best Buy',
    price,
    sellerName: 'Best Buy',
    url,
    source: 'public',
  };
}

async function fetchNeweggPublicListing(productName) {
  const query = compactSearchQuery(productName);
  if (!query) return fallbackListing('newegg', productName, null);

  const response = await fetch(`https://www.newegg.com/p/pl?d=${encodeURIComponent(query)}`);
  if (!response.ok) return fallbackListing('newegg', productName, null);

  const html = await response.text();
  const pi = html.indexOf('price-current');
  if (pi === -1) return fallbackListing('newegg', productName, null);

  const slice = `${html.slice(Math.max(0, pi - 20000), pi + 400)}`;

  let url = buildRetailerUrl('newegg', null, productName);
  const hrefMatches = [...slice.matchAll(/href="(https:\/\/www\.newegg\.com\/[^"]+)"/gi)];
  for (let i = hrefMatches.length - 1; i >= 0; i -= 1) {
    const href = decodeHtmlEntities(hrefMatches[i][1].replace(/&amp;/g, '&'));
    if (href.includes('/p/pl')) continue;
    if (href.includes('page=')) continue;
    if (!href.includes('/p/')) continue;
    url = href.split('#')[0];
    break;
  }

  const priceMatch = html.slice(pi, pi + 220).match(/<strong>\s*([\d,.]+)\s*<\/strong>\s*<sup>\s*\.(\d{2})\s*<\/sup>/);
  let price = null;
  if (priceMatch) {
    price = roundMoney(parseFloat(`${priceMatch[1].replace(/,/g, '')}.${priceMatch[2]}`));
  }

  let sellerName = 'Newegg';
  const sellMatch = html.slice(pi - 3500, pi + 3500).match(/item-sellers[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/);
  if (sellMatch) {
    const s = decodeHtmlEntities(sellMatch[1].replace(/<[^>]+>/g, ' ')).trim();
    if (s.length >= 4 && s.length < 140) sellerName = s;
  }

  if (price == null) return fallbackListing('newegg', productName, null);

  return {
    retailer: 'newegg',
    label: 'Newegg',
    price,
    sellerName,
    url,
    source: 'public',
  };
}

async function buildRetailerComparison({ retailer, productName, asin, currentPrice }) {
  const base = Number(currentPrice) || 29.99;
  const seed = hashString(`${retailer}|${productName}|${asin}|${base}`);

  const offsets = {};
  COMPARISON_RETAILERS.forEach((site, i) => {
    offsets[site] = retailer === site ? 0 : mockPriceOffset(seed, 2 + i * 4, 100 + i * 80);
  });

  const prices = {};
  COMPARISON_RETAILERS.forEach((site) => {
    prices[site] = retailer === site ? base : roundMoney(Math.max(1, base + offsets[site]));
  });

  const retailerNames = {};
  COMPARISON_RETAILERS.forEach((site) => {
    retailerNames[site] =
      retailer === site
        ? `Current ${retailerLabel(site)} seller`
        : `Estimated ${retailerLabel(site)} listing`;
  });

  const retailers = COMPARISON_RETAILERS.map((site) => ({
    retailer: site,
    label: retailerLabel(site),
    price: prices[site],
    priceDisplay: formatMoney(prices[site]),
    sellerName: retailerNames[site],
    isCurrentRetailer: retailer === site,
    source: retailer === site ? 'page' : 'mock',
    url: buildRetailerUrl(site, asin, productName),
  }));

  // Free best-effort public lookups for non-current sites.
  const [walmartLive, ebayLive, targetStatus, bestbuyLive, neweggLive] = await Promise.all([
    retailer === 'walmart'
      ? Promise.resolve(null)
      : fetchWalmartPublicListing(productName).catch(() => null),
    retailer === 'ebay'
      ? Promise.resolve(null)
      : fetchEbayPublicListing(productName).catch(() => null),
    retailer === 'target'
      ? Promise.resolve(null)
      : fetchTargetListingStatus(productName).catch(() => null),
    retailer === 'bestbuy'
      ? Promise.resolve(null)
      : fetchBestBuyPublicListing(productName).catch(() => null),
    retailer === 'newegg'
      ? Promise.resolve(null)
      : fetchNeweggPublicListing(productName).catch(() => null),
  ]);

  retailers.forEach((row) => {
    if (row.retailer === 'walmart' && walmartLive?.price != null) {
      row.price = walmartLive.price;
      row.priceDisplay = formatMoney(walmartLive.price);
      row.sellerName = walmartLive.sellerName || row.sellerName;
      row.url = walmartLive.url || row.url;
      row.source = walmartLive.source || row.source;
    }
    if (row.retailer === 'ebay' && ebayLive?.price != null) {
      row.price = ebayLive.price;
      row.priceDisplay = formatMoney(ebayLive.price);
      row.sellerName = ebayLive.sellerName || row.sellerName;
      row.url = ebayLive.url || row.url;
      row.source = ebayLive.source || row.source;
    }
    if (row.retailer === 'target' && targetStatus?.found === false) {
      row.price = null;
      row.priceDisplay = '$--';
      row.sellerName = 'Product not found';
      row.url = null;
      row.source = 'not_found';
      row.notFound = true;
    }
    if (row.retailer === 'bestbuy' && bestbuyLive?.price != null) {
      row.price = bestbuyLive.price;
      row.priceDisplay = formatMoney(bestbuyLive.price);
      row.sellerName = bestbuyLive.sellerName || row.sellerName;
      row.url = bestbuyLive.url || row.url;
      row.source = bestbuyLive.source || row.source;
    }
    if (row.retailer === 'newegg' && neweggLive?.price != null) {
      row.price = neweggLive.price;
      row.priceDisplay = formatMoney(neweggLive.price);
      row.sellerName = neweggLive.sellerName || row.sellerName;
      row.url = neweggLive.url || row.url;
      row.source = neweggLive.source || row.source;
    }
  });

  const currentRow = retailers.find((r) => r.isCurrentRetailer) || null;

  let bestRow = null;
  retailers.forEach((row) => {
    if (row.price == null) return;
    if (!bestRow || row.price < bestRow.price) bestRow = row;
  });

  retailers.forEach((row) => {
    row.isBestPrice = row.retailer === bestRow?.retailer;

    if (currentRow && currentRow.price != null && row.price != null) {
      row.differenceFromCurrent = roundMoney(row.price - currentRow.price);
      row.differenceFromCurrentDisplay = formatMoney(Math.abs(row.differenceFromCurrent));
      row.isCheaperThanCurrent = row.differenceFromCurrent < 0;
      row.isMoreExpensiveThanCurrent = row.differenceFromCurrent > 0;
    } else {
      row.differenceFromCurrent = null;
      row.differenceFromCurrentDisplay = null;
      row.isCheaperThanCurrent = false;
      row.isMoreExpensiveThanCurrent = false;
    }
  });

  return {
    ok: true,
    productName: productName || null,
    asin: asin || null,
    currentRetailer: retailer || null,
    bestRetailer: bestRow?.retailer || null,
    bestPrice: bestRow?.price || null,
    bestPriceDisplay: bestRow?.priceDisplay || '$--',
    retailers,
    meta: {
      source: 'hybrid',
      note:
        'Current retailer uses the active tab price when available. Walmart, eBay, Best Buy (when reachable), and Newegg may refresh from search pages. If Target search cannot resolve the item, it is marked "Product not found". Remaining gaps use mock estimates.',
    },
  };
}

// Message handler

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PAGE_CONTEXT') {
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'LOGIN') {
    (async () => {
      try {
        const result = await startCognitoLogin();

        sendResponse({
          ok: true,
          ...result
        });

      } catch (err) {
        console.error('LOGIN failed:', err);

        sendResponse({
          ok: false,
          error: err?.message || 'Login failed'
        });
      }
    })();

    return true;
  }

  if (message.type === 'FETCH_CROSS_SITE') {
    sendResponse({
      walmart: { reviews: mockWalmartReviews(), source: 'mock' },
      ebay: { reviews: mockEbayReviews(), source: 'mock' },
    });
    return true;
  }

  if (message.type === 'FETCH_PRICE_HISTORY') {
    (async () => {
      try {
        const data = await fetchInsightsByAsin(message.asin);
        sendResponse({ ok: true, data });
      } catch (err) {
        console.error('FETCH_PRICE_HISTORY failed:', err);
        sendResponse({
          ok: false,
          error: err?.message || 'Unknown background fetch error',
        });
      }
    })();

    return true;
  }

  if (message.type === 'FETCH_REVIEW_INTELLIGENCE') {
    (async () => {
      try {
        const data = await fetchReviewIntelligence(message);
        sendResponse({ ok: true, data });
      } catch (err) {
        console.error('FETCH_REVIEW_INTELLIGENCE failed:', err);
        sendResponse({
          ok: false,
          error: err?.message || 'Unknown review intelligence fetch error',
        });
      }
    })();

    return true;
  }

  if (message.type === 'FETCH_COMPETITOR_PRICES') {
    (async () => {
      try {
        const comparison = await buildRetailerComparison({
          retailer: message.retailer,
          productName: message.productName,
          asin: message.asin,
          currentPrice: message.currentPrice,
        });
        sendResponse(comparison);
      } catch (err) {
        console.error('FETCH_COMPETITOR_PRICES failed:', err);
        sendResponse({
          ok: false,
          error: err?.message || 'Failed to build competitor pricing',
        });
      }
    })();

    return true;
  }

  return true;
});