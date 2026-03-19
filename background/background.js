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

  return true; // keep channel open for async sendResponse
});
