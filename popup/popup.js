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
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      switchTab(tab.getAttribute('data-tab'));
    });
  });

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
