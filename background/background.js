/**
 * Tuffy Reviews – Background service worker
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
      return true;
    }

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
});
