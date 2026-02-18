/**
 * Tuffy Reviews – Content script
 * Runs on Amazon, Walmart, Target, Best Buy product pages.
 * Later: extract product ID/URL and send to popup or background for API calls.
 */

(function () {
  const host = window.location.hostname;

  function getProductContext() {
    // Stub: detect product page and return minimal context for this domain.
    // Each retailer has different DOM structure; this will be expanded per-feature.
    if (host.includes('amazon.com')) {
      return { retailer: 'amazon', url: window.location.href };
    }
    if (host.includes('walmart.com')) {
      return { retailer: 'walmart', url: window.location.href };
    }
    if (host.includes('target.com')) {
      return { retailer: 'target', url: window.location.href };
    }
    if (host.includes('bestbuy.com')) {
      return { retailer: 'bestbuy', url: window.location.href };
    }
    return null;
  }

  const context = getProductContext();
  if (context) {
    // Store for popup/background to read. Could use chrome.storage or custom events.
    chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT', context }).catch(() => {});
  }
})();
