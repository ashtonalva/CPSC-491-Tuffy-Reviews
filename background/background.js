/**
 * Tuffy Reviews – Background service worker
<<<<<<< Updated upstream
 *
 * Handles all outbound API calls. API keys must live here — never in
 * content.js or popup.js, which run in page context and can be inspected.
 *
 * Messages handled:
 *   GET_CROSS_SITE  { productName, retailer }
 *     → Fetches Walmart reviews + eBay listings in parallel for the given
 *       product name, returns { walmart, ebay } results to the popup.
 *
 *   PAGE_CONTEXT    { retailer, url }
 *     → Acknowledged (used for future caching / background refresh).
 *
 * API keys:
 *   Set WALMART_API_KEY and EBAY_CLIENT_ID + EBAY_CLIENT_SECRET directly
 *   in the CONFIG object below before loading the extension.
 *
 *   In production these would be injected at build time via a bundler
 *   (e.g. webpack DefinePlugin) or fetched from your own backend so they
 *   are never committed to source control.
 */

const CONFIG = {
  WALMART_API_KEY:    '',   // ← paste your WalmartLabs key here
  EBAY_CLIENT_ID:     '',   // ← paste your eBay App ID (client_id) here
  EBAY_CLIENT_SECRET: '',   // ← paste your eBay Cert ID (client_secret) here
};

// ── eBay token cache ──────────────────────────────────────────────────────────
// Tokens are valid for 7 200 s (2 h). Cache in memory so we don't mint a new
// one on every popup open. The service worker may be terminated between calls,
// so we also persist to chrome.storage.session (cleared on browser close).

let ebayTokenCache = null;  // { token, expiresAt }

async function getEbayAccessToken() {
  // 1. Memory cache
  if (ebayTokenCache && Date.now() < ebayTokenCache.expiresAt) {
    return ebayTokenCache.token;
  }

  // 2. Session storage (survives service-worker restarts within same session)
  try {
    const stored = await chrome.storage.session.get('ebayToken');
    if (stored.ebayToken && Date.now() < stored.ebayToken.expiresAt) {
      ebayTokenCache = stored.ebayToken;
      return ebayTokenCache.token;
    }
  } catch (_) {}

  // 3. Mint a new token via client credentials grant
  if (!CONFIG.EBAY_CLIENT_ID || !CONFIG.EBAY_CLIENT_SECRET) {
    throw new Error('eBay API credentials not configured in background.js CONFIG.');
  }

  const b64 = btoa(`${CONFIG.EBAY_CLIENT_ID}:${CONFIG.EBAY_CLIENT_SECRET}`);

  const resp = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${b64}`,
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`eBay token error (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const entry = {
    token:     data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,  // 60s safety margin
  };

  // Cache in memory + session storage
  ebayTokenCache = entry;
  try { await chrome.storage.session.set({ ebayToken: entry }); } catch (_) {}

  return entry.token;
}

// ── Walmart Reviews API ───────────────────────────────────────────────────────
// Endpoint: GET http://api.walmartlabs.com/v1/reviews/{itemId}
// We first need to search for the product to get a Walmart item ID, then
// fetch reviews for that item.

async function fetchWalmartData(productName) {
  if (!CONFIG.WALMART_API_KEY) {
    return { error: 'Walmart API key not configured.' };
  }

  try {
    // Step 1: search by product name to get item ID
    const searchUrl = new URL('http://api.walmartlabs.com/v1/search');
    searchUrl.searchParams.set('apiKey', CONFIG.WALMART_API_KEY);
    searchUrl.searchParams.set('query',  productName);
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('numItems', '1');

    const searchResp = await fetch(searchUrl.toString());
    if (!searchResp.ok) throw new Error(`Walmart search ${searchResp.status}`);

    const searchData = await searchResp.json();
    const items = searchData.items || [];
    if (!items.length) return { reviews: [], price: null, productName: null };

    const topItem = items[0];
    const itemId  = topItem.itemId;
    const matchedName = topItem.name;
    const price   = topItem.salePrice ?? topItem.msrp ?? null;

    // Step 2: fetch reviews for that item
    const reviewUrl = new URL(`http://api.walmartlabs.com/v1/reviews/${itemId}`);
    reviewUrl.searchParams.set('apiKey', CONFIG.WALMART_API_KEY);
    reviewUrl.searchParams.set('format', 'json');

    const reviewResp = await fetch(reviewUrl.toString());
    if (!reviewResp.ok) throw new Error(`Walmart reviews ${reviewResp.status}`);

    const reviewData = await reviewResp.json();
    const rawReviews = (reviewData.reviews || []).slice(0, 5);

    const reviews = rawReviews.map((r) => ({
      reviewer: r.reviewer         || 'Walmart Customer',
      rating:   r.overallRating?.rating != null
                  ? parseFloat(r.overallRating.rating) : null,
      date:     r.submissionTime   || null,
      title:    r.title            || null,
      body:     r.reviewText       || null,
      verified: false,
      source:   'Walmart',
    }));

    return { reviews, price, productName: matchedName };

  } catch (err) {
    console.error('[Tuffy] Walmart fetch error:', err);
    return { error: err.message, reviews: [], price: null };
  }
}

// ── eBay Browse API ───────────────────────────────────────────────────────────
// Endpoint: GET https://api.ebay.com/buy/browse/v1/item_summary/search
// Returns item summaries (title, price, seller feedback %).
// eBay doesn't expose individual product reviews via the Browse API —
// we return the top 5 listings as "seller cards" instead.

async function fetchEbayData(productName) {
  if (!CONFIG.EBAY_CLIENT_ID || !CONFIG.EBAY_CLIENT_SECRET) {
    return { error: 'eBay API credentials not configured.' };
  }

  try {
    const token = await getEbayAccessToken();

    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
    url.searchParams.set('q',     productName);
    url.searchParams.set('limit', '5');
    // Only fixed-price (Buy It Now) listings — consistent pricing
    url.searchParams.set('filter', 'buyingOptions:{FIXED_PRICE}');

    const resp = await fetch(url.toString(), {
      headers: {
        'Authorization':   `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type':    'application/json',
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`eBay Browse API ${resp.status}: ${text}`);
    }

    const data  = await resp.json();
    const items = data.itemSummaries || [];

    // Map eBay item summaries to a review-like structure.
    // seller.feedbackPercentage = positive feedback %, feedbackScore = total count.
    const listings = items.map((item) => ({
      title:             item.title,
      price:             item.price?.value ? parseFloat(item.price.value) : null,
      currency:          item.price?.currency || 'USD',
      condition:         item.condition || null,
      seller:            item.seller?.username || null,
      sellerFeedbackPct: item.seller?.feedbackPercentage
                           ? parseFloat(item.seller.feedbackPercentage) : null,
      sellerFeedbackScore: item.seller?.feedbackScore || null,
      itemUrl:           item.itemWebUrl || null,
      thumbnailUrl:      item.thumbnailImages?.[0]?.imageUrl || null,
      source:            'eBay',
    }));

    const lowestPrice = listings.length
      ? Math.min(...listings.map((l) => l.price).filter(Boolean))
      : null;

    return { listings, lowestPrice };

  } catch (err) {
    console.error('[Tuffy] eBay fetch error:', err);
    return { error: err.message, listings: [], lowestPrice: null };
  }
}

// ── Message router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  if (message.type === 'PAGE_CONTEXT') {
    // Acknowledge page context (reserved for future background pre-fetching)
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GET_CROSS_SITE') {
    // Fire Walmart + eBay fetches in parallel, respond when both settle.
    const { productName } = message;

    if (!productName) {
      sendResponse({ error: 'No product name provided.' });
=======
 * Handles:
 * - mock cross-site reviews
 * - backend /insights fetch for price tab
 * - mock competitor price comparison for sellers tab
 */

const INSIGHTS_API_URL =
   "https://1j22dbprfj.execute-api.us-east-2.amazonaws.com/dev/insights";

// Simple in-memory cache for the service worker lifetime

const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheGet(key) {
   const entry = _cache.get(key);
   if (!entry) return null;
   if (Date.now() - entry.ts > CACHE_TTL_MS) {
      _cache.delete(key);
      return null;
   }
   return entry.data;
}

function cacheSet(key, data) {
   _cache.set(key, { data, ts: Date.now() });
}

// Mock review generators

function mockWalmartReviews() {
   return [
      {
         reviewer: "Sandra M.",
         rating: 5,
         date: "January 10, 2025",
         title: "Exactly as described",
         body: "Great product, shipped fast and arrived in perfect condition. Would buy again.",
         verified: true,
         source: "mock",
      },
      {
         reviewer: "DaveInTexas",
         rating: 4,
         date: "February 3, 2025",
         title: "Good value",
         body: "Works as expected. Nothing fancy, but does the job well for the price.",
         verified: true,
         source: "mock",
      },
      {
         reviewer: "Priya K.",
         rating: 3,
         date: "December 18, 2024",
         title: "Decent but not great",
         body: "Packaging was damaged on arrival but the item itself was fine.",
         verified: false,
         source: "mock",
      },
      {
         reviewer: "Mike T.",
         rating: 5,
         date: "March 1, 2025",
         title: "Highly recommend",
         body: "Bought this for my family and everyone loves it. Will definitely purchase again.",
         verified: true,
         source: "mock",
      },
      {
         reviewer: "LisaW",
         rating: 4,
         date: "November 22, 2024",
         title: "Solid purchase",
         body: "Quality feels good and it matches the photos. Delivery was on time.",
         verified: true,
         source: "mock",
      },
   ];
}

function mockEbayReviews() {
   return [
      {
         reviewer: "top_rated_seller99",
         rating: 5,
         date: "February 14, 2025",
         title: "Fast shipping, item as described",
         body: "Seller communicated well. Item arrived quickly and matched the listing exactly.",
         verified: true,
         source: "mock",
      },
      {
         reviewer: "bargain_hunter_bob",
         rating: 4,
         date: "January 29, 2025",
         title: "Good deal",
         body: "Got a better price here than anywhere else. Item is in great shape.",
         verified: true,
         source: "mock",
      },
      {
         reviewer: "jenna_shops",
         rating: 3,
         date: "March 5, 2025",
         title: "OK, but took long",
         body: "Item is fine but shipping took two weeks. Seller did respond to my messages.",
         verified: false,
         source: "mock",
      },
      {
         reviewer: "tech_deals_2024",
         rating: 5,
         date: "December 30, 2024",
         title: "Perfect condition",
         body: "Exactly as listed. Seller packed it well and it arrived without any damage.",
         verified: true,
         source: "mock",
      },
      {
         reviewer: "maria_g_buys",
         rating: 4,
         date: "February 20, 2025",
         title: "Happy with purchase",
         body: "Good seller, prompt shipping. Item works perfectly out of the box.",
         verified: true,
         source: "mock",
      },
   ];
}

// Backend price fetch

async function fetchInsightsByAsin(asin) {
   if (!asin) {
      throw new Error("Missing ASIN");
   }

   const response = await fetch(INSIGHTS_API_URL, {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
      },
      body: JSON.stringify({
         retailer: "amazon",
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
      throw new Error(
         data?.error || "Insights API returned an unsuccessful response",
      );
   }

   return data;
}

// Sellers-tab mock comparison helpers

function hashString(input) {
   const str = String(input || "");
   let hash = 0;

   for (let i = 0; i < str.length; i += 1) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
   }

   return Math.abs(hash);
}

function roundMoney(value) {
   return Math.round(Number(value) * 100) / 100;
}

function formatMoney(value) {
   if (value == null || Number.isNaN(value)) return "$--";
   return `$${Number(value).toFixed(2)}`;
}

function buildRetailerUrl(retailer, asin, productName) {
   const query = encodeURIComponent(productName || "");

   if (retailer === "amazon") {
      if (asin) {
         return `https://www.amazon.com/dp/${encodeURIComponent(asin)}`;
      }
      return query ? `https://www.amazon.com/s?k=${query}` : null;
   }

   if (retailer === "walmart") {
      return query
         ? `https://www.walmart.com/search?q=${query}`
         : "https://www.walmart.com/";
   }

   if (retailer === "ebay") {
      return query
         ? `https://www.ebay.com/sch/i.html?_nkw=${query}`
         : "https://www.ebay.com/";
   }

   return null;
}

function buildMockRetailerComparison({
   retailer,
   productName,
   asin,
   currentPrice,
}) {
   const base = Number(currentPrice) || 29.99;
   const seed = hashString(`${retailer}|${productName}|${asin}|${base}`);

   const amazonOffset = ((seed % 300) - 150) / 100;
   const walmartOffset = (((seed >> 3) % 500) - 250) / 100;
   const ebayOffset = (((seed >> 5) % 700) - 350) / 100;

   const prices = {
      amazon:
         retailer === "amazon"
            ? base
            : roundMoney(Math.max(1, base + amazonOffset)),
      walmart:
         retailer === "walmart"
            ? base
            : roundMoney(Math.max(1, base + walmartOffset)),
      ebay:
         retailer === "ebay"
            ? base
            : roundMoney(Math.max(1, base + ebayOffset)),
   };

   const sellerNames = {
      amazon:
         retailer === "amazon"
            ? "Current Amazon seller"
            : "Estimated Amazon listing",
      walmart:
         retailer === "walmart"
            ? "Current Walmart seller"
            : "Estimated Walmart seller",
      ebay:
         retailer === "ebay" ? "Current eBay seller" : "Estimated eBay seller",
   };

   const retailers = ["amazon", "walmart", "ebay"].map((site) => ({
      retailer: site,
      label:
         site === "amazon" ? "Amazon" : site === "walmart" ? "Walmart" : "eBay",
      price: prices[site],
      priceDisplay: formatMoney(prices[site]),
      sellerName: sellerNames[site],
      isCurrentRetailer: retailer === site,
      source: retailer === site ? "page" : "mock",
      url: buildRetailerUrl(site, asin, productName),
   }));

   const currentRow = retailers.find((r) => r.isCurrentRetailer) || null;

   let bestRow = null;
   retailers.forEach((row) => {
      if (!bestRow || row.price < bestRow.price) bestRow = row;
   });

   retailers.forEach((row) => {
      row.isBestPrice = row.retailer === bestRow?.retailer;

      if (currentRow) {
         row.differenceFromCurrent = roundMoney(row.price - currentRow.price);
         row.differenceFromCurrentDisplay = formatMoney(
            Math.abs(row.differenceFromCurrent),
         );
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
      bestPriceDisplay: bestRow?.priceDisplay || "$--",
      retailers,
      meta: {
         source: "mock",
         note: "Cross-retailer comparison is currently mock/estimated except for the active page retailer.",
      },
   };
}

// Message handler

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
   if (message.type === "PAGE_CONTEXT") {
      sendResponse({ ok: true });
>>>>>>> Stashed changes
      return true;
   }

<<<<<<< Updated upstream
    Promise.all([
      fetchWalmartData(productName),
      fetchEbayData(productName),
    ]).then(([walmart, ebay]) => {
      sendResponse({ walmart, ebay });
    }).catch((err) => {
      sendResponse({ error: err.message });
    });

    return true;  // keep message channel open for async response
  }
=======
   if (message.type === "FETCH_CROSS_SITE") {
      const cacheKey = `cross:${message.asin || message.productName || ""}`;
      const cached = cacheGet(cacheKey);
      if (cached) {
         sendResponse(cached);
         return true;
      }
      const result = {
         walmart: { reviews: mockWalmartReviews(), source: "mock" },
         ebay: { reviews: mockEbayReviews(), source: "mock" },
      };
      cacheSet(cacheKey, result);
      sendResponse(result);
      return true;
   }

   if (message.type === "FETCH_SELLER_HISTORY") {
      // TODO: replace with real seller count history API call
      sendResponse({ points: [] });
      return true;
   }

   if (message.type === "FETCH_PRICE_HISTORY") {
      (async () => {
         try {
            const data = await fetchInsightsByAsin(message.asin);
            sendResponse({ ok: true, data });
         } catch (err) {
            console.error("FETCH_PRICE_HISTORY failed:", err);
            sendResponse({
               ok: false,
               error: err?.message || "Unknown background fetch error",
            });
         }
      })();

      return true;
   }

   if (message.type === "FETCH_COMPETITOR_PRICES") {
      try {
         const comparison = buildMockRetailerComparison({
            retailer: message.retailer,
            productName: message.productName,
            asin: message.asin,
            currentPrice: message.currentPrice,
         });

         sendResponse(comparison);
      } catch (err) {
         console.error("FETCH_COMPETITOR_PRICES failed:", err);
         sendResponse({
            ok: false,
            error: err?.message || "Failed to build competitor pricing",
         });
      }

      return true;
   }

   return true;
>>>>>>> Stashed changes
});
