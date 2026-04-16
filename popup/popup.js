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
    if (selectedTab === 'trust')   loadTrustTab();
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => switchTab(tab.getAttribute('data-tab'))));

  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const pricePanel = document.getElementById('panel-price');
      const priceTabVisible = !!pricePanel && pricePanel.classList.contains('active');
      if (priceTabVisible) {
        requestPriceHistoryForSelectedPeriod().catch(() => {
          renderPriceTab(cachedCurrentPrice, cachedOriginalPrice, cachedHistoryPoints);
        });
      } else {
        // Re-render with cached price + cached history points
        renderPriceTab(cachedCurrentPrice, cachedOriginalPrice, cachedHistoryPoints);
      }
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

  function sendRuntimeMessage(payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(payload, (response) => resolve(response || null));
    });
  }

  const SUPPORTED = /amazon\.com|walmart\.com|ebay\.com/;
  const RETAILER_LABEL = { amazon: 'Amazon', walmart: 'Walmart', ebay: 'eBay' };

  // ─── Reviews tab ──────────────────────────────────────────────────────────

  function setPrimary(html) {
    const el = document.getElementById('reviews-primary');
    if (el) el.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function reviewSummaryHtml(summaryText) {
    const text = escapeHtml(summaryText || '');
    return `
      <div class="review-summary-block">
        <div class="review-summary-title">Review Summary</div>
        <div class="review-summary-text">${text}</div>
      </div>`;
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
    const crossSiteEl = document.getElementById('reviews-cross-site');
    if (crossSiteEl) crossSiteEl.style.display = 'none';

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
    const reviewSummary = primary?.reviewSummary;
    const summaryHtml = reviewSummary ? reviewSummaryHtml(reviewSummary) : '';

    if (!reviews.length) {
      setPrimary(`
        ${summaryHtml}
        <p class="placeholder">No reviews found on this page.</p>
        <p class="placeholder" style="margin-top:6px;font-size:11px;">Make sure you're on a product detail page.</p>`);
    } else {
      setPrimary(`${summaryHtml}${sectionHtml(`Top reviews · ${label}`, reviews, 'api', true)}`);
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

  // ─── Trust tab ────────────────────────────────────────────────────────────

  function trustTone(score) {
    if (score >= 80) return { label: 'High trust', color: '#1a7a3c' };
    if (score >= 60) return { label: 'Moderate trust', color: '#0f766e' };
    if (score >= 40) return { label: 'Mixed trust', color: '#b45309' };
    return { label: 'Low trust', color: '#b91c1c' };
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function parseReviewDate(value) {
    if (!value) return null;
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
    return null;
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function computeTrustMetrics(reviews) {
    const rated = reviews.filter((r) => typeof r.rating === 'number' && Number.isFinite(r.rating));
    const withBody = reviews.filter((r) => (r.body || '').trim().length > 0);
    const verified = reviews.filter((r) => r.verified);
    const low = rated.filter((r) => r.rating <= 2);
    const high = rated.filter((r) => r.rating >= 4);
    const extreme = rated.filter((r) => r.rating <= 1 || r.rating >= 5);

    const avgRating = rated.length
      ? rated.reduce((sum, r) => sum + r.rating, 0) / rated.length
      : null;
    const verifiedRate = reviews.length ? verified.length / reviews.length : 0;
    const lowRate = rated.length ? low.length / rated.length : 0;
    const highRate = rated.length ? high.length / rated.length : 0;
    const extremeRate = rated.length ? extreme.length / rated.length : 0;
    const bodyRate = reviews.length ? withBody.length / reviews.length : 0;

    // Duplicate-text signal.
    const bodyBuckets = new Map();
    withBody.forEach((review) => {
      const key = normalizeText(review.body);
      if (!key || key.length < 20) return;
      bodyBuckets.set(key, (bodyBuckets.get(key) || 0) + 1);
    });
    let duplicateReviews = 0;
    bodyBuckets.forEach((count) => {
      if (count > 1) duplicateReviews += count;
    });
    const duplicateRate = reviews.length ? duplicateReviews / reviews.length : 0;

    // Recency burst signal: many reviews clustered in <= 7 days.
    const parsedDates = reviews
      .map((r) => parseReviewDate(r.date))
      .filter(Boolean)
      .sort((a, b) => a - b);
    let burstRate = 0;
    if (parsedDates.length >= 4) {
      const msWindow = 7 * 24 * 60 * 60 * 1000;
      let maxInWindow = 1;
      for (let i = 0; i < parsedDates.length; i += 1) {
        let count = 1;
        for (let j = i + 1; j < parsedDates.length; j += 1) {
          if (parsedDates[j] - parsedDates[i] <= msWindow) count += 1;
          else break;
        }
        if (count > maxInWindow) maxInWindow = count;
      }
      burstRate = maxInWindow / parsedDates.length;
    }

    const sampleConfidence = clamp(reviews.length / 8, 0.35, 1);

    // Stronger heuristic: quality signals, manipulation penalties, and confidence weighting.
    let score = 50;
    if (avgRating != null) {
      score += ((avgRating - 3) / 2) * 30; // roughly -30..+30 contribution
    }
    score += (verifiedRate - 0.5) * 20;
    score += (bodyRate - 0.5) * 10;
    score -= lowRate * 25;
    score += highRate * 10;
    score -= extremeRate * 10;
    score -= duplicateRate * 25;
    score -= Math.max(0, burstRate - 0.6) * 25;
    score = 50 + (score - 50) * sampleConfidence;
    score = Math.round(clamp(score, 0, 100));

    return {
      score,
      avgRating,
      verifiedRate,
      lowRate,
      highRate,
      extremeRate,
      duplicateRate,
      burstRate,
      sampleConfidence,
    };
  }

  function renderTrustFallback(message) {
    const subtitle = document.getElementById('trust-retailer-label');
    const badge = document.getElementById('trust-score-badge');
    const band = document.getElementById('trust-band-fill');
    const pillRow = document.getElementById('trust-pill-row');
    const avg = document.getElementById('trust-avg-rating');
    const verified = document.getElementById('trust-verified-rate');
    const low = document.getElementById('trust-low-rate');
    const reasons = document.getElementById('trust-reasons');
    const flags = document.getElementById('trust-flag-row');
    const flagDetail = document.getElementById('trust-flag-detail');

    if (subtitle) subtitle.textContent = message;
    if (badge) {
      badge.textContent = '--';
      badge.style.background = '#6b7280';
    }
    if (band) {
      band.style.width = '0%';
      band.style.background = '#6b7280';
    }
    if (pillRow) pillRow.innerHTML = '<span class="trust-pill">No data yet</span>';
    if (avg) avg.textContent = '--';
    if (verified) verified.textContent = '--';
    if (low) low.textContent = '--';
    if (flags) flags.innerHTML = '<span class="trust-flag trust-flag-neutral">No risk analysis yet</span>';
    if (flagDetail) flagDetail.textContent = 'Tap a risk flag to see details.';
    if (reasons) reasons.innerHTML = '<li>Open the Trust tab on a supported product detail page.</li>';
  }

  function riskLevel(value, lowCutoff, highCutoff) {
    if (value >= highCutoff) return 'high';
    if (value >= lowCutoff) return 'medium';
    return 'low';
  }

  function riskBadgeHtml(label, level, key) {
    const className =
      level === 'high' ? 'trust-flag-high'
      : level === 'medium' ? 'trust-flag-medium'
      : 'trust-flag-low';
    return `<span class="trust-flag ${className}" data-risk-key="${key}">${label}</span>`;
  }

  function setRiskFlagInteraction(detailMap) {
    const flags = document.getElementById('trust-flag-row');
    const detail = document.getElementById('trust-flag-detail');
    if (!flags || !detail) return;

    flags.querySelectorAll('.trust-flag').forEach((badge) => {
      const key = badge.getAttribute('data-risk-key');
      if (!key || !detailMap[key]) return;
      badge.addEventListener('click', () => {
        detail.textContent = detailMap[key];
      });
    });
  }

  async function loadTrustTab() {
    renderTrustFallback('Analyzing this product page…');

    let tab;
    try {
      tab = await getActiveTab();
    } catch {
      renderTrustFallback('Could not access the current tab.');
      return;
    }

    if (!SUPPORTED.test(tab?.url || '')) {
      renderTrustFallback('Visit Amazon, Walmart, or eBay product pages.');
      return;
    }

    let primary;
    try {
      primary = await chrome.tabs.sendMessage(tab.id, { type: 'GET_REVIEWS' });
    } catch {
      renderTrustFallback('Could not read reviews. Refresh the page and try again.');
      return;
    }

    const reviews = primary?.reviews || [];
    const retailer = primary?.retailer || 'this site';
    if (!reviews.length) {
      renderTrustFallback('No review signals found on this page.');
      return;
    }

    const metrics = computeTrustMetrics(reviews);
    const tone = trustTone(metrics.score);

    const subtitle = document.getElementById('trust-retailer-label');
    const badge = document.getElementById('trust-score-badge');
    const band = document.getElementById('trust-band-fill');
    const pillRow = document.getElementById('trust-pill-row');
    const avg = document.getElementById('trust-avg-rating');
    const verified = document.getElementById('trust-verified-rate');
    const low = document.getElementById('trust-low-rate');
    const reasons = document.getElementById('trust-reasons');
    const flags = document.getElementById('trust-flag-row');

    if (subtitle) subtitle.textContent = `${RETAILER_LABEL[retailer] || 'This retailer'} review signals`;
    if (badge) {
      badge.textContent = String(metrics.score);
      badge.style.background = tone.color;
    }
    if (band) {
      band.style.width = `${metrics.score}%`;
      band.style.background = tone.color;
    }

    if (pillRow) {
      const counted = `${reviews.length} reviews`;
      const confidence = metrics.avgRating != null ? tone.label : 'Limited signals';
      const confidencePct = Math.round(metrics.sampleConfidence * 100);
      pillRow.innerHTML = [
        `<span class="trust-pill">${counted}</span>`,
        `<span class="trust-pill">${confidence}</span>`,
        `<span class="trust-pill">Confidence ${confidencePct}%</span>`,
      ].join('');
    }

    if (avg) avg.textContent = metrics.avgRating != null ? `${metrics.avgRating.toFixed(1)} / 5` : '--';
    if (verified) verified.textContent = `${Math.round(metrics.verifiedRate * 100)}%`;
    if (low) low.textContent = `${Math.round(metrics.lowRate * 100)}%`;

    if (flags) {
      const duplicateLevel = riskLevel(metrics.duplicateRate, 0.2, 0.35);
      const burstLevel = riskLevel(metrics.burstRate, 0.65, 0.8);
      const extremeLevel = riskLevel(metrics.extremeRate, 0.65, 0.85);
      const lowStarLevel = riskLevel(metrics.lowRate, 0.25, 0.4);

      flags.innerHTML = [
        riskBadgeHtml(`Duplicate text: ${duplicateLevel}`, duplicateLevel, 'duplicate'),
        riskBadgeHtml(`Review burst: ${burstLevel}`, burstLevel, 'burst'),
        riskBadgeHtml(`Extreme ratings: ${extremeLevel}`, extremeLevel, 'extreme'),
        riskBadgeHtml(`Low-star share: ${lowStarLevel}`, lowStarLevel, 'lowstar'),
      ].join('');

      setRiskFlagInteraction({
        duplicate: `Duplicate text rate is ${Math.round(metrics.duplicateRate * 100)}%. Higher repeat wording can indicate copied or coordinated reviews.`,
        burst: `Burst concentration is ${Math.round(metrics.burstRate * 100)}% within the densest 7-day window. Heavy clustering can be a manipulation signal.`,
        extreme: `${Math.round(metrics.extremeRate * 100)}% of ratings are 1-star or 5-star. Extreme-heavy distributions can reduce trust confidence.`,
        lowstar: `${Math.round(metrics.lowRate * 100)}% of rated reviews are 1-2 stars. A high share may indicate product quality or expectation issues.`,
      });
    }

    if (reasons) {
      const reasonLines = [];
      if (metrics.avgRating != null) reasonLines.push(`Average rating is ${metrics.avgRating.toFixed(1)} out of 5.`);
      reasonLines.push(`${Math.round(metrics.verifiedRate * 100)}% of sampled reviews are marked verified.`);
      reasonLines.push(`${Math.round(metrics.lowRate * 100)}% of rated reviews are 1-2 stars.`);
      reasonLines.push(`${Math.round(metrics.extremeRate * 100)}% of ratings are extreme (1 or 5 stars).`);
      reasonLines.push(`${Math.round(metrics.duplicateRate * 100)}% of sampled reviews look textually duplicated.`);
      reasonLines.push(`${Math.round(metrics.burstRate * 100)}% of dated reviews fall within the densest 7-day window.`);
      reasonLines.push('Trust score is heuristic and updates from on-page review data.');
      reasons.innerHTML = reasonLines.map((line) => `<li>${line}</li>`).join('');
    }
  }

  // ─── Price tab ────────────────────────────────────────────────────────────

  // State cached so period changes don't need to re-fetch
  let cachedCurrentPrice  = null;
  let cachedOriginalPrice = null;
  let cachedHistoryPoints = null; // null = use mock; array = use real
  let cachedHistoryDays   = 0;
  let cachedPriceAsin     = null;

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
        sourceNote.textContent = `Price history updates automatically · ${points.length} data points`;
        sourceNote.classList.remove('note-mock');
        sourceNote.classList.add('note-real');
      }
    } else {
      points = mockHistory(days, currentPrice);
      if (sourceNote) {
        sourceNote.textContent = 'Price history updates automatically.';
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

  async function requestPriceHistoryForSelectedPeriod() {
    const days = getSelectedDays();

    // No product ID available; continue with mock rendering.
    if (!cachedPriceAsin) {
      renderPriceTab(cachedCurrentPrice, cachedOriginalPrice, null);
      return;
    }

    // Already have enough real history to cover this window.
    if (cachedHistoryPoints?.length && cachedHistoryDays >= days) {
      renderPriceTab(cachedCurrentPrice, cachedOriginalPrice, cachedHistoryPoints);
      return;
    }

    const keepaResult = await sendRuntimeMessage({
      type: 'FETCH_PRICE_HISTORY',
      asin: cachedPriceAsin,
      days,
    });

    if (keepaResult?.points?.length) {
      cachedHistoryPoints = keepaResult.points;
      cachedHistoryDays = days;
      renderPriceTab(cachedCurrentPrice, cachedOriginalPrice, cachedHistoryPoints);
      return;
    }

    // Keep previous real points if we had any; otherwise fallback to mock.
    renderPriceTab(cachedCurrentPrice, cachedOriginalPrice, cachedHistoryPoints);
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

    cachedPriceAsin = pageInfo?.asin || null;
    await requestPriceHistoryForSelectedPeriod();
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
