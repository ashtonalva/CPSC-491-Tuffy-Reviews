/**
 * Tuffy Reviews – Popup script
 * Reviews tab: primary (DOM) + cross-site (background.js APIs)
 * Price tab: real current price (content.js) + Keepa history (background.js)
 */

(function () {
  const tabs   = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  // ─── Tab switching ────────────────────────────────────────────────────────

  function switchTab(selectedTab) {
    tabs.forEach((tab) => {
      const on = tab.getAttribute('data-tab') === selectedTab;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', on);
    });
    panels.forEach((panel) => {
      const on = panel.id === 'panel-' + selectedTab;
      panel.classList.toggle('active', on);
      panel.hidden = !on;
    });
    if (selectedTab === 'price')   loadPriceTab();
    if (selectedTab === 'reviews') loadReviews();
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => switchTab(tab.getAttribute('data-tab'))));

  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      // Re-render with cached price + cached history points
      renderPriceTab(cachedCurrentPrice, cachedOriginalPrice, cachedHistoryPoints);
    });
  });

  // ─── Shared helpers ───────────────────────────────────────────────────────

  function starsHtml(rating) {
    if (rating == null) return '';
    const full  = Math.floor(rating);
    const half  = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  function reviewCardHtml(review) {
    const rating   = review.rating != null ? review.rating.toFixed(1) : '--';
    const stars    = starsHtml(review.rating);
    const verified = review.verified
      ? '<span class="review-verified">✓ Verified</span>' : '';
    const isMock   = review.source === 'mock'
      ? '<span class="review-mock-badge">Mock</span>' : '';
    const date     = review.date  ? `<span class="review-date">${review.date}</span>` : '';
    const title    = review.title ? `<p class="review-title">${review.title}</p>` : '';
    const body     = review.body  ? `<p class="review-body">${review.body}</p>`
                                  : '<p class="review-body review-body--empty">No review text.</p>';
    return `
      <article class="review-card">
        <div class="review-header">
          <span class="review-stars">${stars}</span>
          <span class="review-rating">${rating}</span>
          ${verified}${isMock}
        </div>
        <div class="review-meta">
          <span class="review-author">${review.reviewer}</span>
          ${date}
        </div>
        ${title}${body}
      </article>`;
  }

  function sectionHtml(label, reviews, source, open = false) {
    const sourceTag = source === 'mock'
      ? ' <span class="source-mock">mock data</span>' : '';
    const openAttr = open ? ' open' : '';
    return `
      <details class="reviews-dropdown"${openAttr}>
        <summary class="reviews-dropdown-header">
          <span class="reviews-source">${label}${sourceTag}</span>
          <span class="reviews-count">${reviews.length} shown</span>
          <span class="reviews-dropdown-icon">▾</span>
        </summary>
        <div class="reviews-dropdown-body">
          ${reviews.map(reviewCardHtml).join('')}
        </div>
      </details>`;
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  const SUPPORTED = /amazon\.com|walmart\.com|ebay\.com/;
  const RETAILER_LABEL = { amazon: 'Amazon', walmart: 'Walmart', ebay: 'eBay' };

  // ─── Reviews tab ──────────────────────────────────────────────────────────

  function setPrimary(html) {
    const el = document.getElementById('reviews-primary');
    if (el) el.innerHTML = html;
  }

  function setCrossSite(walmartResult, ebayResult) {
    const wrap    = document.getElementById('reviews-cross-site');
    const content = document.getElementById('reviews-cross-site-content');
    if (!wrap || !content) return;

    const wReviews = walmartResult?.reviews || [];
    const eReviews = ebayResult?.reviews    || [];

    if (!wReviews.length && !eReviews.length) {
      wrap.style.display = 'none';
      return;
    }

    let html = '';
    if (wReviews.length)
      html += sectionHtml('Walmart', wReviews, walmartResult.source);
    if (eReviews.length)
      html += sectionHtml('eBay', eReviews, ebayResult.source);

    content.innerHTML = html;
    wrap.style.display = '';
  }

  async function loadReviews() {
    setPrimary('<p class="placeholder">Loading reviews…</p>');
    document.getElementById('reviews-cross-site').style.display = 'none';

    let tab;
    try { tab = await getActiveTab(); } catch {
      setPrimary('<p class="placeholder">Could not access the current tab.</p>');
      return;
    }

    if (!SUPPORTED.test(tab?.url || '')) {
      setPrimary('<p class="placeholder">Visit a product page on Amazon, Walmart, or eBay to see reviews.</p>');
      return;
    }

    // 1 — get primary reviews from the page DOM
    let primary;
    try {
      primary = await chrome.tabs.sendMessage(tab.id, { type: 'GET_REVIEWS' });
    } catch {
      setPrimary('<p class="placeholder">Could not read the page. Try refreshing and reopening the extension.</p>');
      return;
    }

    const reviews = primary?.reviews || [];
    const retailer = primary?.retailer;
    const label = RETAILER_LABEL[retailer] || 'This site';

    if (!reviews.length) {
      setPrimary(`
        <p class="placeholder">No reviews found on this page.</p>
        <p class="placeholder" style="margin-top:6px;font-size:11px;">Make sure you're on a product detail page.</p>`);
    } else {
      setPrimary(sectionHtml(`Top reviews · ${label}`, reviews, 'api', true));
    }

    // 2 — fetch cross-site reviews in the background (only on Amazon for now)
    if (retailer === 'amazon') {
      // Extract ASIN and product name from the page
      let pageInfo;
      try {
        pageInfo = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRODUCT_INFO' });
      } catch { pageInfo = null; }

      if (pageInfo?.productName) {
        // Fire and forget — update the UI when results arrive
        chrome.runtime.sendMessage(
          { type: 'FETCH_CROSS_SITE', asin: pageInfo.asin, productName: pageInfo.productName },
          (response) => {
            if (response) setCrossSite(response.walmart, response.ebay);
          }
        );
      }
    }
  }

  // ─── Price tab ────────────────────────────────────────────────────────────

  // State cached so period changes don't need to re-fetch
  let cachedCurrentPrice  = null;
  let cachedOriginalPrice = null;
  let cachedHistoryPoints = null; // null = use mock; array = use real

  function fmt(n) {
    return n != null ? '$' + parseFloat(n).toFixed(2) : '$--';
  }

  /**
   * Generate a deterministic mock price curve anchored to basePrice.
   * Used when Keepa key is absent or the product has no history.
   */
  function mockHistory(days, basePrice) {
    const base = basePrice || 49.99;
    const now  = new Date();
    const out  = [];
    for (let i = days; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const t   = (i / Math.max(days, 1)) * Math.PI * 2;
      const v   = Math.sin(t) * 0.06 + (i % 5) * 0.008 - 0.02;
      const p   = Math.round(base * (1 + v) * 100) / 100;
      out.push({ date: d.toISOString().split('T')[0], price: p });
    }
    // Force last point to exactly equal real current price
    if (out.length && basePrice != null) out[out.length - 1].price = basePrice;
    return out;
  }

  function renderPriceTab(currentPrice, originalPrice, historyPoints) {
    const days = getSelectedDays();

    // Resolve data: real Keepa points or mock curve
    let points;
    const sourceNote = document.getElementById('price-source-note');

    if (historyPoints && historyPoints.length) {
      // Filter to selected period
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      points = historyPoints.filter((p) => new Date(p.date) >= cutoff);
      if (sourceNote) {
        sourceNote.textContent = `Price history from Keepa · ${points.length} data points`;
        sourceNote.classList.remove('note-mock');
        sourceNote.classList.add('note-real');
      }
    } else {
      points = mockHistory(days, currentPrice);
      if (sourceNote) {
        sourceNote.textContent = '⚠ Price history is simulated — add a Keepa API key for real data.';
        sourceNote.classList.remove('note-real');
        sourceNote.classList.add('note-mock');
      }
    }

    if (!points.length) points = mockHistory(days, currentPrice);

    const prices  = points.map((p) => p.price);
    const lowest  = Math.min(...prices);
    const highest = Math.max(...prices);
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;

    // DOM updates
    const el = (id) => document.getElementById(id);
    if (el('current-price')) el('current-price').textContent = currentPrice != null ? fmt(currentPrice) : '$--';

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

    if (el('price-lowest'))  el('price-lowest').textContent  = fmt(lowest);
    if (el('price-average')) el('price-average').textContent = fmt(average);
    if (el('price-highest')) el('price-highest').textContent = fmt(highest);

    drawPriceChart(points);
    updateSavings(currentPrice ?? points[points.length - 1].price, average);
  }

  function getSelectedDays() {
    const active = document.querySelector('.period-btn.active');
    return active ? parseInt(active.getAttribute('data-days'), 10) : 90;
  }

  async function loadPriceTab() {
    const el = (id) => document.getElementById(id);
    if (el('current-price')) el('current-price').textContent = '$--';

    let tab;
    try { tab = await getActiveTab(); } catch {
      renderPriceTab(null, null, null); return;
    }

    if (!SUPPORTED.test(tab?.url || '')) {
      renderPriceTab(null, null, null); return;
    }

    // 1 — get real current price from page DOM
    let priceData = null;
    try {
      priceData = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRICE' });
    } catch { /* content script not ready */ }

    cachedCurrentPrice  = priceData?.current  ?? null;
    cachedOriginalPrice = priceData?.original ?? null;

    // 2 — immediately render with mock history while Keepa loads
    renderPriceTab(cachedCurrentPrice, cachedOriginalPrice, null);

    // 3 — request real price history from Keepa via background.js
    let pageInfo = null;
    try {
      pageInfo = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRODUCT_INFO' });
    } catch { /* ok */ }

    if (pageInfo?.asin) {
      const days = getSelectedDays();
      chrome.runtime.sendMessage(
        { type: 'FETCH_PRICE_HISTORY', asin: pageInfo.asin, days },
        (keepaResult) => {
          if (keepaResult?.points?.length) {
            cachedHistoryPoints = keepaResult.points;
            renderPriceTab(cachedCurrentPrice, cachedOriginalPrice, cachedHistoryPoints);
          }
        }
      );
    }
  }
// ─── Sellers tab ────────────────────────────────────────────────────────────
// Cached state so switching periods doesn't re-fetch
let cachedSellerCount   = null;
let cachedBuyBoxSeller  = null;
let cachedSellerHistory = null; // null = mock; array = real

function renderSellersTab(sellerCount, buyBoxSeller, historyPoints) {
  const days = getSelectedDays();
  let points;
  const sourceNote = document.getElementById('seller-source-note');
  // 1 — Resolve real or mock data
  if (historyPoints && historyPoints.length) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    points = historyPoints.filter((p) => new Date(p.date) >= cutoff);

    if (sourceNote) {
      sourceNote.textContent = `Seller history from Keepa · ${points.length} data points`;
      sourceNote.classList.remove('note-mock');
      sourceNote.classList.add('note-real');
    }
  } else {
    points = mockSellerHistory(days, sellerCount);

    if (sourceNote) {
      sourceNote.textContent = '⚠ Seller history is simulated — add a Keepa API key for real data.';
      sourceNote.classList.remove('note-real');
      sourceNote.classList.add('note-mock');
    }
  }

  if (!points.length) points = mockSellerHistory(days, sellerCount);

  // Extract values
  const counts = points.map((p) => p.sellers);
  const lowest  = Math.min(...counts);
  const highest = Math.max(...counts);
  const average = counts.reduce((a, b) => a + b, 0) / counts.length;
  // 2 — Update DOM
  const el = (id) => document.getElementById(id);

  if (el('seller-current')) el('seller-current').textContent = sellerCount ?? '--';
  if (el('seller-buybox'))  el('seller-buybox').textContent  = buyBoxSeller ?? 'Unknown';

  if (el('seller-lowest'))  el('seller-lowest').textContent  = lowest;
  if (el('seller-average')) el('seller-average').textContent = average.toFixed(1);
  if (el('seller-highest')) el('seller-highest').textContent = highest;

  drawSellerChart(points);
}
// Mock seller history generator
function mockSellerHistory(days, baseCount) {
  const base = baseCount || 5;
  const now  = new Date();
  const out  = [];

  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);

    // Small deterministic wiggle
    const t = (i / Math.max(days, 1)) * Math.PI * 2;
    const v = Math.sin(t) * 1.2 + (i % 4) * 0.3 - 0.5;

    const sellers = Math.max(1, Math.round(base + v));
    out.push({ date: d.toISOString().split('T')[0], sellers });
  }

  // Force last point to match real seller count
  if (out.length && baseCount != null) out[out.length - 1].sellers = baseCount;

  return out;
}
// Load Sellers Tab
async function loadSellersTab() {
  const el = (id) => document.getElementById(id);
  if (el('seller-current')) el('seller-current').textContent = '--';

  let tab;
  try { tab = await getActiveTab(); } catch {
    renderSellersTab(null, null, null);
    return;
  }

  if (!SUPPORTED.test(tab?.url || '')) {
    renderSellersTab(null, null, null);
    return;
  }

  // 1 — Get seller info from page
  let sellerData = null;
  try {
    sellerData = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELLERS' });
  } catch {}

  cachedSellerCount  = sellerData?.count ?? null;
  cachedBuyBoxSeller = sellerData?.buybox ?? null;

  // 2 — Render immediately with mock history
  renderSellersTab(cachedSellerCount, cachedBuyBoxSeller, null);

  // 3 — Request real seller history from Keepa
  let pageInfo = null;
  try {
    pageInfo = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRODUCT_INFO' });
  } catch {}

  if (pageInfo?.asin) {
    const days = getSelectedDays();
    chrome.runtime.sendMessage(
      { type: 'FETCH_SELLER_HISTORY', asin: pageInfo.asin, days },
      (keepaResult) => {
        if (keepaResult?.points?.length) {
          cachedSellerHistory = keepaResult.points;
          renderSellersTab(cachedSellerCount, cachedBuyBoxSeller, cachedSellerHistory);
        }
      }
    );
  }
}
  // ─── Chart ────────────────────────────────────────────────────────────────

  function drawPriceChart(data) {
    const canvas = document.getElementById('price-chart');
    if (!canvas || !data.length) return;
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
    const yMin  = minP - range * 0.15, yMax = maxP + range * 0.15;
    const xOf = (i) => PAD.left + (i / (data.length - 1)) * plotW;
    const yOf = (p) => PAD.top  + (1 - (p - yMin) / (yMax - yMin)) * plotH;

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
    for (let g = 0; g <= 3; g++) {
      const y = PAD.top + (g / 3) * plotH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + plotW, y); ctx.stroke();
    }
    // Y labels
    ctx.fillStyle = '#5c6370'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 3; g++) {
      const p = yMax - (g / 3) * (yMax - yMin);
      ctx.fillText('$' + p.toFixed(0), PAD.left - 4, PAD.top + (g / 3) * plotH);
    }
    // X labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [0, Math.floor((data.length - 1) / 2), data.length - 1].forEach((i) => {
      const d = new Date(data[i].date + 'T12:00:00');
      ctx.fillText((d.getMonth() + 1) + '/' + d.getDate(), xOf(i), PAD.top + plotH + 5);
    });
    // Gradient fill
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH);
    grad.addColorStop(0, 'rgba(191,87,0,0.18)');
    grad.addColorStop(1, 'rgba(191,87,0,0.00)');
    ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(xOf(i), yOf(d.price)) : ctx.lineTo(xOf(i), yOf(d.price)); });
    ctx.lineTo(xOf(data.length - 1), PAD.top + plotH);
    ctx.lineTo(xOf(0), PAD.top + plotH);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    // Line
    ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(xOf(i), yOf(d.price)) : ctx.lineTo(xOf(i), yOf(d.price)); });
    ctx.strokeStyle = '#bf5700'; ctx.lineWidth = 1.75; ctx.lineJoin = 'round'; ctx.stroke();
    // Today dot
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
      el.textContent = `$${Math.abs(diff).toFixed(2)} (${pct.toFixed(1)}% below avg)`; el.classList.add('below-avg');
    } else {
      el.textContent = `$${diff.toFixed(2)} (${pct.toFixed(1)}% above avg)`; el.classList.add('above-avg');
    }
  }

  // ─── Page status + init ───────────────────────────────────────────────────

  async function updatePageStatus() {
    const el = document.querySelector('.page-status');
    if (!el) return;
    try {
      const tab = await getActiveTab();
      el.textContent = SUPPORTED.test(tab?.url || '')
        ? 'Product page detected.'
        : 'Visit a product page on Amazon, Walmart, or eBay.';
    } catch {
      el.textContent = 'Visit a product page on Amazon, Walmart, or eBay.';
    }
  }

  loadReviews();
  updatePageStatus();
})();
