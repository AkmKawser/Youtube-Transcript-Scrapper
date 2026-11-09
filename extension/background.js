/**
 * Background Service Worker for YouTube Transcript Scraper
 * Handles:
 *  - DeclarativeNetRequest rule so Innertube POST requests from extension contexts have Origin: https://www.youtube.com
 *  - Cross-origin DVR segment fetching (bypassing youtube.com content-script CORS via *://*.googlevideo.com/* permission)
 *  - Context menu and SPA tab navigation notifications
 */

function registerYoutubeOriginRule() {
  if (!chrome.declarativeNetRequest) return;
  chrome.declarativeNetRequest
    .updateDynamicRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              { header: "Origin", operation: "set", value: "https://www.youtube.com" },
              { header: "Referer", operation: "set", value: "https://www.youtube.com/" }
            ]
          },
          condition: {
            urlFilter: "||youtube.com/youtubei/v1/",
            resourceTypes: ["xmlhttprequest"]
          }
        }
      ]
    })
    .catch(err => console.warn("DNR rule warning:", err));
}

registerYoutubeOriginRule();

// Listen for tab navigation (YouTube SPA navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.url.includes("youtube.com/watch")) {
    chrome.tabs.sendMessage(tabId, { action: "YOUTUBE_NAVIGATED", url: tab.url }).catch(() => {});
  }
});

// Setup context menu safely if permission is present
if (chrome.contextMenus) {
  chrome.runtime.onInstalled.addListener(() => {
    registerYoutubeOriginRule();
    try {
      chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create(
          {
            id: "scrape_youtube_transcript",
            title: "Scrape Transcript for this Video",
            contexts: ["page", "video"],
            documentUrlPatterns: ["*://*.youtube.com/watch*"]
          },
          () => {
            if (chrome.runtime.lastError) {
              // Ignore duplicate menu creation error
            }
          }
        );
      });
    } catch (e) {
      console.warn("Context menu setup warning:", e);
    }
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "scrape_youtube_transcript" && tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: "OPEN_INPAGE_TRANSCRIPT" }).catch(() => {});
    }
  });
}

// Central message broker (including CORS-free fetching for content scripts)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_CURRENT_TAB_URL") {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      sendResponse({ tab: tabs && tabs[0] ? tabs[0] : null });
    });
    return true;
  }

  // Generic CORS-free fetch proxy for content.js
  if (request.action === "BACKGROUND_FETCH") {
    (async () => {
      try {
        const resp = await fetch(request.url, request.options || {});
        const text = await resp.text();
        sendResponse({ ok: resp.ok, status: resp.status, text });
      } catch (err) {
        sendResponse({ ok: false, status: 0, error: err.message });
      }
    })();
    return true;
  }
});
