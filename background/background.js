/**
 * Tuffy Reviews – Background service worker
 * Handles:
 * - mock cross-site reviews
 * - backend /insights fetch for price tab
 * - mock competitor price comparison for sellers tab
 */

const INSIGHTS_API_URL = 'https://1j22dbprfj.execute-api.us-east-2.amazonaws.com/dev/insights';

// Mock review generators

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

// Backend price fetch

async function fetchInsightsByAsin(asin) {
  if (!asin) {
    throw new Error('Missing ASIN');
  }

  const response = await fetch(INSIGHTS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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

function buildRetailerUrl(retailer, asin, productName) {
  const query = encodeURIComponent(productName || '');

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

  return null;
}

function buildMockRetailerComparison({ retailer, productName, asin, currentPrice }) {
  const base = Number(currentPrice) || 29.99;
  const seed = hashString(`${retailer}|${productName}|${asin}|${base}`);

  const amazonOffset = ((seed % 300) - 150) / 100;
  const walmartOffset = (((seed >> 3) % 500) - 250) / 100;
  const ebayOffset = (((seed >> 5) % 700) - 350) / 100;

  const prices = {
    amazon: retailer === 'amazon' ? base : roundMoney(Math.max(1, base + amazonOffset)),
    walmart: retailer === 'walmart' ? base : roundMoney(Math.max(1, base + walmartOffset)),
    ebay: retailer === 'ebay' ? base : roundMoney(Math.max(1, base + ebayOffset)),
  };

  const sellerNames = {
    amazon: retailer === 'amazon' ? 'Current Amazon seller' : 'Estimated Amazon listing',
    walmart: retailer === 'walmart' ? 'Current Walmart seller' : 'Estimated Walmart seller',
    ebay: retailer === 'ebay' ? 'Current eBay seller' : 'Estimated eBay seller',
  };

  const retailers = ['amazon', 'walmart', 'ebay'].map((site) => ({
    retailer: site,
    label: site === 'amazon' ? 'Amazon' : site === 'walmart' ? 'Walmart' : 'eBay',
    price: prices[site],
    priceDisplay: formatMoney(prices[site]),
    sellerName: sellerNames[site],
    isCurrentRetailer: retailer === site,
    source: retailer === site ? 'page' : 'mock',
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
      source: 'mock',
      note: 'Cross-retailer comparison is currently mock/estimated except for the active page retailer.',
    },
  };
}

// Message handler

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PAGE_CONTEXT') {
    sendResponse({ ok: true });
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

  if (message.type === 'FETCH_COMPETITOR_PRICES') {
    try {
      const comparison = buildMockRetailerComparison({
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

    return true;
  }

  return true;
});