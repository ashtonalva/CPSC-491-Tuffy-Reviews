/**
 * Tuffy Reviews – Popup script
 * Handles tab switching, review rendering (with cross-site), and price tab logic.
 */

(function () {
  const tabs   = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  // ─── Tab switching ────────────────────────────────────────────────────────

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
=======
    if (selectedTab === 'price')   loadPriceTab();
    if (selectedTab === 'reviews') loadReviews();
>>>>>>> Stashed changes
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.getAttribute('data-tab')));
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

  function starsHtml(rating) {
    if (rating == null) return '';
    const full  = Math.floor(rating);
    const half  = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  function reviewCardHtml(review) {
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
      : '<p class="review-body review-body--empty">No review text.</p>';

    return `
      <article class="review-card">
        <div class="review-header">
          <span class="review-stars" aria-label="${rating} out of 5 stars">${stars}</span>
          <span class="review-rating">${rating}</span>
          ${verified}
        </div>
        <div class="review-meta">
          <span class="review-author">${review.reviewer}</span>
          ${date}
        </div>
        ${title}${body}
      </article>`;
  }

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

  // ─── Collapsible section builder ──────────────────────────────────────────

  let sectionCounter = 0;

  function collapsibleSection({ label, count, cardsHtml, startOpen = false }) {
    const id = `review-section-${++sectionCounter}`;
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
  }

  const RETAILER_LABEL = { amazon: 'Amazon', walmart: 'Walmart', ebay: 'eBay' };

  async function loadReviews() {
    sectionCounter = 0;
    setReviewsPanel('<p class="placeholder">Loading reviews…</p>');

    let tab;
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
    } else {
      html += `
        <p class="placeholder">No reviews found on this page.</p>
        <p class="placeholder" style="margin-top:6px;font-size:11px;">
          Make sure you're on a product detail page, not a search results page.
        </p>`;
    }

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
    }

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
    if (el('price-lowest'))  el('price-lowest').textContent  = fmt(lowest);
    if (el('price-average')) el('price-average').textContent = fmt(average);
    if (el('price-highest')) el('price-highest').textContent = fmt(highest);
    return { current: currentPrice ?? data[data.length - 1].price, average };
  }

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
    for (let g = 0; g <= 3; g++) {
      const y = PAD.top + (g / 3) * plotH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + plotW, y); ctx.stroke();
    }
    ctx.fillStyle = '#5c6370'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 3; g++) {
      ctx.fillText('$' + (yMax - (g / 3) * (yMax - yMin)).toFixed(0),
                   PAD.left - 4, PAD.top + (g / 3) * plotH);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [0, Math.floor((data.length - 1) / 2), data.length - 1].forEach((i) => {
      const d = data[i].date;
      ctx.fillText((d.getMonth() + 1) + '/' + d.getDate(), xOf(i), PAD.top + plotH + 5);
    });
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH);
    grad.addColorStop(0, 'rgba(191,87,0,0.18)'); grad.addColorStop(1, 'rgba(191,87,0,0.00)');
    ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(xOf(i), yOf(d.price)) : ctx.lineTo(xOf(i), yOf(d.price)); });
    ctx.lineTo(xOf(data.length - 1), PAD.top + plotH);
    ctx.lineTo(xOf(0), PAD.top + plotH);
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
    const statusEl = document.querySelector('.page-status');
    if (!statusEl) return;
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

  loadReviews();
  updatePageStatus();
})();
