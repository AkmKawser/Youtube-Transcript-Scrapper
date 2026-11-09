/**
 * Background Service Worker for YouTube Transcript Scraper
 */

// Listen for tab navigation (YouTube SPA navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.url.includes("youtube.com/watch")) {
    // Notify content script of page update if needed
    chrome.tabs.sendMessage(tabId, { action: "YOUTUBE_NAVIGATED", url: tab.url }).catch(() => {
      // Content script may not be loaded yet or tab is not active
    });
  }
});

// Setup context menu safely if permission is present
if (chrome.contextMenus) {
  chrome.runtime.onInstalled.addListener(() => {
    try {
      chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
          id: "scrape_youtube_transcript",
          title: "Scrape Transcript for this Video",
          contexts: ["page", "video"],
          documentUrlPatterns: ["*://*.youtube.com/watch*"]
        }, () => {
          if (chrome.runtime.lastError) {
            // Ignore duplicate menu creation error if any
          }
        });
      });
    } catch (e) {
      console.warn("Context menu setup warning:", e);
    }
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "scrape_youtube_transcript" && tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: "OPEN_INPAGE_TRANSCRIPT" }).catch(() => {
        // Fallback: if message fails, try injecting content script
      });
    }
  });
}

// Central message broker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_CURRENT_TAB_URL") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        sendResponse({ tab: tabs[0] });
      } else {
        sendResponse({ tab: null });
      }
    });
    return true; // Keep message channel open for async response
  }
});
