/**
 * Tuffy Reviews – Background service worker
 * Handles messages from popup/content, API orchestration, and caching (later).
 */

// ── Mock review generators ────────────────────────────────────────────────────

function mockWalmartReviews() {
  return [
    { reviewer: 'Sandra M.', rating: 5, date: 'January 10, 2025', title: 'Exactly as described', body: 'Great product, shipped fast and arrived in perfect condition. Would buy again.', verified: true, source: 'mock' },
    { reviewer: 'DaveInTexas', rating: 4, date: 'February 3, 2025', title: 'Good value', body: 'Works as expected. Nothing fancy, but does the job well for the price.', verified: true, source: 'mock' },
    { reviewer: 'Priya K.', rating: 3, date: 'December 18, 2024', title: 'Decent but not great', body: 'Packaging was damaged on arrival but the item itself was fine.', verified: false, source: 'mock' },
    { reviewer: 'Mike T.', rating: 5, date: 'March 1, 2025', title: 'Highly recommend', body: 'Bought this for my family and everyone loves it. Will definitely purchase again.', verified: true, source: 'mock' },
    { reviewer: 'LisaW', rating: 4, date: 'November 22, 2024', title: 'Solid purchase', body: 'Quality feels good and it matches the photos. Delivery was on time.', verified: true, source: 'mock' },
  ];
}

function mockEbayReviews() {
  return [
    { reviewer: 'top_rated_seller99', rating: 5, date: 'February 14, 2025', title: 'Fast shipping, item as described', body: 'Seller communicated well. Item arrived quickly and matched the listing exactly.', verified: true, source: 'mock' },
    { reviewer: 'bargain_hunter_bob', rating: 4, date: 'January 29, 2025', title: 'Good deal', body: 'Got a better price here than anywhere else. Item is in great shape.', verified: true, source: 'mock' },
    { reviewer: 'jenna_shops', rating: 3, date: 'March 5, 2025', title: 'OK, but took long', body: 'Item is fine but shipping took two weeks. Seller did respond to my messages.', verified: false, source: 'mock' },
    { reviewer: 'tech_deals_2024', rating: 5, date: 'December 30, 2024', title: 'Perfect condition', body: 'Exactly as listed. Seller packed it well and it arrived without any damage.', verified: true, source: 'mock' },
    { reviewer: 'maria_g_buys', rating: 4, date: 'February 20, 2025', title: 'Happy with purchase', body: 'Good seller, prompt shipping. Item works perfectly out of the box.', verified: true, source: 'mock' },
  ];
}

// ── Keepa price history helpers ──────────────────────────────────────────────

const KEEPA_EPOCH_MS = Date.UTC(2011, 0, 1, 0, 0, 0, 0);
const KEEP_DOMAIN_ID_US = 1;

function toKeepaDate(keepaMinutes) {
  return new Date(KEEPA_EPOCH_MS + keepaMinutes * 60 * 1000);
}

function parseKeepaPriceCsv(csv) {
  if (!Array.isArray(csv) || csv.length < 2) return [];

  const points = [];
  for (let i = 0; i < csv.length - 1; i += 2) {
    const keepaMinutes = csv[i];
    const cents = csv[i + 1];
    if (!Number.isFinite(keepaMinutes) || !Number.isFinite(cents)) continue;
    if (cents <= 0) continue;

    points.push({
      date: toKeepaDate(keepaMinutes),
      price: cents / 100,
    });
  }

  return points.sort((a, b) => a.date - b.date);
}

function collapseDaily(points) {
  if (!points.length) return [];

  const byDay = new Map();
  points.forEach((point) => {
    const day = point.date.toISOString().slice(0, 10);
    byDay.set(day, {
      date: day,
      price: Math.round(point.price * 100) / 100,
    });
  });

  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function keepRecentDays(points, days) {
  if (!points.length) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return points.filter((p) => new Date(p.date) >= cutoff);
}

async function fetchKeepaHistory(asin, days) {
  const { keepaApiKey } = await chrome.storage.local.get(['keepaApiKey']);
  if (!keepaApiKey) {
    return { ok: false, reason: 'missing_key', points: [] };
  }

  const query = new URLSearchParams({
    key: keepaApiKey,
    domain: String(KEEP_DOMAIN_ID_US),
    asin,
    history: '1',
  });

  const res = await fetch(`https://api.keepa.com/product?${query.toString()}`);
  if (!res.ok) {
    return { ok: false, reason: `http_${res.status}`, points: [] };
  }

  const data = await res.json();
  if (!Array.isArray(data?.products) || !data.products.length) {
    return { ok: false, reason: 'no_product', points: [] };
  }

  const product = data.products[0];
  // Keepa index 1 is Amazon "new" offer history (in cents), interleaved [time,value,...].
  const parsed = parseKeepaPriceCsv(product?.csv?.[1]);
  const daily = collapseDaily(parsed);
  const recent = keepRecentDays(daily, days);

  return { ok: true, points: recent };
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PAGE_CONTEXT') {
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'FETCH_CROSS_SITE') {
    // TODO: replace with real Walmart/eBay API calls using message.productName / message.asin
    sendResponse({
      walmart: { reviews: mockWalmartReviews(), source: 'mock' },
      ebay:    { reviews: mockEbayReviews(),    source: 'mock' },
    });
    return true;
  }

  if (message.type === 'FETCH_PRICE_HISTORY') {
    const asin = String(message.asin || '').trim();
    const days = Number.isFinite(message.days) ? Math.max(30, Math.min(365, message.days)) : 90;

    if (!asin) {
      sendResponse({ points: [], source: 'none', reason: 'missing_asin' });
      return true;
    }

    fetchKeepaHistory(asin, days)
      .then((result) => {
        if (result.ok) {
          sendResponse({ points: result.points, source: 'keepa' });
          return;
        }
        sendResponse({ points: [], source: 'mock', reason: result.reason });
      })
      .catch(() => {
        sendResponse({ points: [], source: 'mock', reason: 'request_failed' });
      });

    return true;
  }

  return true; // keep channel open for async sendResponse
});
