/**
 * YouTube Transcript Scraper - Content Script
 * Runs in the context of YouTube video pages.
 * Features:
 *  1. In-browser direct caption track discovery & extraction (zero rate-limits, works with cookies/sessions).
 *  2. Video timeline seeking on timestamp clicks.
 *  3. Injected "📝 Transcript" button and side drawer right on the YouTube page.
 */

// Helper to extract video ID from URL
function getCurrentVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("v");
}

// Extract captions metadata from DOM or page context
function getCaptionTracksFromPage() {
  try {
    // 1. Try finding ytInitialPlayerResponse in script tags
    const html = document.documentElement.innerHTML;
    const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});(?:\s*var\s|\s*<\/script)/s) ||
                  html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);

    if (match && match[1]) {
      const parsed = JSON.parse(match[1]);
      const tracks = parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks && tracks.length > 0) {
        return tracks;
      }
    }
  } catch (err) {
    console.warn("[YT Transcript Scraper] Could not parse ytInitialPlayerResponse from HTML:", err);
  }

  return null;
}

// Fetch and parse timedtext track (supports JSON3 and XML formats)
async function fetchTranscriptFromTrack(baseUrl) {
  // First try JSON3 format
  try {
    const jsonUrl = baseUrl.includes("fmt=") ? baseUrl : `${baseUrl}&fmt=json3`;
    const response = await fetch(jsonUrl, { credentials: "include" });
    if (response.ok) {
      const data = await response.json();
      if (data && data.events) {
        const snippets = [];
        for (const evt of data.events) {
          if (!evt.segs || evt.tStartMs === undefined) continue;
          const text = evt.segs.map(s => s.utf8 || "").join("").trim();
          if (!text || text === "\n") continue;
          snippets.push({
            text: text,
            start: evt.tStartMs / 1000.0,
            duration: (evt.dDurationMs || 0) / 1000.0
          });
        }
        if (snippets.length > 0) return snippets;
      }
    }
  } catch (e) {
    console.log("[YT Transcript Scraper] JSON3 fetch fallback to XML:", e);
  }

  // Fallback to standard XML timedtext
  const xmlResponse = await fetch(baseUrl, { credentials: "include" });
  const xmlText = await xmlResponse.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  const textNodes = xmlDoc.getElementsByTagName("text");
  const snippets = [];

  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i];
    const start = parseFloat(node.getAttribute("start") || "0");
    const dur = parseFloat(node.getAttribute("dur") || "0");
    let content = node.textContent || "";
    // Unescape HTML entities
    const doc = new DOMParser().parseFromString(content, "text/html");
    content = doc.body.textContent || "";
    if (content.trim()) {
      snippets.push({
        text: content.trim(),
        start: start,
        duration: dur
      });
    }
  }

  return snippets;
}

// Seek video to specific time (seconds)
function seekVideo(seconds) {
  const video = document.querySelector("video");
  if (video) {
    video.currentTime = parseFloat(seconds);
    video.play();
  }
}

// Format seconds into MM:SS or HH:MM:SS
function formatTime(seconds) {
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// In-Page Side Drawer UI
function injectInPageDrawer() {
  if (document.getElementById("yt-transcript-scraper-drawer")) return;

  const drawer = document.createElement("div");
  drawer.id = "yt-transcript-scraper-drawer";
  drawer.innerHTML = `
    <div class="yts-drawer-header">
      <div class="yts-drawer-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#ff0033"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
        <span>Video Transcript</span>
      </div>
      <div class="yts-drawer-actions">
        <button id="yts-drawer-close" title="Close">✕</button>
      </div>
    </div>
    <div class="yts-drawer-search">
      <input type="text" id="yts-drawer-search-input" placeholder="Search transcript..." />
    </div>
    <div class="yts-drawer-body" id="yts-drawer-body">
      <div class="yts-loading">Loading transcript...</div>
    </div>
    <div class="yts-drawer-footer">
      <button class="yts-btn" id="yts-copy-btn">📋 Copy</button>
      <button class="yts-btn" id="yts-download-txt-btn">⬇ .TXT</button>
      <button class="yts-btn" id="yts-download-srt-btn">⬇ .SRT</button>
    </div>
  `;

  // Inject Styles
  const style = document.createElement("style");
  style.id = "yt-transcript-scraper-style";
  style.textContent = `
    #yt-transcript-scraper-drawer {
      position: fixed;
      top: 60px;
      right: 16px;
      width: 360px;
      height: calc(100vh - 80px);
      background: #0f0f0f;
      color: #f1f1f1;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.7);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-sizing: border-box;
      backdrop-filter: blur(10px);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .yts-drawer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .yts-drawer-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 15px;
    }
    #yts-drawer-close {
      background: none;
      border: none;
      color: #aaa;
      font-size: 16px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
    }
    #yts-drawer-close:hover {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
    .yts-drawer-search {
      padding: 8px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    #yts-drawer-search-input {
      width: 100%;
      background: #222;
      border: 1px solid #333;
      color: #fff;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
      box-sizing: border-box;
    }
    #yts-drawer-search-input:focus {
      border-color: #ff0033;
    }
    .yts-drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .yts-snippet {
      display: flex;
      gap: 10px;
      font-size: 13px;
      line-height: 1.4;
      cursor: pointer;
      padding: 6px 8px;
      border-radius: 6px;
      transition: background 0.15s;
    }
    .yts-snippet:hover {
      background: rgba(255,255,255,0.08);
    }
    .yts-timestamp {
      color: #3ea6ff;
      font-weight: 500;
      min-width: 44px;
      user-select: none;
    }
    .yts-text {
      color: #e0e0e0;
      flex: 1;
    }
    .yts-drawer-footer {
      display: flex;
      gap: 8px;
      padding: 10px 16px;
      border-top: 1px solid rgba(255,255,255,0.1);
      background: #141414;
      border-radius: 0 0 12px 12px;
    }
    .yts-btn {
      flex: 1;
      background: #272727;
      color: #fff;
      border: 1px solid #3f3f3f;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    .yts-btn:hover {
      background: #3a3a3a;
    }
    .yts-loading, .yts-empty {
      text-align: center;
      color: #888;
      margin-top: 40px;
      font-size: 14px;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(drawer);

  // Close handler
  document.getElementById("yts-drawer-close").addEventListener("click", () => {
    drawer.remove();
    style.remove();
  });

  loadDrawerTranscript();
}

let activeDrawerSnippets = [];

async function loadDrawerTranscript() {
  const body = document.getElementById("yts-drawer-body");
  if (!body) return;

  const tracks = getCaptionTracksFromPage();
  if (!tracks || tracks.length === 0) {
    body.innerHTML = '<div class="yts-empty">No caption tracks detected for this video in page context. Use the extension icon to try the Python API mode.</div>';
    return;
  }

  try {
    // Pick first track (prefer English or first available)
    const track = tracks.find(t => t.languageCode === "en") || tracks[0];
    const snippets = await fetchTranscriptFromTrack(track.baseUrl);
    activeDrawerSnippets = snippets;

    if (!snippets || snippets.length === 0) {
      body.innerHTML = '<div class="yts-empty">Transcript track was empty.</div>';
      return;
    }

    renderDrawerSnippets(snippets);

    // Setup search filter
    const searchInput = document.getElementById("yts-drawer-search-input");
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderDrawerSnippets(snippets);
        return;
      }
      const filtered = snippets.filter(s => s.text.toLowerCase().includes(q));
      renderDrawerSnippets(filtered, q);
    });

    // Setup Copy
    document.getElementById("yts-copy-btn").addEventListener("click", () => {
      const fullText = snippets.map(s => `[${formatTime(s.start)}] ${s.text}`).join("\n");
      navigator.clipboard.writeText(fullText).then(() => {
        alert("Transcript copied to clipboard!");
      });
    });

    // Setup Download TXT
    document.getElementById("yts-download-txt-btn").addEventListener("click", () => {
      const fullText = snippets.map(s => s.text).join(" ");
      downloadFile(fullText, `transcript_${getCurrentVideoId()}.txt`, "text/plain");
    });

    // Setup Download SRT
    document.getElementById("yts-download-srt-btn").addEventListener("click", () => {
      const srt = formatToSRT(snippets);
      downloadFile(srt, `transcript_${getCurrentVideoId()}.srt`, "text/plain");
    });

  } catch (err) {
    body.innerHTML = `<div class="yts-empty">Error fetching transcript: ${err.message}</div>`;
  }
}

function renderDrawerSnippets(snippets, highlight = "") {
  const body = document.getElementById("yts-drawer-body");
  if (!body) return;

  if (snippets.length === 0) {
    body.innerHTML = '<div class="yts-empty">No matching lines found.</div>';
    return;
  }

  body.innerHTML = snippets.map(s => {
    let displayText = s.text;
    if (highlight) {
      const regex = new RegExp(`(${highlight})`, "gi");
      displayText = displayText.replace(regex, "<mark style='background:#ff0033;color:#fff;'>$1</mark>");
    }
    return `
      <div class="yts-snippet" data-start="${s.start}">
        <span class="yts-timestamp">${formatTime(s.start)}</span>
        <span class="yts-text">${displayText}</span>
      </div>
    `;
  }).join("");

  // Attach click listener for seeking
  body.querySelectorAll(".yts-snippet").forEach(el => {
    el.addEventListener("click", () => {
      const time = el.getAttribute("data-start");
      seekVideo(time);
    });
  });
}

function formatToSRT(snippets) {
  let srt = "";
  snippets.forEach((item, index) => {
    const start = formatSRTTime(item.start);
    const end = formatSRTTime(item.start + (item.duration || 2));
    srt += `${index + 1}\n${start} --> ${end}\n${item.text}\n\n`;
  });
  return srt;
}

function formatSRTTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Inject inline button under YouTube video player
function injectInlineButton() {
  if (document.getElementById("yts-inline-action-btn")) return;

  const targetContainer = document.querySelector("#top-level-buttons-computed") ||
                          document.querySelector("#actions-inner") ||
                          document.querySelector("#actions");

  if (!targetContainer) return;

  const btn = document.createElement("button");
  btn.id = "yts-inline-action-btn";
  btn.className = "yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m";
  btn.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 8px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 18px;
    color: #f1f1f1;
    padding: 0 16px;
    height: 36px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  `;
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#ff0033"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
    <span>Transcript</span>
  `;

  btn.addEventListener("click", () => {
    const existing = document.getElementById("yt-transcript-scraper-drawer");
    if (existing) {
      existing.remove();
      document.getElementById("yt-transcript-scraper-style")?.remove();
    } else {
      injectInPageDrawer();
    }
  });

  targetContainer.appendChild(btn);
}

// Observe DOM for YouTube client-side SPA navigation
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // URL changed
    document.getElementById("yt-transcript-scraper-drawer")?.remove();
    document.getElementById("yts-inline-action-btn")?.remove();
  }
  if (location.href.includes("watch?v=")) {
    injectInlineButton();
  }
});
if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  window.addEventListener("DOMContentLoaded", () => {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });
}

// Listen for messages from Extension Popup or Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_PAGE_DATA") {
    const videoId = getCurrentVideoId();
    const tracks = getCaptionTracksFromPage();
    sendResponse({
      videoId: videoId,
      title: document.title.replace(" - YouTube", ""),
      hasTracks: !!(tracks && tracks.length > 0),
      tracks: tracks || []
    });
    return true;
  }

  if (request.action === "FETCH_PAGE_TRANSCRIPT") {
    const tracks = getCaptionTracksFromPage();
    if (!tracks || tracks.length === 0) {
      sendResponse({ success: false, error: "No caption tracks found in active page." });
      return true;
    }
    const targetLang = request.languageCode || "en";
    let track = tracks.find(t => t.languageCode.startsWith(targetLang));
    let fetchUrl = "";
    if (track) {
      fetchUrl = track.baseUrl;
    } else {
      // Pick English or first track and translate to requested language (e.g. Bangla: &tlang=bn)
      const baseTrack = tracks.find(t => t.languageCode.startsWith("en")) || tracks[0];
      fetchUrl = `${baseTrack.baseUrl}&tlang=${targetLang}`;
      track = baseTrack;
    }
    fetchTranscriptFromTrack(fetchUrl)
      .then(snippets => sendResponse({ success: true, snippets, track }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep async response channel open
  }

  if (request.action === "SEEK_VIDEO") {
    seekVideo(request.time);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "OPEN_INPAGE_TRANSCRIPT") {
    injectInPageDrawer();
    sendResponse({ success: true });
    return true;
  }
});

