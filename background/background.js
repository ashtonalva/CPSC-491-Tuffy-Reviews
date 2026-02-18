/**
 * Tuffy Reviews – Background service worker
 * Handles messages from popup/content, API orchestration, and caching (later).
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PAGE_CONTEXT') {
    // Stub: later we can cache or forward to API.
    sendResponse({ ok: true });
  }
  return true; // keep channel open for async sendResponse
});
