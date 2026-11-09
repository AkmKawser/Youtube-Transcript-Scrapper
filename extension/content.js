/**
 * YouTube Transcript Scraper - Content Script
 * Runs in the context of YouTube video pages.
 * Features:
 *  1. Primary Engine: YouTube Native DOM Transcript Panel Extractor (100% immune to exp=xpe 0-byte bug & HTTP 429).
 *  2. Secondary Engine: Innertube ANDROID Player API (exact port of jdepoix/youtube-transcript-api v1.2.5).
 *  3. Video timeline seeking on timestamp clicks.
 *  4. Injected "📝 Transcript" button and side drawer right on the YouTube page.
 */

if (!window.__ytsContentScriptV3Loaded) {
  window.__ytsContentScriptV3Loaded = true;

  // Helper to extract video ID from URL
  function getCurrentVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("v") || "";
  }

  // Parse MM:SS or HH:MM:SS into seconds
  function parseTimestampToSeconds(tsStr) {
    if (!tsStr) return 0;
    const clean = tsStr.trim().replace(/[^\d:]/g, "");
    const parts = clean.split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }

  /**
   * ENGINE 1: Extract transcript directly from YouTube's built-in DOM Transcript Panel.
   * Works on all videos with transcripts, never gets 0-byte exp=xpe responses or 429 blocks.
   */
  async function translateSnippetsInPage(snippets, targetLang) {
    if (!snippets || snippets.length === 0 || !targetLang) return snippets;
    for (let i = 0; i < snippets.length; i += 60) {
      const chunk = snippets.slice(i, i + 60);
      try {
        const bodyParams = new URLSearchParams();
        chunk.forEach(c => bodyParams.append("q", c.text));
        const trUrl = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(targetLang)}`;
        const trResp = await fetch(trUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: bodyParams.toString()
        });
        if (trResp.ok) {
          const trData = await trResp.json();
          if (Array.isArray(trData)) {
            trData.forEach((item, idx) => {
              if (idx >= chunk.length) return;
              if (Array.isArray(item) && typeof item[0] === "string" && item[0].trim()) {
                chunk[idx].text = item[0].trim();
              } else if (typeof item === "string" && item.trim()) {
                chunk[idx].text = item.trim();
              }
            });
          }
        }
      } catch (e) {}
    }
    return snippets;
  }

  async function extractViaDomPanel(targetLang = "en") {
    const hasAnySegments = () =>
      document.querySelectorAll("ytd-transcript-segment-renderer, transcript-segment-view-model").length > 0;

    // If segments are not rendered yet, click all matching "Show transcript" buttons in description
    if (!hasAnySegments()) {
      let btns = Array.from(
        document.querySelectorAll(
          'ytd-video-description-transcript-section-renderer button, button[aria-label*="Show transcript" i]'
        )
      );
      if (btns.length === 0) {
        const trSection = document.querySelector("ytd-video-description-transcript-section-renderer");
        const expandBtn = document.querySelector("#expand, tp-yt-paper-button#expand");
        if (expandBtn) {
          expandBtn.click();
        }
        if (trSection || expandBtn) {
          for (let w = 0; w < 8; w++) {
            await new Promise(r => setTimeout(r, 200));
            btns = Array.from(
              document.querySelectorAll(
                'ytd-video-description-transcript-section-renderer button, button[aria-label*="Show transcript" i]'
              )
            );
            if (btns.length > 0) break;
          }
        }
      }

      if (btns.length > 0) {
        btns.forEach(b => {
          try {
            b.click();
          } catch (e) {}
        });
        for (let i = 0; i < 25; i++) {
          await new Promise(r => setTimeout(r, 200));
          if (hasAnySegments()) {
            break;
          }
        }
      }
    }

    const panel = document.querySelector(
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"], ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]'
    );

    let matchedNativeLang = false;
    if (panel) {
      // Switch language inside YouTube's transcript panel if requested (English vs Bangla)
      const menuItems = Array.from(
        panel.querySelectorAll("tp-yt-paper-listbox a, tp-yt-paper-item, yt-dropdown-menu tp-yt-paper-item")
      );
      if (menuItems.length > 0) {
        const keywords = targetLang.startsWith("bn")
          ? ["bangla", "bengali", "বাংলা"]
          : ["english"];
        const targetItem = menuItems.find(el => {
          const txt = (el.textContent || "").toLowerCase();
          return keywords.some(k => txt.includes(k));
        });

        if (targetItem) {
          matchedNativeLang = true;
          if (!targetItem.classList.contains("iron-selected") && targetItem.getAttribute("aria-selected") !== "true") {
            targetItem.click();
            await new Promise(r => setTimeout(r, 800));
            for (let i = 0; i < 20; i++) {
              if (hasAnySegments()) {
                break;
              }
              await new Promise(r => setTimeout(r, 200));
            }
          }
        }
      }
    }

    const modernSegs = document.querySelectorAll("transcript-segment-view-model");
    const legacySegs = document.querySelectorAll("ytd-transcript-segment-renderer");
    if (modernSegs.length === 0 && legacySegs.length === 0) {
      return null;
    }

    const snippets = [];
    if (modernSegs.length > 0) {
      modernSegs.forEach(seg => {
        const tsText =
          seg.querySelector(".ytwTranscriptSegmentViewModelTimestamp")?.textContent?.trim() || "0:00";
        const text =
          seg.querySelector('span[role="text"], .ytAttributedStringHost')?.textContent?.trim() || "";
        if (text) {
          snippets.push({
            text: text,
            start: parseTimestampToSeconds(tsText),
            duration: 3.0
          });
        }
      });
    } else {
      legacySegs.forEach(seg => {
        const tsText = seg.querySelector(".segment-timestamp")?.textContent?.trim() || "0:00";
        const text = seg.querySelector(".segment-text")?.textContent?.trim() || "";
        if (text) {
          snippets.push({
            text: text,
            start: parseTimestampToSeconds(tsText),
            duration: 3.0
          });
        }
      });
    }

    for (let i = 0; i < snippets.length - 1; i++) {
      snippets[i].duration = Math.max(1.0, +(snippets[i + 1].start - snippets[i].start).toFixed(2));
    }

    if (snippets.length === 0) return null;
    const sampleText = snippets.slice(0, 15).map(s => s.text).join(" ");
    const isBanglaText = /[\u0980-\u09FF]/.test(sampleText);
    const needsTranslation =
      !matchedNativeLang &&
      ((targetLang.startsWith("bn") && !isBanglaText) || (targetLang.startsWith("en") && isBanglaText));

    if (needsTranslation) {
      return await translateSnippetsInPage(snippets, targetLang);
    }
    return snippets;
  }

  // Helper to get Innertube ANDROID player data + DASH VTT manifest info from page origin
  async function getPagePlayerAndDashInfo(videoId) {
    const watchResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { credentials: "include" });
    const html = await watchResp.text();

    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/);
    if (!apiKeyMatch) {
      throw new Error("Could not extract YouTube Innertube API key.");
    }
    const apiKey = apiKeyMatch[1];

    const playerResp = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38"
          }
        },
        videoId: videoId
      })
    });

    if (!playerResp.ok) {
      throw new Error(`Innertube player request failed with status ${playerResp.status}`);
    }

    const playerText = await playerResp.text();
    let playerData;
    try {
      playerData = JSON.parse(playerText);
    } catch (e) {
      throw new Error("Invalid JSON response from YouTube Innertube player API.");
    }

    const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const dashUrl = playerData?.streamingData?.dashManifestUrl || null;
    let dashVttInfo = null;

    if (dashUrl) {
      try {
        const rd = await fetch(dashUrl);
        if (rd.ok) {
          const xml = await rd.text();
          const setMatch = xml.match(/<AdaptationSet[^>]*mimeType="text\/vtt"[^>]*>([\s\S]*?)<\/AdaptationSet>/);
          if (setMatch) {
            const setXml = setMatch[1];
            const langMatch = setMatch[0].match(/lang="([^"]*)"/);
            const trackLang = langMatch ? langMatch[1] : "en";
            const baseMatch = setXml.match(/<BaseURL>([^<]+)<\/BaseURL>/);
            if (baseMatch) {
              const baseUrl = baseMatch[1].replace(/&amp;/g, "&");
              const segMatches = [...setXml.matchAll(/<SegmentURL media="sq\/(\d+)"\/>/g)];
              dashVttInfo = { baseUrl, totalSegs: segMatches.length, trackLang, apiKey };
            }
          }
        }
      } catch (e) {}
    }

    return { apiKey, tracks, dashUrl, dashVttInfo };
  }

  /**
   * ENGINE 2: Innertube ANDROID Player API (Direct port of jdepoix/youtube-transcript-api v1.2.5)
   */
  async function extractViaInnertubeAndroid(videoId, targetLang = "en") {
    const { apiKey, tracks, dashUrl } = await getPagePlayerAndDashInfo(videoId);

    if (tracks && tracks.length > 0) {
      try {
        let track = tracks.find(t => t.languageCode.startsWith(targetLang));
        let needsTranslation = false;
        if (!track) {
          track = tracks.find(t => t.languageCode.startsWith("en")) || tracks[0];
          needsTranslation = true;
        }
        const fetchUrl = track.baseUrl.replace("&fmt=srv3", "");
        const parsed = await fetchAndParseTimedTextXml(fetchUrl);
        if (parsed && parsed.length > 0) {
          if (needsTranslation) {
            return await translateSnippetsInPage(parsed, targetLang);
          }
          return parsed;
        }
      } catch (e) {}
    }

    throw new Error(`Subtitles/closed captions are disabled or unavailable on YouTube for this video (${videoId}).`);
  }

  // Parse XML timedtext (supports both standard <text start="" dur=""> and srv3 <p t="" d="">)
  async function fetchAndParseTimedTextXml(url) {
    const resp = await fetch(url, { credentials: "include" });
    if (resp.status === 429) {
      throw new Error("YouTube rate-limited /api/timedtext requests (HTTP 429).");
    }
    const xmlText = await resp.text();
    if (!xmlText || !xmlText.trim()) {
      throw new Error("Empty transcript response from YouTube.");
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const snippets = [];

    // Format 1: <text start="1.92" dur="3.8">...</text>
    const textNodes = xmlDoc.getElementsByTagName("text");
    if (textNodes && textNodes.length > 0) {
      for (let i = 0; i < textNodes.length; i++) {
        const node = textNodes[i];
        const start = parseFloat(node.getAttribute("start") || "0");
        const dur = parseFloat(node.getAttribute("dur") || "2.0");
        const raw = node.textContent || "";
        const doc = new DOMParser().parseFromString(raw, "text/html");
        const clean = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
        if (clean) {
          snippets.push({ text: clean, start, duration: dur });
        }
      }
      if (snippets.length > 0) return snippets;
    }

    // Format 2 (srv3): <p t="1920" d="3800"><s>...</s></p>
    const pNodes = xmlDoc.getElementsByTagName("p");
    if (pNodes && pNodes.length > 0) {
      for (let i = 0; i < pNodes.length; i++) {
        const node = pNodes[i];
        const startMs = parseFloat(node.getAttribute("t") || "0");
        const durMs = parseFloat(node.getAttribute("d") || "2000");
        const raw = node.textContent || "";
        const doc = new DOMParser().parseFromString(raw, "text/html");
        const clean = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
        if (clean) {
          snippets.push({
            text: clean,
            start: +(startMs / 1000.0).toFixed(2),
            duration: +(durMs / 1000.0).toFixed(2)
          });
        }
      }
    }

    return snippets;
  }

  // Combined extractor: tries DOM panel first, then Innertube ANDROID API
  async function extractTranscriptInPage(targetLang = "en") {
    const videoId = getCurrentVideoId();
    if (!videoId) {
      throw new Error("Not on a valid YouTube watch page.");
    }

    let domError = null;
    try {
      const domSnippets = await extractViaDomPanel(targetLang);
      if (domSnippets && domSnippets.length > 0) {
        return domSnippets;
      }
    } catch (err) {
      domError = err;
    }

    // Fallback to Innertube ANDROID API
    try {
      const apiSnippets = await extractViaInnertubeAndroid(videoId, targetLang);
      if (apiSnippets && apiSnippets.length > 0) {
        return apiSnippets;
      }
    } catch (apiErr) {
      throw domError || apiErr;
    }

    if (domError) throw domError;
    throw new Error("No transcript segments found for this video.");
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
      <div class="yts-drawer-search" style="display:flex; gap:8px;">
        <select id="yts-drawer-lang-select" style="background:#222; border:1px solid #333; color:#fff; padding:6px; border-radius:8px; font-size:12px; outline:none;">
          <option value="en">English (en)</option>
          <option value="bn">Bangla (বাংলা)</option>
        </select>
        <input type="text" id="yts-drawer-search-input" placeholder="Search transcript..." style="flex:1;" />
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
      }
      .yts-btn:hover {
        background: #3a3a3a;
      }
      .yts-loading, .yts-empty {
        text-align: center;
        color: #aaa;
        margin-top: 40px;
        font-size: 13px;
        line-height: 1.5;
        padding: 0 12px;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(drawer);

    document.getElementById("yts-drawer-close").addEventListener("click", () => {
      drawer.remove();
      style.remove();
    });

    const langSelect = document.getElementById("yts-drawer-lang-select");
    if (langSelect) {
      langSelect.addEventListener("change", e => {
        loadDrawerTranscript(e.target.value);
      });
    }

    loadDrawerTranscript("en");
  }

  let activeDrawerSnippets = [];

  async function loadDrawerTranscript(targetLang = "en") {
    const body = document.getElementById("yts-drawer-body");
    if (!body) return;
    body.innerHTML = '<div class="yts-loading">Extracting transcript...</div>';

    try {
      const snippets = await extractTranscriptInPage(targetLang);
      activeDrawerSnippets = snippets;

      renderDrawerSnippets(snippets);

      const searchInput = document.getElementById("yts-drawer-search-input");
      searchInput.oninput = e => {
        const q = e.target.value.toLowerCase().trim();
        if (!q) {
          renderDrawerSnippets(activeDrawerSnippets);
          return;
        }
        const filtered = activeDrawerSnippets.filter(s => s.text.toLowerCase().includes(q));
        renderDrawerSnippets(filtered, q);
      };

      document.getElementById("yts-copy-btn").onclick = () => {
        const fullText = activeDrawerSnippets.map(s => `[${formatTime(s.start)}] ${s.text}`).join("\n");
        navigator.clipboard.writeText(fullText).then(() => {
          alert("Transcript copied to clipboard!");
        });
      };

      document.getElementById("yts-download-txt-btn").onclick = () => {
        const fullText = activeDrawerSnippets.map(s => s.text).join(" ");
        downloadFile(fullText, `transcript_${getCurrentVideoId()}.txt`, "text/plain");
      };

      document.getElementById("yts-download-srt-btn").onclick = () => {
        const srt = formatToSRT(activeDrawerSnippets);
        downloadFile(srt, `transcript_${getCurrentVideoId()}.srt`, "text/plain");
      };
    } catch (err) {
      body.innerHTML = `<div class="yts-empty" style="color:#ff6b6b;">⚠️ ${err.message}</div>`;
    }
  }

  function renderDrawerSnippets(snippets, highlight = "") {
    const body = document.getElementById("yts-drawer-body");
    if (!body) return;

    if (!snippets || snippets.length === 0) {
      body.innerHTML = '<div class="yts-empty">No matching lines found.</div>';
      return;
    }

    body.innerHTML = snippets
      .map(s => {
        let displayText = s.text;
        if (highlight) {
          const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
          displayText = displayText.replace(regex, "<mark style='background:#ff0033;color:#fff;'>$1</mark>");
        }
        return `
        <div class="yts-snippet" data-start="${s.start}">
          <span class="yts-timestamp">${formatTime(s.start)}</span>
          <span class="yts-text">${displayText}</span>
        </div>
      `;
      })
      .join("");

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

    const targetContainer =
      document.querySelector("#top-level-buttons-computed") ||
      document.querySelector("#actions-inner") ||
      document.querySelector("#actions");

    if (!targetContainer) return;

    const btn = document.createElement("button");
    btn.id = "yts-inline-action-btn";
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

  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
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
      const ccBtn = document.querySelector(".ytp-subtitles-button");
      const ccLabel = (ccBtn?.getAttribute("title") || ccBtn?.getAttribute("aria-label") || "").toLowerCase();
      const ccUnavailable = ccLabel.includes("unavailable");
      sendResponse({
        videoId: videoId,
        title: document.title.replace(" - YouTube", ""),
        ccUnavailable: ccUnavailable
      });
      return true;
    }

    if (request.action === "FETCH_DOM_TRANSCRIPT") {
      const targetLang = request.languageCode || "en";
      extractViaDomPanel(targetLang)
        .then(snippets => {
          if (snippets && snippets.length > 0) {
            sendResponse({ success: true, snippets });
          } else {
            sendResponse({ success: false, noDom: true });
          }
        })
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (request.action === "GET_PLAYER_AND_DASH_INFO") {
      const vid = request.videoId || getCurrentVideoId();
      getPagePlayerAndDashInfo(vid)
        .then(info => sendResponse({ success: true, ...info }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (request.action === "FETCH_PAGE_TRANSCRIPT") {
      const targetLang = request.languageCode || "en";
      extractTranscriptInPage(targetLang)
        .then(snippets => sendResponse({ success: true, snippets }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
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
}
