/**
 * Tuffy Reviews – Content script
 * Runs on Amazon, Walmart, eBay product pages.
 * Handles GET_REVIEWS, GET_PRICE, and GET_CONTEXT messages from the popup.
 */

(function () {
  const host = window.location.hostname;

  // Retailer detection

  function getRetailer() {
    if (host.includes('amazon.com'))  return 'amazon';
    if (host.includes('walmart.com')) return 'walmart';
    if (host.includes('ebay.com'))    return 'ebay';
    return null;
  }

  // Shared helpers

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsText(selector, root) {
    const el = qs(selector, root);
    return el ? el.textContent.trim() : null;
  }

  function parsePrice(raw) {
    if (!raw) return null;
    const match = raw.match(/([\d,]+\.?\d*)/);
    return match ? parseFloat(match[1].replace(/,/g, '')) : null;
  }

  // Product context (name + UPC for cross-site matching)

  function readAmazonContext() {
    // Product title
    const name = qsText('#productTitle') ||
                 qsText('h1.product-title-word-break');

    // ASIN from URL
    const asinMatch = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
    const asin = asinMatch ? asinMatch[1] : null;

    // UPC lives in the product details table — try multiple locations
    // Amazon renders these as: <th>UPC</th><td>012345678901</td>
    let upc = null;

    const detailRows = document.querySelectorAll(
      '#productDetails_techSpec_section_1 tr, ' +
      '#productDetails_detailBullets_sections1 tr, ' +
      '#detailBullets_feature_div li, ' +
      '.prodDetTable tr'
    );

    detailRows.forEach((row) => {
      if (upc) return;
      const text = row.textContent;
      // Match "UPC" or "EAN" label followed by the barcode value
      const upcMatch = text.match(/(?:UPC|EAN)[:\s]+(\d{8,14})/i);
      if (upcMatch) upc = upcMatch[1].replace(/\s/g, '');
    });

    return { retailer: 'amazon', name: name?.trim() || null, asin, upc };
  }

  function readWalmartContext() {
    try {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el) return { retailer: 'walmart', name: null, upc: null };
      const data = JSON.parse(el.textContent);
      const product = data?.props?.pageProps?.initialData?.data?.product || {};
      return {
        retailer: 'walmart',
        name: product.name || null,
        upc:  product.upc || null,
      };
    } catch (_) {
      return { retailer: 'walmart', name: null, upc: null };
    }
  }

  function readEbayContext() {
    const name = qsText('.x-item-title__mainTitle .ux-textspans--BOLD') ||
                 qsText('h1.x-item-title');
    // eBay item ID from URL
    const itemMatch = window.location.pathname.match(/\/itm\/(\d+)/);
    return {
      retailer: 'ebay',
      name: name?.trim() || null,
      itemId: itemMatch ? itemMatch[1] : null,
    };
  }

  const CONTEXT_READERS = {
    amazon:  readAmazonContext,
    walmart: readWalmartContext,
    ebay:    readEbayContext,
  };

  // Amazon readers

  function readAmazonReviews() {
    const cards = document.querySelectorAll(
      '#cm-cr-dp-review-list [data-hook="review"]'
    );
    if (!cards.length) return [];

    const reviews = [];
    cards.forEach((card) => {
      if (reviews.length >= 5) return;
      try {
        const ratingRaw =
          qsText('i[data-hook="review-star-rating"] span.a-icon-alt', card) ||
          qsText('i[data-hook="cmps-review-star-rating"] span.a-icon-alt', card);
        const ratingMatch = (ratingRaw || '').match(/([\d.]+)\s+out\s+of/);
        const dateRaw = qsText('span[data-hook="review-date"]', card);
        const bodyEl  = card.querySelector('span[data-hook="review-body"] span');

        reviews.push({
          reviewer: qsText('.a-profile-name', card) || 'Anonymous',
          rating:   ratingMatch ? parseFloat(ratingMatch[1]) : null,
          date:     dateRaw ? dateRaw.replace(/Reviewed in .+ on /i, '').trim() : null,
          title:    qsText('[data-hook="review-title"] span:not([class])', card),
          body:     bodyEl ? bodyEl.textContent.trim() : null,
          verified: !!card.querySelector('[data-hook="avp-badge"]'),
          source:   'Amazon',
        });
      } catch (_) {}
    });
    return reviews;
  }

  // Extract Amazon "Customers say" block (text after heading, before "Select to learn more").
  // Also deduplicates the AI attribution line, if Amazon repeats it.
  function readAmazonCustomersSay() {
    const customersRe = /customers\s+say/i;
    const learnMoreRe = /select\s+to\s+learn\s+more/i;

    // Find an element whose visible text is exactly "Customers say" (preferred)
    // or starts with it (fallback).
    const headingEl =
      Array.from(document.querySelectorAll('h1,h2,h3,h4,span,div,section')).find((el) => {
        const t = el.textContent ? el.textContent.trim() : '';
        return t && customersRe.test(t) && t.toLowerCase() === 'customers say';
      }) ||
      Array.from(document.querySelectorAll('h1,h2,h3,h4,span,div,section')).find((el) => {
        const t = el.textContent ? el.textContent.trim() : '';
        return t && customersRe.test(t) && t.toLowerCase().startsWith('customers say');
      });

    if (!headingEl) return null;

    // Pick the smallest ancestor that still contains both markers.
    let container = null;
    let containerLen = Infinity;
    for (let el = headingEl; el && el !== document.documentElement; el = el.parentElement) {
      const txt = el.innerText ? el.innerText.trim() : '';
      if (!txt) continue;
      if (!customersRe.test(txt) || !learnMoreRe.test(txt)) continue;
      if (txt.length < containerLen) {
        container = el;
        containerLen = txt.length;
      }
    }

    if (!container) return null;

    const full = container.innerText || '';
    const lower = full.toLowerCase();
    const start = lower.indexOf('customers say');
    if (start < 0) return null;

    const afterHeading = start + 'customers say'.length;
    const end = lower.indexOf('select to learn more', afterHeading);

    const extracted = end >= 0 ? full.slice(afterHeading, end) : full.slice(afterHeading);

    let cleaned = extracted.replace(/^\s*[:\-–—]?\s*/, '').trim();

    // Deduplicate "AI Generated from the text of customer reviews" if repeated.
    const aiPhraseRe = /ai\s+generated\s+from\s+the\s+text\s+of\s+customer\s+reviews/i;
    let firstAiSeen = false;
    cleaned = cleaned.replace(aiPhraseRe, () => {
      if (firstAiSeen) return '';
      firstAiSeen = true;
      return 'AI Generated from the text of customer reviews';
    }).trim();

    return cleaned || null;
  }

  function readAmazonPrice() {
    const selectors = [
      'span.priceToPay .a-offscreen', 'span.priceToPay',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      '#apex_offerDisplay_desktop .a-price .a-offscreen',
      '#price_inside_buybox', '#priceblock_ourprice', '#priceblock_dealprice',
    ];
    const currentRaw = selectors.reduce((f, s) => {
      if (f) return f;
      const el = qs(s);
      return el ? el.textContent.trim() : null;
    }, null);
    const origSelectors = [
      'span.basisPrice .a-offscreen', '.basisPrice .a-offscreen',
      '.a-price.a-text-price .a-offscreen',
    ];
    const originalRaw = origSelectors.reduce((f, s) => {
      if (f) return f;
      const el = qs(s);
      return el ? el.textContent.trim() : null;
    }, null);
    return { current: parsePrice(currentRaw), original: parsePrice(originalRaw), currency: 'USD' };
  }

  // Walmart readers

  function getWalmartNextData() {
    try {
      const el = document.getElementById('__NEXT_DATA__');
      return el ? JSON.parse(el.textContent) : null;
    } catch (_) { return null; }
  }

  function findInObject(obj, predicate, depth) {
    if (depth === 0 || obj === null || typeof obj !== 'object') return null;
    if (predicate(obj)) return obj;
    for (const val of Object.values(obj)) {
      const found = findInObject(val, predicate, depth - 1);
      if (found) return found;
    }
    return null;
  }

  function readWalmartReviews() {
    const data = getWalmartNextData();
    if (!data) return [];
    const rc = findInObject(data, (o) =>
      Array.isArray(o.reviews) && o.reviews.length > 0 && o.reviews[0].reviewText !== undefined, 20);
    if (!rc) return [];
    return rc.reviews.slice(0, 5).map((r) => ({
      reviewer: r.userNickname || 'Walmart Customer',
      rating:   typeof r.rating === 'number' ? r.rating : parseFloat(r.rating) || null,
      date:     r.reviewSubmissionTime
        ? new Date(r.reviewSubmissionTime).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : null,
      title:    r.title || null,
      body:     r.reviewText || null,
      verified: r.verifiedPurchase === true,
      source:   'Walmart',
    }));
  }

  function readWalmartPrice() {
    const data = getWalmartNextData();
    if (!data) return { current: null, original: null, currency: 'USD' };
    const priceObj = findInObject(data,
      (o) => (typeof o.currentPrice === 'number' || typeof o.price === 'number') && o.currencyUnit !== undefined, 20);
    if (priceObj) return {
      current:  priceObj.currentPrice ?? priceObj.price ?? null,
      original: priceObj.wasPrice ?? priceObj.listPrice ?? null,
      currency: priceObj.currencyUnit || 'USD',
    };
    return { current: parsePrice(qsText('[itemprop="price"]')), original: null, currency: 'USD' };
  }

  // eBay readers

  function readEbayReviews() {
    const reviews = [];
    const feedbackItems = document.querySelectorAll(
      '.fdbk-detail-list .card, .fdbk-detail-list__col--comment, [class*="feedback"] .card__comment'
    );
    feedbackItems.forEach((item) => {
      if (reviews.length >= 5) return;
      const comment = item.textContent.trim();
      if (!comment) return;
      reviews.push({ reviewer: 'eBay Buyer', rating: null, date: null, title: null,
        body: comment, verified: true, source: 'eBay (Seller Feedback)' });
    });
    if (!reviews.length) {
      const scoreEl =
        qs('.x-sellercard-atf__data-item-wrapper [data-testid="x-sellercard-atf__data-item"] a') ||
        qs('[data-testid="ux-seller-section__item--seller"] a');
      const score = scoreEl ? scoreEl.textContent.trim() : null;
      if (score) reviews.push({
        reviewer: 'Seller Rating', rating: null, date: null,
        title: 'eBay Seller Feedback Score',
        body: `This seller has a feedback score of ${score}. Full feedback is on the seller's eBay page.`,
        verified: false, source: 'eBay (Seller Feedback)',
      });
    }
    return reviews;
  }

  function readEbayPrice() {
    const currentRaw = qsText('.x-price-primary > span') || qsText('.x-price-primary') ||
                       qsText('[data-testid="x-price-primary"] span');
    const originalRaw = qsText('.x-price-approx__price') || qsText('[data-testid="x-price-approx"] span');
    return { current: parsePrice(currentRaw), original: parsePrice(originalRaw), currency: 'USD' };
  }

  // Dispatch

  const REVIEW_READERS = { amazon: readAmazonReviews, walmart: readWalmartReviews, ebay: readEbayReviews };
  const PRICE_READERS  = { amazon: readAmazonPrice,   walmart: readWalmartPrice,   ebay: readEbayPrice };

  const retailer = getRetailer();
  if (!retailer) return;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_REVIEWS') {
      try {
        const reader = REVIEW_READERS[retailer];
        const reviews = reader ? reader() : [];
        let reviewSummary = null;
        if (retailer === 'amazon') {
          reviewSummary = readAmazonCustomersSay();
        }
        sendResponse({ retailer, url: window.location.href, reviews, reviewSummary });
      } catch (_) {
        // Never break the popup if scraping fails; return empty data instead.
        sendResponse({ retailer, url: window.location.href, reviews: [], reviewSummary: null });
      }
      return true;
    }
    if (message.type === 'GET_PRICE') {
      sendResponse({ retailer, url: window.location.href, ...PRICE_READERS[retailer]() });
      return true;
    }
    if (message.type === 'GET_CONTEXT') {
      sendResponse({ ...CONTEXT_READERS[retailer](), url: window.location.href });
      return true;
    }
    if (message.type === 'GET_PRODUCT_INFO') {
      // Extract ASIN from URL path
      const asinMatch = window.location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
      const asin = asinMatch ? asinMatch[1] : null;
      // Product name: try retailer-specific selectors
      const nameEl =
        document.getElementById('productTitle') ||           // Amazon
        document.getElementById('main-title')   ||           // Walmart
        document.querySelector('.x-item-title__mainTitle');  // eBay
      const productName = nameEl ? nameEl.textContent.trim() : null;
      sendResponse({ retailer, asin, productName, url: window.location.href });
      return true;
    }
  });

  chrome.runtime.sendMessage({
    type: 'PAGE_CONTEXT',
    context: { retailer, url: window.location.href },
  }).catch(() => {});
})();
