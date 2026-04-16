/**
 * Tuffy Reviews – Popup script
<<<<<<< Updated upstream
 * Handles tab switching, review rendering (with cross-site), and price tab logic.
=======
 * Reviews tab: primary (DOM) + cross-site (background.js APIs)
 * Price tab: real current price (content.js) + backend price payload
 * Sellers tab: current retailer real price + cross-retailer comparison scaffold
 * Trust tab: backend trust score + category breakdown
>>>>>>> Stashed changes
 */

(function () {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  let _reviewsLoaded = false;
  let _priceLoaded   = false;

  function switchTab(selectedTab) {
    const targetId = 'panel-' + selectedTab;
    tabs.forEach((tab) => {
      const isActive = tab.getAttribute('data-tab') === selectedTab;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });

    panels.forEach((panel) => {
      const isActive = panel.id === targetId;
      panel.classList.toggle('active', isActive);
      panel.hidden = !isActive;
    });
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
    if (selectedTab === 'price')   loadPriceTab();
    if (selectedTab === 'reviews') loadReviews();
>>>>>>> Stashed changes
=======

    if (selectedTab === 'price'   && !_priceLoaded)   { _priceLoaded = true;   loadPriceTab(); }
    if (selectedTab === 'reviews' && !_reviewsLoaded) { _reviewsLoaded = true; loadReviews(); }
    if (selectedTab === 'sellers') loadSellersTab();
    if (selectedTab === 'trust')   loadTrustTab();
>>>>>>> Stashed changes
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.getAttribute('data-tab')));
<<<<<<< Updated upstream
  });

<<<<<<< Updated upstream
  // Optional: ask content script for current page context (product URL, etc.)
  // Will be used when we implement "get product info from page"
=======
  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderPriceTab(cachedCurrentPrice);
    });
  });

  // ─── Shared review card renderer ─────────────────────────────────────────
=======
  });

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  const SUPPORTED = /amazon\.com|walmart\.com|ebay\.com/;
  const RETAILER_LABEL = {
    amazon: 'Amazon',
    walmart: 'Walmart',
    ebay: 'eBay',
  };

  function fmt(n) {
    return n != null ? '$' + parseFloat(n).toFixed(2) : '$--';
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
>>>>>>> Stashed changes

  function starsHtml(rating) {
    if (rating == null) return '';
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  function reviewCardHtml(review) {
<<<<<<< Updated upstream
    const stars    = starsHtml(review.rating);
    const rating   = review.rating != null ? review.rating.toFixed(1) : '--';
    const verified = review.verified
      ? '<span class="review-verified">✓ Verified Purchase</span>' : '';
    const date = review.date
      ? `<span class="review-date">${review.date}</span>` : '';
    const title = review.title
      ? `<p class="review-title">${review.title}</p>` : '';
    const body = review.body
      ? `<p class="review-body">${review.body}</p>`
=======
    const rating = review.rating != null ? review.rating.toFixed(1) : '--';
    const stars = starsHtml(review.rating);
    const verified = review.verified ? '<span class="review-verified">✓ Verified</span>' : '';
    const isMock = review.source === 'mock' ? '<span class="review-mock-badge">Mock</span>' : '';
    const date = review.date ? `<span class="review-date">${escapeHtml(review.date)}</span>` : '';
    const title = review.title ? `<p class="review-title">${escapeHtml(review.title)}</p>` : '';
    const body = review.body
      ? `<p class="review-body">${escapeHtml(review.body)}</p>`
>>>>>>> Stashed changes
      : '<p class="review-body review-body--empty">No review text.</p>';

    return `
      <article class="review-card">
        <div class="review-header">
          <span class="review-stars" aria-label="${rating} out of 5 stars">${stars}</span>
          <span class="review-rating">${rating}</span>
          ${verified}
        </div>
        <div class="review-meta">
          <span class="review-author">${escapeHtml(review.reviewer || 'Unknown')}</span>
          ${date}
        </div>
        ${title}${body}
      </article>`;
  }

<<<<<<< Updated upstream
  // eBay returns listings rather than reviews — render as listing cards
  function ebayListingCardHtml(listing) {
    const price = listing.price != null ? `$${listing.price.toFixed(2)}` : '--';
    const fbPct = listing.sellerFeedbackPct != null
      ? `${listing.sellerFeedbackPct.toFixed(1)}% positive` : null;
    const fbScore = listing.sellerFeedbackScore != null
      ? `(${listing.sellerFeedbackScore.toLocaleString()} ratings)` : '';
    const condition = listing.condition
      ? `<span class="review-date">${listing.condition}</span>` : '';
    const sellerLine = listing.seller
      ? `<span class="review-author">${listing.seller}</span>
         ${fbPct ? `<span class="review-date">${fbPct} ${fbScore}</span>` : ''}` : '';
    const link = listing.itemUrl
      ? `<a class="listing-link" href="${listing.itemUrl}" target="_blank" rel="noopener">View on eBay →</a>` : '';
=======
  function sectionHtml(label, reviews, source, open = false) {
    const sourceTag = source === 'mock'
      ? ' <span class="source-mock">mock data</span>'
      : '';
    const openAttr = open ? ' open' : '';
>>>>>>> Stashed changes

    return `
      <article class="review-card listing-card">
        <div class="review-header">
          <span class="listing-price">${price}</span>
          ${condition}
        </div>
        <p class="review-title">${listing.title || ''}</p>
        <div class="review-meta">${sellerLine}</div>
        ${link}
      </article>`;
  }

<<<<<<< Updated upstream
  // ─── Collapsible section builder ──────────────────────────────────────────

  let sectionCounter = 0;

  function collapsibleSection({ label, count, cardsHtml, startOpen = false }) {
    const id = `review-section-${++sectionCounter}`;
=======
  function reviewSummaryHtml(summaryText) {
    const text = escapeHtml(summaryText || '');
>>>>>>> Stashed changes
    return `
      <div class="review-section">
        <button class="review-section__toggle ${startOpen ? 'open' : ''}"
                aria-expanded="${startOpen}"
                aria-controls="${id}">
          <span class="review-section__label">${label}</span>
          <span class="review-section__count">${count}</span>
          <span class="review-section__chevron" aria-hidden="true">›</span>
        </button>
        <div class="review-section__body" id="${id}" ${startOpen ? '' : 'hidden'}>
          ${cardsHtml}
        </div>
      </div>`;
  }

<<<<<<< Updated upstream
  // Wire toggle clicks (event delegation on the panel)
  document.getElementById('panel-reviews')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.review-section__toggle');
    if (!btn) return;
    const body = document.getElementById(btn.getAttribute('aria-controls'));
    if (!body) return;
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', !isOpen);
    btn.classList.toggle('open', !isOpen);
    body.hidden = isOpen;
  });

  // ─── Reviews tab ──────────────────────────────────────────────────────────

  function setReviewsPanel(html) {
    const panel = document.getElementById('panel-reviews');
    if (panel) panel.innerHTML = html;
    // Re-attach delegation listener since innerHTML replaced content
=======
  function setPrimary(html) {
    const el = document.getElementById('reviews-primary');
    if (el) el.innerHTML = html;
  }

  function setCrossSite(walmartResult, ebayResult) {
    const wrap = document.getElementById('reviews-cross-site');
    const content = document.getElementById('reviews-cross-site-content');
    if (!wrap || !content) return;

    const wReviews = walmartResult?.reviews || [];
    const eReviews = ebayResult?.reviews || [];

    if (!wReviews.length && !eReviews.length) {
      wrap.style.display = 'none';
      return;
    }

    let html = '';
    if (wReviews.length) html += sectionHtml('Walmart', wReviews, walmartResult.source);
    if (eReviews.length) html += sectionHtml('eBay', eReviews, ebayResult.source);

    content.innerHTML = html;
    wrap.style.display = '';
>>>>>>> Stashed changes
  }

  const RETAILER_LABEL = { amazon: 'Amazon', walmart: 'Walmart', ebay: 'eBay' };

  async function loadReviews() {
    sectionCounter = 0;
    setReviewsPanel('<p class="placeholder">Loading reviews…</p>');

    let tab;
<<<<<<< Updated upstream
=======
    try {
      tab = await getActiveTab();
    } catch {
      setPrimary('<p class="placeholder">Could not access the current tab.</p>');
      return;
    }

    if (!SUPPORTED.test(tab?.url || '')) {
      setPrimary('<p class="placeholder">Visit a product page on Amazon, Walmart, or eBay to see reviews.</p>');
      return;
    }

    let primary;
>>>>>>> Stashed changes
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch {
      setReviewsPanel('<p class="placeholder">Could not access the current tab.</p>');
      return;
    }

    const supported = /amazon\.com|walmart\.com|ebay\.com/.test(tab?.url || '');
    if (!supported) {
      setReviewsPanel(
        '<p class="placeholder">Visit a product page on Amazon, Walmart, or eBay to see reviews.</p>'
      );
      return;
    }

<<<<<<< Updated upstream
    // ── Step 1: Get current-site reviews + product context ──────────────────
    let reviewsResp, contextResp;
    try {
      [reviewsResp, contextResp] = await Promise.all([
        chrome.tabs.sendMessage(tab.id, { type: 'GET_REVIEWS' }),
        chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' }),
      ]);
    } catch {
      setReviewsPanel(
        '<p class="placeholder">Could not read the page. Try refreshing and reopening the extension.</p>'
      );
      return;
    }

    const currentRetailer = reviewsResp?.retailer || 'amazon';
    const currentReviews  = reviewsResp?.reviews  || [];
    const productName     = contextResp?.name      || null;
    const currentLabel    = RETAILER_LABEL[currentRetailer] || 'This site';

    let html = '';

    // ── Current site section (always open) ────────────────────────────────
    if (currentReviews.length) {
      html += collapsibleSection({
        label:     `Reviews · ${currentLabel}`,
        count:     `${currentReviews.length} shown`,
        cardsHtml: currentReviews.map(reviewCardHtml).join(''),
        startOpen: true,
      });
=======
    if (!reviews.length && retailer === 'ebay') {
      setPrimary(`
        <p class="placeholder">eBay product reviews load in a separate frame and
        cannot be read directly. Seller feedback is shown below instead.</p>`);
      return;
    }

    if (!reviews.length) {
      setPrimary(`
        ${summaryHtml}
        <p class="placeholder">No reviews found on this page.</p>
        <p class="placeholder" style="margin-top:6px;font-size:11px;">Make sure you're on a product detail page.</p>`);
>>>>>>> Stashed changes
    } else {
      html += `
        <p class="placeholder">No reviews found on this page.</p>
        <p class="placeholder" style="margin-top:6px;font-size:11px;">
          Make sure you're on a product detail page, not a search results page.
        </p>`;
    }

<<<<<<< Updated upstream
    // ── Cross-site sections (collapsed, loading spinner) ──────────────────
    const crossSites = ['amazon', 'walmart', 'ebay'].filter((r) => r !== currentRetailer);
    const loadingPlaceholders = crossSites.map((site) => {
      const siteId = `review-section-${++sectionCounter}`;
      return `
        <div class="review-section" data-cross-site="${site}">
          <button class="review-section__toggle"
                  aria-expanded="false"
                  aria-controls="${siteId}">
            <span class="review-section__label">Reviews · ${RETAILER_LABEL[site]}</span>
            <span class="review-section__count loading-dot">Loading…</span>
            <span class="review-section__chevron" aria-hidden="true">›</span>
          </button>
          <div class="review-section__body" id="${siteId}" hidden>
            <p class="placeholder">Loading…</p>
          </div>
        </div>`;
    }).join('');

    html += loadingPlaceholders;
    setReviewsPanel(html);

    // ── Step 2: Fire cross-site request if we have a product name ──────────
    if (!productName) {
      // Update loading states to "not available"
      crossSites.forEach((site) => {
        const el = document.querySelector(`[data-cross-site="${site}"] .review-section__count`);
        if (el) { el.textContent = 'N/A'; el.classList.remove('loading-dot'); }
        const body = document.querySelector(`[data-cross-site="${site}"] .review-section__body`);
        if (body) body.innerHTML = '<p class="placeholder">Product name not found on this page.</p>';
      });
      return;
=======
    if (retailer === 'amazon') {
      let pageInfo;
      try {
        pageInfo = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRODUCT_INFO' });
      } catch {
        pageInfo = null;
      }

      if (pageInfo?.productName) {
        chrome.runtime.sendMessage(
          {
            type: 'FETCH_CROSS_SITE',
            asin: pageInfo.asin,
            productName: pageInfo.productName,
          },
          (response) => {
            if (response) setCrossSite(response.walmart, response.ebay);
          }
        );
      }
>>>>>>> Stashed changes
    }

<<<<<<< Updated upstream
    let crossData;
    try {
      crossData = await chrome.runtime.sendMessage({
        type: 'GET_CROSS_SITE',
        productName,
      });
    } catch {
      crossSites.forEach((site) => {
        const el = document.querySelector(`[data-cross-site="${site}"] .review-section__count`);
        if (el) { el.textContent = 'Error'; el.classList.remove('loading-dot'); }
        const body = document.querySelector(`[data-cross-site="${site}"] .review-section__body`);
        if (body) body.innerHTML = '<p class="placeholder">Could not reach background service.</p>';
      });
      return;
    }

    // ── Step 3: Populate cross-site sections ──────────────────────────────
    crossSites.forEach((site) => {
      const countEl = document.querySelector(`[data-cross-site="${site}"] .review-section__count`);
      const bodyEl  = document.querySelector(`[data-cross-site="${site}"] .review-section__body`);
      if (!countEl || !bodyEl) return;

      countEl.classList.remove('loading-dot');

      if (site === 'walmart') {
        const w = crossData?.walmart;
        if (!w || w.error || !w.reviews?.length) {
          countEl.textContent = w?.error ? 'Error' : '0 found';
          bodyEl.innerHTML = `<p class="placeholder">${w?.error || 'No Walmart results found for this product.'}</p>`;
        } else {
          countEl.textContent = `${w.reviews.length} shown`;
          const matchLine = w.productName
            ? `<p class="cross-site-match">Matched: <em>${w.productName}</em></p>` : '';
          bodyEl.innerHTML = matchLine + w.reviews.map(reviewCardHtml).join('');
        }
      }

      if (site === 'ebay') {
        const e = crossData?.ebay;
        if (!e || e.error || !e.listings?.length) {
          countEl.textContent = e?.error ? 'Error' : '0 found';
          bodyEl.innerHTML = `<p class="placeholder">${e?.error || 'No eBay listings found for this product.'}</p>`;
        } else {
          countEl.textContent = `${e.listings.length} listings`;
          const priceLine = e.lowestPrice != null
            ? `<p class="cross-site-match">Lowest eBay price: <strong>$${e.lowestPrice.toFixed(2)}</strong></p>` : '';
          bodyEl.innerHTML = priceLine + e.listings.map(ebayListingCardHtml).join('');
        }
      }
    });
  }

  // ─── Price tab ────────────────────────────────────────────────────────────

  let cachedCurrentPrice = null;

  function getMockPriceData(days, basePrice) {
    const base = basePrice || 49.99;
    const now  = new Date();
    const data = [];
    for (let i = days; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const t   = (i / Math.max(days, 1)) * Math.PI * 2;
      const v   = Math.sin(t) * 0.06 + (i % 5) * 0.008 - 0.02;
      data.push({ date, price: Math.round(base * (1 + v) * 100) / 100 });
    }
    if (data.length && basePrice) data[data.length - 1].price = basePrice;
    return data;
  }

  function getSelectedPricePeriod() {
    const active = document.querySelector('.period-btn.active');
    return active ? parseInt(active.getAttribute('data-days'), 10) : 90;
  }

  function fmt(n) { return n != null ? '$' + n.toFixed(2) : '$--'; }

  function updatePriceDisplay(data, currentPrice, originalPrice) {
    const prices  = data.map((d) => d.price);
    const lowest  = Math.min(...prices);
    const highest = Math.max(...prices);
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;
    const el = (id) => document.getElementById(id);
    if (el('current-price')) el('current-price').textContent = currentPrice != null ? fmt(currentPrice) : '$--';
=======
  // ─── Shared backend/cache state ──────────────────────────────────────────

  let cachedCurrentPrice = null;
  let cachedOriginalPrice = null;
  let cachedPricePayload = null;
  let cachedHistoryPoints = null;
  let cachedSellerComparison = null;
  let cachedSellerCount   = null;
  let cachedBuyBoxSeller  = null;
  let cachedSellerHistory = null;

  async function fetchBackendInsightsForActivePage() {
    let tab;
    try {
      tab = await getActiveTab();
    } catch {
      return null;
    }

    if (!SUPPORTED.test(tab?.url || '')) {
      return null;
    }

    let pageInfo = null;
    try {
      pageInfo = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRODUCT_INFO' });
    } catch (_) {}

    if (!pageInfo?.asin) {
      return null;
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'FETCH_PRICE_HISTORY',
          asin: pageInfo.asin,
        },
        (result) => {
          if (chrome.runtime.lastError) {
            console.warn('FETCH_PRICE_HISTORY runtime error:', chrome.runtime.lastError.message);
            resolve(null);
            return;
          }

          if (!result?.ok || !result?.data) {
            console.warn('FETCH_PRICE_HISTORY failed:', result?.error || 'Unknown error');
            resolve(null);
            return;
          }

          cachedPricePayload = result.data;
          cachedHistoryPoints = result.data?.price?.dailyHistory180d || null;

          if (cachedCurrentPrice == null && result.data?.price?.current != null) {
            cachedCurrentPrice = result.data.price.current;
          }

          resolve(result.data);
        }
      );
    });
  }

  // ─── Price tab ───────────────────────────────────────────────────────────

  function getSelectedDays() {
    const active = document.querySelector('.period-btn.active');
    return active ? parseInt(active.getAttribute('data-days'), 10) : 90;
  }

  function getSelectedPeriodKey() {
    const days = getSelectedDays();
    if (days === 30) return '30d';
    if (days === 90) return '90d';
    return '180d';
  }

  function mockHistory(days, basePrice) {
    const base = basePrice || 49.99;
    const now = new Date();
    const out = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);

      const t = (i / Math.max(days, 1)) * Math.PI * 2;
      const v = Math.sin(t) * 0.06 + (i % 5) * 0.008 - 0.02;
      const p = Math.round(base * (1 + v) * 100) / 100;

      out.push({
        date: d.toISOString(),
        timestamp: Math.floor(d.getTime() / 1000),
        price: p,
      });
    }

    if (out.length && basePrice != null) {
      out[out.length - 1].price = basePrice;
    }

    return out;
  }

  function setPriceSourceNote(text, isReal) {
    const sourceNote = document.getElementById('price-source-note');
    if (!sourceNote) return;

    sourceNote.textContent = text;
    sourceNote.classList.remove('note-real', 'note-mock');
    sourceNote.classList.add(isReal ? 'note-real' : 'note-mock');
  }

  function updateSavingsFromPeriod(period) {
    const el = document.getElementById('savings-value');
    if (!el) return;

    el.classList.remove('below-avg', 'above-avg', 'at-avg');

    if (!period || period.current == null || period.average == null) {
      el.textContent = '--';
      return;
    }

    const pct = Math.abs(period.percentFromAverage || 0);

    if (period.avgDirection === 'below') {
      el.textContent = `${period.differenceFromAverageDisplay} (${pct.toFixed(1)}% below avg)`;
      el.classList.add('below-avg');
      return;
    }

    if (period.avgDirection === 'above') {
      el.textContent = `${period.differenceFromAverageDisplay} (${pct.toFixed(1)}% above avg)`;
      el.classList.add('above-avg');
      return;
    }

    el.textContent = 'At average price';
    el.classList.add('at-avg');
  }

  function updateSavings(current, average) {
    const el = document.getElementById('savings-value');
    if (!el) return;

    if (current == null || average == null) {
      el.textContent = '--';
      el.classList.remove('below-avg', 'above-avg', 'at-avg');
      return;
    }

    const diff = current - average;
    const pct = average ? (Math.abs(diff) / average) * 100 : 0;

    el.classList.remove('below-avg', 'above-avg', 'at-avg');

    if (pct < 1) {
      el.textContent = 'At average price';
      el.classList.add('at-avg');
    } else if (diff < 0) {
      el.textContent = `$${Math.abs(diff).toFixed(2)} (${pct.toFixed(1)}% below avg)`;
      el.classList.add('below-avg');
    } else {
      el.textContent = `$${diff.toFixed(2)} (${pct.toFixed(1)}% above avg)`;
      el.classList.add('above-avg');
    }
  }

  function renderPriceTabFromBackend(pricePayload, originalPrice) {
    const el = (id) => document.getElementById(id);
    const periodKey = getSelectedPeriodKey();
    const selectedPeriod = pricePayload?.periods?.[periodKey];

    if (!pricePayload || !selectedPeriod) {
      renderPriceTabFallback(cachedCurrentPrice, originalPrice, null);
      return;
    }

    const currentPrice = pricePayload.current;

    if (el('current-price')) {
      el('current-price').textContent = pricePayload.display || fmt(currentPrice);
    }

>>>>>>> Stashed changes
    const origRow = document.getElementById('original-price-row');
    const origEl  = document.getElementById('original-price');
    if (origRow && origEl) {
      if (originalPrice && currentPrice && originalPrice > currentPrice) {
        const pct = Math.round((1 - currentPrice / originalPrice) * 100);
        origEl.textContent    = `${fmt(originalPrice)} (${pct}% off)`;
        origRow.style.display = '';
      } else {
        origRow.style.display = 'none';
      }
    }
<<<<<<< Updated upstream
    if (el('price-lowest'))  el('price-lowest').textContent  = fmt(lowest);
=======

    if (el('price-lowest')) el('price-lowest').textContent = selectedPeriod.lowestDisplay || fmt(selectedPeriod.lowest);
    if (el('price-average')) el('price-average').textContent = selectedPeriod.averageDisplay || fmt(selectedPeriod.average);
    if (el('price-highest')) el('price-highest').textContent = selectedPeriod.highestDisplay || fmt(selectedPeriod.highest);

    drawPriceChart(selectedPeriod.chartPoints || []);
    updateSavingsFromPeriod(selectedPeriod);

    const sourceType = pricePayload.seriesType ? `Keepa · ${pricePayload.seriesType}` : 'Keepa';
    setPriceSourceNote(`${sourceType} · ${selectedPeriod.pointCount || 0} daily points`, true);
  }

  function renderPriceTabFallback(currentPrice, originalPrice, historyPoints) {
    const days = getSelectedDays();
    let points;

    if (historyPoints && historyPoints.length) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      points = historyPoints.filter((p) => new Date(p.date) >= cutoff);
      setPriceSourceNote(`Price history from backend · ${points.length} data points`, true);
    } else {
      points = mockHistory(days, currentPrice);
      setPriceSourceNote('⚠ Price history is simulated — backend data unavailable.', false);
    }

    if (!points.length) {
      points = mockHistory(days, currentPrice);
    }

    const prices = points.map((p) => p.price);
    const lowest = Math.min(...prices);
    const highest = Math.max(...prices);
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;

    const el = (id) => document.getElementById(id);

    if (el('current-price')) {
      el('current-price').textContent = currentPrice != null ? fmt(currentPrice) : '$--';
    }

    const origRow = document.getElementById('original-price-row');
    if (origRow) {
      if (originalPrice && currentPrice && originalPrice > currentPrice) {
        const pct = Math.round((1 - currentPrice / originalPrice) * 100);
        el('original-price').textContent = `${fmt(originalPrice)} (${pct}% off)`;
        origRow.style.display = '';
      } else {
        origRow.style.display = 'none';
      }
    }

    if (el('price-lowest')) el('price-lowest').textContent = fmt(lowest);
>>>>>>> Stashed changes
    if (el('price-average')) el('price-average').textContent = fmt(average);
    if (el('price-highest')) el('price-highest').textContent = fmt(highest);
    return { current: currentPrice ?? data[data.length - 1].price, average };
  }

<<<<<<< Updated upstream
  function drawPriceChart(data) {
    const canvas = document.getElementById('price-chart');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    const W    = rect.width  || 296;
    const H    = rect.height || 110;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const PAD   = { top: 10, right: 12, bottom: 22, left: 38 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top  - PAD.bottom;
    const prices = data.map((d) => d.price);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    const yPad = range * 0.15;
    const yMin = minP - yPad, yMax = maxP + yPad;
    const xOf = (i) => PAD.left + (i / (data.length - 1)) * plotW;
    const yOf = (p) => PAD.top  + (1 - (p - yMin) / (yMax - yMin)) * plotH;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
=======
  function renderPriceTab() {
    if (cachedPricePayload?.price) {
      renderPriceTabFromBackend(cachedPricePayload.price, cachedOriginalPrice);
      return;
    }

    renderPriceTabFallback(cachedCurrentPrice, cachedOriginalPrice, cachedHistoryPoints);
  }

  async function loadPriceTab() {
    const el = (id) => document.getElementById(id);
    if (el('current-price')) el('current-price').textContent = '$--';

    let tab;
    try {
      tab = await getActiveTab();
    } catch {
      renderPriceTab();
      return;
    }

    if (!SUPPORTED.test(tab?.url || '')) {
      renderPriceTab();
      return;
    }

    let priceData = null;
    try {
      priceData = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRICE' });
    } catch (_) {}

    cachedCurrentPrice = priceData?.current ?? null;
    cachedOriginalPrice = priceData?.original ?? null;

    renderPriceTab();

    const data = await fetchBackendInsightsForActivePage();
    if (data?.price) {
      renderPriceTab();
    }
  }

  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderPriceTab();
    });
  });

  // ─── Sellers tab ─────────────────────────────────────────────────────────

  function comparisonDiffText(row) {
    if (row.isCurrentRetailer) return 'This is the current page retailer';
    if (row.differenceFromCurrent == null) return 'Difference unavailable';
    if (row.differenceFromCurrent < 0) return `${row.differenceFromCurrentDisplay} cheaper than current`;
    if (row.differenceFromCurrent > 0) return `${row.differenceFromCurrentDisplay} more than current`;
    return 'Same price as current';
  }

  function sellerCardHtml(row) {
    const diffClass = row.isCurrentRetailer
      ? 'same'
      : row.isCheaperThanCurrent
      ? 'cheaper'
      : row.isMoreExpensiveThanCurrent
      ? 'higher'
      : 'same';

    const currentBadge = row.isCurrentRetailer ? '<span class="seller-site-badge">Current</span>' : '';
    const bestBadge = row.isBestPrice ? '<span class="seller-best-pill">Best price</span>' : '';
    const mockTag = row.source === 'mock' ? '<span class="seller-mock-tag">Estimated</span>' : '';
    const linkHtml = row.url
      ? `<a class="seller-link" href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">Open listing</a>`
      : '';

    return `
      <div class="seller-card ${row.isBestPrice ? 'best' : ''}">
        <div class="seller-card-top">
          <div class="seller-card-name">
            <span>${escapeHtml(row.label || 'Unknown')}</span>
            ${currentBadge}
            ${bestBadge}
          </div>
          <div class="seller-card-price">${row.priceDisplay || '$--'}</div>
        </div>
        <div class="seller-card-body">
          <div class="seller-meta-row">
            <span class="seller-meta-label">Seller</span>
            <span class="seller-meta-value">${escapeHtml(row.sellerName || 'Unknown')}</span>
          </div>
          <div class="seller-diff ${diffClass}">${comparisonDiffText(row)}</div>
          <div class="seller-actions">
            ${linkHtml}
            ${mockTag}
          </div>
        </div>
      </div>`;
  }

  function renderSellersTab(comparison) {
    const listEl = document.getElementById('seller-list');
    const currentRetailerEl = document.getElementById('seller-current-retailer');
    const bestBadgeEl = document.getElementById('seller-best-badge');
    const currentPagePriceEl = document.getElementById('seller-current-page-price');
    const lowestFoundEl = document.getElementById('seller-lowest-found');
    const sourceNoteEl = document.getElementById('seller-source-note');

    if (!listEl || !currentRetailerEl || !bestBadgeEl || !currentPagePriceEl || !lowestFoundEl || !sourceNoteEl) {
      return;
    }

    if (!comparison?.retailers?.length) {
      listEl.innerHTML = '<p class="placeholder">No seller comparison available.</p>';
      currentRetailerEl.textContent = 'Current site: --';
      bestBadgeEl.textContent = 'Best price: --';
      currentPagePriceEl.textContent = '$--';
      lowestFoundEl.textContent = '$--';
      sourceNoteEl.textContent = 'Comparison unavailable.';
      return;
    }

    const currentRow = comparison.retailers.find((r) => r.isCurrentRetailer) || null;
    const bestRow = comparison.retailers.find((r) => r.isBestPrice) || null;

    currentRetailerEl.textContent = `Current site: ${RETAILER_LABEL[comparison.currentRetailer] || '--'}`;
    bestBadgeEl.textContent = bestRow ? `Best price: ${bestRow.label}` : 'Best price: --';
    currentPagePriceEl.textContent = currentRow?.priceDisplay || '$--';
    lowestFoundEl.textContent = comparison.bestPriceDisplay || '$--';
    sourceNoteEl.textContent = comparison.meta?.note || 'Comparison source unavailable.';

    listEl.innerHTML = comparison.retailers.map(sellerCardHtml).join('');
  }

  async function loadSellersTab() {
    const listEl = document.getElementById('seller-list');
    if (listEl) listEl.innerHTML = '<p class="placeholder">Loading seller comparison…</p>';

    let tab;
    try {
      tab = await getActiveTab();
    } catch {
      renderSellersTab(null);
      return;
    }

    if (!SUPPORTED.test(tab?.url || '')) {
      renderSellersTab(null);
      return;
    }

    let priceData = null;
    let productInfo = null;

    try {
      priceData = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRICE' });
    } catch (_) {}

    try {
      productInfo = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRODUCT_INFO' });
    } catch (_) {}

    chrome.runtime.sendMessage(
      {
        type: 'FETCH_COMPETITOR_PRICES',
        retailer: productInfo?.retailer || priceData?.retailer || null,
        asin: productInfo?.asin || null,
        productName: productInfo?.productName || null,
        currentPrice: priceData?.current || null,
      },
      (result) => {
        if (chrome.runtime.lastError) {
          console.warn('FETCH_COMPETITOR_PRICES runtime error:', chrome.runtime.lastError.message);
          renderSellersTab(null);
          return;
        }

        if (!result?.ok) {
          console.warn('FETCH_COMPETITOR_PRICES failed:', result?.error || 'Unknown error');
          renderSellersTab(null);
          return;
        }

        cachedSellerComparison = result;
        renderSellersTab(cachedSellerComparison);
      }
    );
  }

  // ─── Trust tab ───────────────────────────────────────────────────────────

  function trustBadgeClass(badge) {
    const value = String(badge || '').toLowerCase();

    if (value === 'excellent') return 'excellent';
    if (value === 'good') return 'good';
    if (value === 'fair') return 'fair';
    if (value === 'caution') return 'caution';
    if (value === 'high risk') return 'high-risk';

    return '';
  }

  function trustSummaryText(trust) {
    if (!trust?.breakdown?.length) {
      return 'No trust breakdown is available yet.';
    }

    const top = [...trust.breakdown]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 2)
      .map((item) => item.label);

    if (!top.length) {
      return 'We combine seller quality, price fairness, price stability, and listing confidence.';
    }

    return `Strongest categories: ${top.join(' and ')}.`;
  }

  function trustCardHtml(item) {
    const score = Math.max(0, Math.min(100, Number(item?.score || 0)));

    return `
      <div class="trust-card">
        <div class="trust-card-head">
          <div class="trust-card-title">${escapeHtml(item?.label || 'Unknown')}</div>
          <div class="trust-card-score">${score.toFixed(0)}/100</div>
        </div>

        <div class="trust-bar" aria-hidden="true">
          <div class="trust-bar-fill" style="width: ${score}%;"></div>
        </div>

        <div class="trust-card-body">
          <div class="trust-card-reason">${escapeHtml(item?.reason || 'No details available.')}</div>
        </div>
      </div>
    `;
  }

  function renderTrustTab(trustPayload) {
    const scoreEl = document.getElementById('trust-score');
    const badgeEl = document.getElementById('trust-badge');
    const noteEl = document.getElementById('trust-note');
    const summaryEl = document.getElementById('trust-summary-text');
    const breakdownEl = document.getElementById('trust-breakdown');

    if (!scoreEl || !badgeEl || !noteEl || !summaryEl || !breakdownEl) {
      return;
    }

    if (!trustPayload) {
      scoreEl.textContent = '--';
      badgeEl.textContent = 'Unavailable';
      badgeEl.className = 'trust-score-badge';
      summaryEl.textContent = 'Trust data is not available for this product yet.';
      noteEl.textContent = 'Open an Amazon product page with backend insights enabled.';
      breakdownEl.innerHTML = '<p class="placeholder">No trust data available.</p>';
      return;
    }

    scoreEl.textContent = Number(trustPayload.score || 0).toFixed(0);

    const badge = trustPayload.badge || 'Unknown';
    badgeEl.textContent = badge;
    badgeEl.className = `trust-score-badge ${trustBadgeClass(badge)}`.trim();

    summaryEl.textContent = trustSummaryText(trustPayload);
    noteEl.textContent = 'Based on backend scoring from Keepa price and seller signals.';

    const breakdown = Array.isArray(trustPayload.breakdown) ? trustPayload.breakdown : [];
    breakdownEl.innerHTML = breakdown.length
      ? breakdown.map(trustCardHtml).join('')
      : '<p class="placeholder">No trust breakdown available.</p>';
  }

  async function loadTrustTab() {
    renderTrustTab(cachedPricePayload?.trust || null);

    if (cachedPricePayload?.trust) {
      return;
    }

    const data = await fetchBackendInsightsForActivePage();
    renderTrustTab(data?.trust || null);
  }

  // ─── Seller chart (stub) ─────────────────────────────────────────────────

  function drawSellerChart(data) {
    console.log('[TuffyReviews] drawSellerChart called with', data.length, 'points — not yet implemented');
  }

  // ─── Price chart ─────────────────────────────────────────────────────────

  function drawPriceChart(data) {
    const canvas = document.getElementById('price-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = rect.width || 296;
    const H = rect.height || 110;

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    if (!data || !data.length) return;

    const PAD = { top: 10, right: 12, bottom: 22, left: 38 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const prices = data.map((d) => d.price);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    const yMin = minP - range * 0.15;
    const yMax = maxP + range * 0.15;

    const xOf = (i) => {
      if (data.length === 1) return PAD.left + plotW / 2;
      return PAD.left + (i / (data.length - 1)) * plotW;
    };

    const yOf = (p) => PAD.top + (1 - (p - yMin) / (yMax - yMin)) * plotH;

    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;

>>>>>>> Stashed changes
    for (let g = 0; g <= 3; g++) {
      const y = PAD.top + (g / 3) * plotH;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + plotW, y);
      ctx.stroke();
    }
<<<<<<< Updated upstream
    ctx.fillStyle = '#5c6370'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
=======

    ctx.fillStyle = '#5c6370';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

>>>>>>> Stashed changes
    for (let g = 0; g <= 3; g++) {
      ctx.fillText('$' + (yMax - (g / 3) * (yMax - yMin)).toFixed(0),
                   PAD.left - 4, PAD.top + (g / 3) * plotH);
    }
<<<<<<< Updated upstream
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [0, Math.floor((data.length - 1) / 2), data.length - 1].forEach((i) => {
      const d = data[i].date;
      ctx.fillText((d.getMonth() + 1) + '/' + d.getDate(), xOf(i), PAD.top + plotH + 5);
    });
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH);
    grad.addColorStop(0, 'rgba(191,87,0,0.18)'); grad.addColorStop(1, 'rgba(191,87,0,0.00)');
=======

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelIndexes = [0, Math.floor((data.length - 1) / 2), data.length - 1];

    labelIndexes.forEach((i) => {
      if (!data[i]) return;
      const d = new Date(data[i].date);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      ctx.fillText(label, xOf(i), PAD.top + plotH + 5);
    });

    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH);
    grad.addColorStop(0, 'rgba(191,87,0,0.18)');
    grad.addColorStop(1, 'rgba(191,87,0,0.00)');

>>>>>>> Stashed changes
    ctx.beginPath();
    data.forEach((d, i) => {
      if (i === 0) ctx.moveTo(xOf(i), yOf(d.price));
      else ctx.lineTo(xOf(i), yOf(d.price));
    });
    ctx.lineTo(xOf(data.length - 1), PAD.top + plotH);
    ctx.lineTo(xOf(0), PAD.top + plotH);
<<<<<<< Updated upstream
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(xOf(i), yOf(d.price)) : ctx.lineTo(xOf(i), yOf(d.price)); });
    ctx.strokeStyle = '#bf5700'; ctx.lineWidth = 1.75; ctx.lineJoin = 'round'; ctx.stroke();
    const lx = xOf(data.length - 1), ly = yOf(prices[prices.length - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(191,87,0,0.2)'; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#bf5700'; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function updateSavings(current, average) {
    const el = document.getElementById('savings-value');
    if (!el) return;
    if (current == null) { el.textContent = '--'; el.className = 'savings-value'; return; }
    const diff = current - average;
    const pct  = (Math.abs(diff) / average) * 100;
    el.classList.remove('below-avg', 'above-avg', 'at-avg');
    if (pct < 1) {
      el.textContent = 'At average price'; el.classList.add('at-avg');
    } else if (diff < 0) {
      el.textContent = `${fmt(Math.abs(diff))} (${pct.toFixed(1)}% below avg)`; el.classList.add('below-avg');
    } else {
      el.textContent = `${fmt(Math.abs(diff))} (${pct.toFixed(1)}% above avg)`; el.classList.add('above-avg');
    }
  }

  function renderPriceTab(currentPrice, originalPrice) {
    const days  = getSelectedPricePeriod();
    const data  = getMockPriceData(days, currentPrice);
    const stats = updatePriceDisplay(data, currentPrice, originalPrice);
    drawPriceChart(data);
    updateSavings(stats.current, stats.average);
=======
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    data.forEach((d, i) => {
      if (i === 0) ctx.moveTo(xOf(i), yOf(d.price));
      else ctx.lineTo(xOf(i), yOf(d.price));
    });
    ctx.strokeStyle = '#bf5700';
    ctx.lineWidth = 1.75;
    ctx.lineJoin = 'round';
    ctx.stroke();

    const lx = xOf(data.length - 1);
    const ly = yOf(prices[prices.length - 1]);

    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(191,87,0,0.2)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#bf5700';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
>>>>>>> Stashed changes
  }

  async function loadPriceTab() {
    const el = document.getElementById('current-price');
    if (el) el.textContent = '$--';
    let tab;
    try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); }
    catch { renderPriceTab(null); return; }
    const supported = /amazon\.com|walmart\.com|ebay\.com/.test(tab?.url || '');
    if (!supported) { renderPriceTab(null); return; }
    let priceData = null;
    try { priceData = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRICE' }); } catch (_) {}
    cachedCurrentPrice = priceData?.current ?? null;
    renderPriceTab(cachedCurrentPrice, priceData?.original ?? null);
  }

  // ─── Page status + initial load ───────────────────────────────────────────

>>>>>>> Stashed changes
  async function updatePageStatus() {
<<<<<<< Updated upstream
    const statusEl = document.querySelector('.page-status');
    if (!statusEl) return;
=======
    const el = document.querySelector('.page-status');
    if (!el) return;

>>>>>>> Stashed changes
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const supported = /amazon\.com|walmart\.com|ebay\.com/.test(tab.url);
        statusEl.textContent = supported
          ? 'Product page detected.'
          : 'Visit a product page on Amazon, Walmart, or eBay to see insights.';
      }
    } catch {
      statusEl.textContent = 'Visit a product page on Amazon, Walmart, or eBay.';
    }
  }

  _reviewsLoaded = true;
  loadReviews();
  updatePageStatus();
})();