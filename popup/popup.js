/**
 * Tuffy Reviews – Popup script
 * Handles tab switching and (later) loading product context from the active tab.
 */

(function () {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

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
    if (selectedTab === 'price') updatePriceStats();
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      switchTab(tab.getAttribute('data-tab'));
    });
  });

  // Period selector: update active state and refresh stats (sub-feature 4).
  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updatePriceStats();
    });
  });

  /**
   * Mock price data for the Price tab (sub-feature 2).
   * Returns an array of { date: Date, price: number } for the given number of days.
   * Uses a deterministic pattern so the same `days` gives the same series (no random seed needed).
   */
  function getMockPriceData(days) {
    const basePrice = 49.99;
    const now = new Date();
    const data = [];

    for (let i = days; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      // Deterministic variation: ±12% based on day index (reproducible)
      const t = (i / Math.max(days, 1)) * Math.PI * 2;
      const variation = Math.sin(t) * 0.06 + (i % 5) * 0.008 - 0.02;
      const price = Math.round(basePrice * (1 + variation) * 100) / 100;
      data.push({ date, price });
    }

    return data;
  }

  /** Get selected period in days from the Price tab period buttons (sub-feature 3). */
  function getSelectedPricePeriod() {
    const active = document.querySelector('.period-btn.active');
    return active ? parseInt(active.getAttribute('data-days'), 10) : 90;
  }

  /**
   * Update Price tab stats from mock data (sub-feature 3).
   * Fills Current price, Lowest, Average, Highest.
   */
  function updatePriceStats() {
    const days = getSelectedPricePeriod();
    const data = getMockPriceData(days);
    const prices = data.map((d) => d.price);
    const current = prices[prices.length - 1];
    const lowest = Math.min(...prices);
    const highest = Math.max(...prices);
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;

    const fmt = (n) => '$' + n.toFixed(2);
    const currentEl = document.getElementById('current-price');
    const lowestEl = document.getElementById('price-lowest');
    const avgEl = document.getElementById('price-average');
    const highestEl = document.getElementById('price-highest');
    if (currentEl) currentEl.textContent = fmt(current);
    if (lowestEl) lowestEl.textContent = fmt(lowest);
    if (avgEl) avgEl.textContent = fmt(average);
    if (highestEl) highestEl.textContent = fmt(highest);
  }

  // Optional: ask content script for current page context (product URL, etc.)
  // Will be used when we implement "get product info from page"
  async function updatePageStatus() {
    const statusEl = document.querySelector('.page-status');
    if (!statusEl) return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const supported = /amazon\.com|walmart\.com|target\.com|bestbuy\.com/.test(tab.url);
        statusEl.textContent = supported
          ? 'Product page detected. Insights will load here.'
          : 'Visit a product page on Amazon, Walmart, Target, or Best Buy to see insights.';
      }
    } catch (_) {
      statusEl.textContent = 'Visit a product page on Amazon, Walmart, Target, or Best Buy to see insights.';
    }
  }

  updatePageStatus();
})();
