/**
 * YouTube Transcript Scraper - Popup Controller
 * Dual Mode: In-Browser Direct (DOM Panel + Innertube ANDROID API) & Python API (youtube-transcript-api)
 */

document.addEventListener("DOMContentLoaded", () => {
  // UI Elements
  const backendPill = document.getElementById("backend-status-pill");
  const backendStatusText = document.getElementById("backend-status-text");
  const tabBrowserMode = document.getElementById("tab-browser-mode");
  const tabPythonMode = document.getElementById("tab-python-mode");
  const translateGroup = document.getElementById("translate-group");

  const videoMetaBox = document.getElementById("video-meta-box");
  const videoTitleEl = document.getElementById("video-title");
  const videoIdBadge = document.getElementById("video-id-badge");
  const manualUrlContainer = document.getElementById("manual-url-container");
  const manualUrlInput = document.getElementById("manual-url-input");
  const btnToggleManual = document.getElementById("btn-toggle-manual-input");
  const btnLoadManual = document.getElementById("btn-load-manual-url");

  const langSelect = document.getElementById("lang-select");
  const translateSelect = document.getElementById("translate-select");
  const btnFetch = document.getElementById("btn-fetch");

  const searchInput = document.getElementById("transcript-search");
  const matchCountEl = document.getElementById("match-count");
  const emptyState = document.getElementById("empty-state");
  const transcriptList = document.getElementById("transcript-list");

  const btnCopy = document.getElementById("btn-copy");
  const copyMenu = document.getElementById("copy-menu");
  const btnDownload = document.getElementById("btn-download");
  const downloadMenu = document.getElementById("download-menu");

  const btnSettings = document.getElementById("btn-settings");
  const modalOverlay = document.getElementById("modal-overlay");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const settingBackendUrl = document.getElementById("setting-backend-url");
  const btnTestConnection = document.getElementById("btn-test-connection");
  const btnCheckUpdates = document.getElementById("btn-check-updates");
  const btnUpgradeApi = document.getElementById("btn-upgrade-api");
  const modalInstalledVer = document.getElementById("modal-installed-ver");
  const modalLatestVer = document.getElementById("modal-latest-ver");
  const modalUpdateStatus = document.getElementById("modal-update-status");

  // Application State
  let currentMode = "browser"; // 'browser' or 'python'
  let activeTab = null;
  let currentVideoId = "";
  let currentVideoTitle = "";
  let currentSnippets = [];
  let backendUrl = "http://127.0.0.1:5000";
  let isBackendOnline = false;

  // Load saved preferences
  chrome.storage.local.get(["backendUrl", "preferredMode"], res => {
    if (res.backendUrl) {
      backendUrl = res.backendUrl;
      settingBackendUrl.value = backendUrl;
    }
    if (res.preferredMode) {
      setMode(res.preferredMode);
    } else {
      setMode("browser");
    }
    checkBackendHealth();
    initActiveTab();
  });

  // Switch Modes
  tabBrowserMode.addEventListener("click", () => setMode("browser"));
  tabPythonMode.addEventListener("click", () => setMode("python"));

  function setMode(mode) {
    currentMode = mode;
    chrome.storage.local.set({ preferredMode: mode });
    if (mode === "browser") {
      tabBrowserMode.classList.add("active");
      tabPythonMode.classList.remove("active");
      translateGroup.style.display = "none";
    } else {
      tabPythonMode.classList.add("active");
      tabBrowserMode.classList.remove("active");
      translateGroup.style.display = "flex";
    }
    populateLanguageDropdown();
  }

  // Check Backend Health
  async function checkBackendHealth() {
    backendPill.className = "status-pill status-checking";
    backendStatusText.textContent = "Checking API...";
    try {
      const resp = await fetch(`${backendUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000)
      });
      if (resp.ok) {
        const data = await resp.json();
        const ver = data.installed_version || "OK";
        isBackendOnline = true;
        backendPill.className = "status-pill status-online";
        backendStatusText.textContent = `API v${ver}`;
        modalInstalledVer.textContent = ver;
        modalLatestVer.textContent = data.latest_pypi_version || ver;
        if (data.update_available) {
          modalUpdateStatus.textContent = "✨ Upstream update available on PyPI!";
          modalUpdateStatus.style.color = "#2ba640";
        } else {
          modalUpdateStatus.textContent = "Up to date with latest release.";
          modalUpdateStatus.style.color = "#aaaaaa";
        }
        return true;
      }
    } catch (e) {
      // Backend not running
    }
    isBackendOnline = false;
    backendPill.className = "status-pill status-offline";
    backendStatusText.textContent = "API Offline";
    modalInstalledVer.textContent = "Not Running";
    modalUpdateStatus.textContent = "Run backend/run_server.bat to start Python API.";
    modalUpdateStatus.style.color = "#ff0033";
    return false;
  }

  // Detect Active YouTube Tab
  function initActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs && tabs[0]) {
        activeTab = tabs[0];
        const url = activeTab.url || "";
        const videoId = extractVideoId(url);
        if (videoId) {
          currentVideoId = videoId;
          videoIdBadge.textContent = `ID: ${videoId}`;
          videoTitleEl.textContent = activeTab.title
            ? activeTab.title.replace(" - YouTube", "")
            : "YouTube Video";
          currentVideoTitle = videoTitleEl.textContent;
          ensureContentScriptAndQueryPage();
        } else {
          videoTitleEl.textContent = "Not a YouTube video page";
          videoIdBadge.textContent = "Use 'Paste URL' below";
          showManualInput(true);
        }
      }
    });
  }

  function extractVideoId(urlOrId) {
    if (!urlOrId) return "";
    const m = urlOrId.match(/(?:v=|\/embed\/|\/live\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId.trim())) return urlOrId.trim();
    return "";
  }

  // Ensure content.js is injected into the active YouTube tab even if tab wasn't refreshed
  function ensureContentScriptAndQueryPage() {
    if (!activeTab || !activeTab.id) return;
    chrome.tabs.sendMessage(activeTab.id, { action: "GET_PAGE_DATA" }, res => {
      if (chrome.runtime.lastError || !res) {
        // Dynamically inject content.js if not yet loaded
        if (chrome.scripting && activeTab.url && activeTab.url.includes("youtube.com")) {
          chrome.scripting
            .executeScript({
              target: { tabId: activeTab.id },
              files: ["content.js"]
            })
            .then(() => {
              chrome.tabs.sendMessage(activeTab.id, { action: "GET_PAGE_DATA" }, res2 => {
                if (!chrome.runtime.lastError && res2 && res2.title) {
                  currentVideoTitle = res2.title;
                  videoTitleEl.textContent = res2.title;
                }
              });
            })
            .catch(() => {});
        }
        return;
      }
      if (res.title) {
        currentVideoTitle = res.title;
        videoTitleEl.textContent = res.title;
      }
    });
  }

  function populateLanguageDropdown() {
    const prevValue = langSelect.value || "en";
    langSelect.innerHTML = "";

    const allowed = [
      { code: "en", name: "English (en)" },
      { code: "bn", name: "Bangla (bn - বাংলা)" }
    ];

    allowed.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.code;
      opt.textContent = d.name;
      langSelect.appendChild(opt);
    });

    if (prevValue === "bn" || prevValue === "en") {
      langSelect.value = prevValue;
    }
  }

  // Toggle manual URL input
  btnToggleManual.addEventListener("click", () => {
    const isShowing = manualUrlContainer.style.display !== "none";
    showManualInput(!isShowing);
  });

  function showManualInput(show) {
    if (show) {
      videoMetaBox.style.display = "none";
      manualUrlContainer.style.display = "flex";
      btnToggleManual.textContent = "Cancel";
      manualUrlInput.focus();
    } else {
      videoMetaBox.style.display = "block";
      manualUrlContainer.style.display = "none";
      btnToggleManual.textContent = "Paste URL";
    }
  }

  btnLoadManual.addEventListener("click", () => {
    const val = manualUrlInput.value.trim();
    const vid = extractVideoId(val);
    if (!vid) {
      alert("Please enter a valid YouTube URL or 11-character video ID.");
      return;
    }
    currentVideoId = vid;
    currentVideoTitle = `Video (${vid})`;
    videoTitleEl.textContent = currentVideoTitle;
    videoIdBadge.textContent = `ID: ${vid}`;
    showManualInput(false);
    fetchTranscript();
  });

  // Fetch Transcript Action
  btnFetch.addEventListener("click", fetchTranscript);

  async function fetchTranscript() {
    if (!currentVideoId) {
      alert("No YouTube video selected. Open a YouTube video or paste a URL.");
      return;
    }

    setLoading(true, "Extracting transcript...");

    if (currentMode === "browser") {
      await fetchViaBrowserMode();
    } else {
      await fetchViaPythonMode();
    }
  }

  // Translate an array of snippets in popup using Google Translate Chrome Extension API
  async function translateSnippetsInPopup(snippets, targetLang) {
    if (!snippets || snippets.length === 0 || !targetLang) return snippets;
    setLoading(true, `Translating transcript to ${targetLang.toUpperCase()}...`);
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

  // Helper to get Innertube ANDROID player + DASH info via executeScript (native youtube.com Origin) or direct fetch
  async function fetchPlayerAndDashInfo(videoId, existingApiKey = null) {
    // 1. Try via chrome.scripting.executeScript in active YouTube tab (works without refreshing tab & guarantees Origin: https://www.youtube.com)
    if (
      chrome.scripting &&
      activeTab &&
      activeTab.id &&
      activeTab.url &&
      activeTab.url.includes("youtube.com")
    ) {
      try {
        const execResults = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: async (vid, passedKey) => {
            try {
              let key = passedKey;
              if (!key) {
                const wResp = await fetch(`https://www.youtube.com/watch?v=${vid}`, { credentials: "include" });
                const wHtml = await wResp.text();
                const m = wHtml.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/);
                if (!m) return { success: false };
                key = m[1];
              }
              const pResp = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${key}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
                  videoId: vid
                })
              });
              if (!pResp.ok) return { success: false };
              const pData = await pResp.json();
              const tracks = pData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
              const dashUrl = pData?.streamingData?.dashManifestUrl || null;
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
                        dashVttInfo = { baseUrl, totalSegs: segMatches.length, trackLang, apiKey: key };
                      }
                    }
                  }
                } catch (e) {}
              }
              return { success: true, apiKey: key, tracks, dashUrl, dashVttInfo };
            } catch (err) {
              return { success: false, error: err.message };
            }
          },
          args: [videoId, existingApiKey]
        });
        if (execResults && execResults[0] && execResults[0].result && execResults[0].result.success) {
          return execResults[0].result;
        }
      } catch (e) {}
    }

    // 2. Fallback: Direct fetch from popup (uses declarativeNetRequest rule for Origin: https://www.youtube.com)
    let apiKey = existingApiKey;
    if (!apiKey) {
      const watchResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
      const html = await watchResp.text();

      const titleMatch = html.match(/<title>(.*?)<\/title>/);
      if (titleMatch && titleMatch[1]) {
        currentVideoTitle = titleMatch[1].replace(" - YouTube", "").trim();
        videoTitleEl.textContent = currentVideoTitle;
      }

      const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/);
      if (!apiKeyMatch) {
        throw new Error("Could not extract YouTube Innertube API key.");
      }
      apiKey = apiKeyMatch[1];
    }

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
      throw new Error(`YouTube Innertube request returned HTTP ${playerResp.status}.`);
    }

    const playerText = await playerResp.text();
    let playerData;
    try {
      playerData = JSON.parse(playerText);
    } catch (e) {
      throw new Error("YouTube returned an invalid JSON response. Please reload the YouTube tab and try again.");
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

  // Direct Innertube ANDROID + Live DVR Extractor inside Popup
  async function extractDirectFromPopup(videoId, targetLang) {
    const { apiKey, tracks, dashUrl, dashVttInfo } = await fetchPlayerAndDashInfo(videoId);

    // Try standard captionTracks first if available
    if (tracks && tracks.length > 0) {
      try {
        let track = tracks.find(t => t.languageCode.startsWith(targetLang));
        let needsGtxTranslation = false;
        if (!track) {
          track = tracks.find(t => t.languageCode.startsWith("en")) || tracks[0];
          needsGtxTranslation = true;
        }
        const fetchUrl = track.baseUrl.replace("&fmt=srv3", "");
        const xmlResp = await fetch(fetchUrl);

        if (xmlResp.ok) {
          const xmlText = await xmlResp.text();
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, "text/xml");
          const snippets = [];

          const textNodes = xmlDoc.getElementsByTagName("text");
          if (textNodes && textNodes.length > 0) {
            for (let i = 0; i < textNodes.length; i++) {
              const node = textNodes[i];
              const start = parseFloat(node.getAttribute("start") || "0");
              const dur = parseFloat(node.getAttribute("dur") || "2.0");
              const doc = new DOMParser().parseFromString(node.textContent || "", "text/html");
              const clean = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
              if (clean) snippets.push({ text: clean, start, duration: dur });
            }
          } else {
            const pNodes = xmlDoc.getElementsByTagName("p");
            if (pNodes && pNodes.length > 0) {
              for (let i = 0; i < pNodes.length; i++) {
                const node = pNodes[i];
                const startMs = parseFloat(node.getAttribute("t") || "0");
                const durMs = parseFloat(node.getAttribute("d") || "2000");
                const doc = new DOMParser().parseFromString(node.textContent || "", "text/html");
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
          }

          if (snippets.length > 0) {
            if (needsGtxTranslation) {
              return await translateSnippetsInPopup(snippets, targetLang);
            }
            return snippets;
          }
        }
      } catch (e) {}
    }

    // Fallback or Primary for Live Stream DVR videos: extract WebVTT segments from dashManifestUrl
    if (dashUrl || (dashVttInfo && dashVttInfo.totalSegs > 0)) {
      setLoading(true, "Completed Live Stream detected! Extracting DVR WebVTT captions...");
      const dvrSnippets = await extractLiveDvrDashInPopup(videoId, apiKey, dashUrl, targetLang, dashVttInfo);
      if (dvrSnippets && dvrSnippets.length > 0) {
        return dvrSnippets;
      }
    }

    if (tracks && tracks.length > 0) {
      throw new Error(
        "YouTube rate-limited /api/timedtext (HTTP 429). Please open the video directly in your active YouTube tab and click Scrape."
      );
    }

    throw new Error(
      `Subtitles/closed captions are disabled or unavailable on YouTube for this video (${videoId}).`
    );
  }

  async function extractLiveDvrDashInPopup(videoId, apiKey, initialDashUrl, targetLang = "en", preloadedDashInfo = null) {
    async function getDashVttInfo(existingDashUrl = null) {
      try {
        const refreshed = await fetchPlayerAndDashInfo(videoId, apiKey);
        if (refreshed && refreshed.dashVttInfo && refreshed.dashVttInfo.baseUrl) {
          return refreshed.dashVttInfo;
        }
        const dUrl = existingDashUrl || (refreshed && refreshed.dashUrl);
        if (!dUrl) return null;
        const rd = await fetch(dUrl);
        if (!rd.ok) return null;
        const xml = await rd.text();
        const setMatch = xml.match(/<AdaptationSet[^>]*mimeType="text\/vtt"[^>]*>([\s\S]*?)<\/AdaptationSet>/);
        if (!setMatch) return null;
        const setXml = setMatch[1];
        const langMatch = setMatch[0].match(/lang="([^"]*)"/);
        const trackLang = langMatch ? langMatch[1] : "en";
        const baseMatch = setXml.match(/<BaseURL>([^<]+)<\/BaseURL>/);
        if (!baseMatch) return null;
        const baseUrl = baseMatch[1].replace(/&amp;/g, "&");
        const segMatches = [...setXml.matchAll(/<SegmentURL media="sq\/(\d+)"\/>/g)];
        return { baseUrl, totalSegs: segMatches.length, trackLang };
      } catch (e) {
        return null;
      }
    }

    const initialInfo = (preloadedDashInfo && preloadedDashInfo.baseUrl)
      ? preloadedDashInfo
      : await getDashVttInfo(initialDashUrl);
    if (!initialInfo || !initialInfo.baseUrl || initialInfo.totalSegs === 0) {
      return [];
    }

    const totalSegs = initialInfo.totalSegs;
    const rawSegments = {};
    const batchSize = 85;

    for (let startIdx = 0; startIdx < totalSegs; startIdx += batchSize) {
      const pct = Math.min(99, Math.round((startIdx / totalSegs) * 100));
      setLoading(true, `Extracting Live Stream DVR segments... (${pct}%)`);
      const info = startIdx === 0 ? initialInfo : await getDashVttInfo(null);
      const bUrl = (info && info.baseUrl) ? info.baseUrl : initialInfo.baseUrl;
      const endIdx = Math.min(startIdx + batchSize, totalSegs);

      const indices = [];
      for (let i = startIdx; i < endIdx; i++) indices.push(i);

      for (let c = 0; c < indices.length; c += 18) {
        const sub = indices.slice(c, c + 18);
        await Promise.all(
          sub.map(async segIdx => {
            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                const r = await fetch(`${bUrl}sq/${segIdx}`);
                if (r.ok) {
                  const txt = await r.text();
                  if (txt && txt.trim()) {
                    rawSegments[segIdx] = txt;
                    break;
                  }
                }
              } catch (e) {}
            }
          })
        );
      }
    }

    const sortedKeys = Object.keys(rawSegments).map(Number).sort((a, b) => a - b);
    const snippets = [];

    for (const segIdx of sortedKeys) {
      const vtt = rawSegments[segIdx];
      const mpegMatch = vtt.match(/MPEGTS:(\d+)/);
      const segOffset = mpegMatch ? parseInt(mpegMatch[1], 10) / 90000.0 : segIdx * 5.0;

      const blocks = vtt.split(/\r?\n\r?\n/);
      for (const block of blocks) {
        const tm = block.match(/(\d+):(\d+):(\d+\.\d+)\s*-->\s*(\d+):(\d+):(\d+\.\d+)/);
        if (!tm) continue;
        const cStart = parseInt(tm[1], 10) * 3600 + parseInt(tm[2], 10) * 60 + parseFloat(tm[3]);
        const cEnd = parseInt(tm[4], 10) * 3600 + parseInt(tm[5], 10) * 60 + parseFloat(tm[6]);
        const lines = block.split(/\r?\n/);
        const tsIdx = lines.findIndex(l => l.includes("-->"));
        if (tsIdx < 0) continue;

        for (const tl of lines.slice(tsIdx + 1)) {
          const noTags = tl.replace(/<[^>]+>/g, "");
          const doc = new DOMParser().parseFromString(noTags, "text/html");
          const cleanLine = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
          if (!cleanLine) continue;

          const recent = snippets.slice(-6);
          let isDup = false;
          for (let rIdx = recent.length - 1; rIdx >= 0; rIdx--) {
            const prev = recent[rIdx];
            if (cleanLine === prev.text || prev.text.endsWith(cleanLine)) {
              isDup = true;
              break;
            }
            if (cleanLine.startsWith(prev.text) && segOffset + cStart - prev.start < 8.0) {
              prev.text = cleanLine;
              prev.duration = +Math.max(1.5, segOffset + cEnd - prev.start).toFixed(2);
              isDup = true;
              break;
            }
          }

          if (!isDup) {
            snippets.push({
              text: cleanLine,
              start: +(segOffset + cStart).toFixed(2),
              duration: +Math.max(1.5, cEnd - cStart).toFixed(2)
            });
          }
        }
      }
    }

    const merged = [];
    for (const item of snippets) {
      const prev = merged[merged.length - 1];
      if (
        prev &&
        !item.text.startsWith(">>") &&
        item.start - prev.start < 4.0 &&
        prev.text.length < 80
      ) {
        prev.text = `${prev.text} ${item.text}`.trim();
        prev.duration = +Math.max(prev.duration, item.start + item.duration - prev.start).toFixed(2);
      } else {
        merged.push(item);
      }
    }

    if (targetLang && !initialInfo.trackLang.startsWith(targetLang) && merged.length > 0) {
      setLoading(true, `Translating Live Stream transcript to ${targetLang.toUpperCase()}...`);
      for (let i = 0; i < merged.length; i += 60) {
        const chunk = merged.slice(i, i + 60);
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
                  chunk[idx].text = item[0].strip ? item[0].strip() : item[0].trim();
                } else if (typeof item === "string" && item.trim()) {
                  chunk[idx].text = item.trim();
                }
              });
            }
          }
        } catch (e) {}
      }
    }

    return merged;
  }

  // 1. In-Browser Direct Mode
  async function fetchViaBrowserMode(isFallback = false) {
    const selectedLang = langSelect.value || "en";
    const tabVideoId = activeTab && activeTab.url ? extractVideoId(activeTab.url) : "";

    // Step 1: If user is on the matching YouTube tab, run Engine 1 (DOM Transcript Panel) directly via executeScript
    // Supports BOTH legacy ytd-transcript-segment-renderer AND 2026 PAmodern_transcript_view (transcript-segment-view-model)
    if (chrome.scripting && activeTab && activeTab.id && tabVideoId === currentVideoId) {
      try {
        const execDom = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: async targetLang => {
            function parseTs(tsStr) {
              if (!tsStr) return 0;
              const clean = tsStr.trim().replace(/[^\d:]/g, "");
              const parts = clean.split(":").map(Number);
              if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
              if (parts.length === 2) return parts[0] * 60 + parts[1];
              return parts[0] || 0;
            }

            const hasAnySegments = () =>
              document.querySelectorAll("ytd-transcript-segment-renderer, transcript-segment-view-model").length > 0;

            // If segments are not rendered yet, check if transcript section exists in description
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
              const menuItems = Array.from(
                panel.querySelectorAll("tp-yt-paper-listbox a, tp-yt-paper-item")
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
                  if (
                    !targetItem.classList.contains("iron-selected") &&
                    targetItem.getAttribute("aria-selected") !== "true"
                  ) {
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
              return { success: false };
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
                    start: parseTs(tsText),
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
                    start: parseTs(tsText),
                    duration: 3.0
                  });
                }
              });
            }

            for (let i = 0; i < snippets.length - 1; i++) {
              snippets[i].duration = Math.max(1.0, +(snippets[i + 1].start - snippets[i].start).toFixed(2));
            }

            // Detect whether extracted text is already in the requested language (English vs Bangla)
            const sampleText = snippets.slice(0, 15).map(s => s.text).join(" ");
            const isBanglaText = /[\u0980-\u09FF]/.test(sampleText);
            const needsTranslation =
              !matchedNativeLang &&
              ((targetLang.startsWith("bn") && !isBanglaText) || (targetLang.startsWith("en") && isBanglaText));

            return { success: snippets.length > 0, snippets, needsTranslation };
          },
          args: [selectedLang]
        });

        const domResp = execDom && execDom[0] ? execDom[0].result : null;
        if (domResp && domResp.success && domResp.snippets && domResp.snippets.length > 0) {
          let finalSnippets = domResp.snippets;
          if (domResp.needsTranslation) {
            finalSnippets = await translateSnippetsInPopup(finalSnippets, selectedLang);
          }
          currentSnippets = finalSnippets;
          renderTranscript(currentSnippets);
          return;
        }
      } catch (e) {
        console.warn("DOM panel check warning:", e);
      }
    }

    // Step 2: Engine 2 (Innertube ANDROID) + Engine 3 (Live Stream DVR WebVTT) inside Popup
    try {
      const snippets = await extractDirectFromPopup(currentVideoId, selectedLang);
      if (snippets && snippets.length > 0) {
        currentSnippets = snippets;
        renderTranscript(currentSnippets);
        return;
      }
      throw new Error(`No transcript segments found for video (${currentVideoId}).`);
    } catch (directErr) {
      const errLower = (directErr.message || "").toLowerCase();
      if (
        !isFallback &&
        isBackendOnline &&
        !errLower.includes("unavailable") &&
        !errLower.includes("429") &&
        !errLower.includes("rate-limited")
      ) {
        await fetchViaPythonMode(true);
        return;
      }
      showErrorState(directErr.message);
    }
  }

  // 2. Python API Mode (via youtube-transcript-api)
  async function fetchViaPythonMode(isFallback = false) {
    const selectedLang = langSelect.value || "en";
    const translateTo = translateSelect.value || "";

    let url = `${backendUrl}/api/transcript?video_id=${currentVideoId}&languages=${selectedLang}&format=json`;
    if (translateTo) {
      url += `&translate=${translateTo}`;
    }

    try {
      const resp = await fetch(url);
      const rawText = await resp.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        throw new Error(
          "Python API returned an unexpected response. Restart backend/run_server.bat or use '⚡ In-Browser Direct' mode."
        );
      }
      if (!resp.ok || !data.success) {
        // If Python API hits YouTube HTTP 429 IP block, automatically fall back to In-Browser Direct DOM/DVR extractor
        if (!isFallback && (resp.status === 429 || data.code === "IP_BLOCKED")) {
          await fetchViaBrowserMode(true);
          return;
        }
        throw new Error(data.error || "Failed to fetch transcript from Python API");
      }
      currentSnippets = data.snippets || [];
      renderTranscript(currentSnippets);
    } catch (err) {
      if (!isFallback && err.message.includes("Failed to fetch")) {
        await fetchViaBrowserMode(true);
        return;
      }
      showErrorState(
        err.message.includes("Failed to fetch")
          ? "Python API Server is offline. Switch to '⚡ In-Browser Direct' mode or start backend/run_server.bat."
          : err.message
      );
    }
  }

  function showErrorState(errorMsg) {
    emptyState.style.display = "flex";
    transcriptList.style.display = "none";
    emptyState.innerHTML = `
      <div style="color:#ff4d4d; font-weight:600; margin-bottom:6px;">⚠️ Transcript Unavailable</div>
      <p style="font-size:12px; line-height:1.45; color:#ddd;">${escapeHtml(errorMsg)}</p>
    `;
  }

  function setLoading(loading, text = "Loading...") {
    if (loading) {
      emptyState.style.display = "flex";
      transcriptList.style.display = "none";
      emptyState.innerHTML = `
        <div style="margin-bottom:8px;">
          <svg width="28" height="28" viewBox="0 0 24 24" stroke="#ff0033" stroke-width="2" fill="none">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10"></path>
          </svg>
        </div>
        <p>${escapeHtml(text)}</p>
      `;
    }
  }

  // Render Transcript List
  function renderTranscript(snippets, highlight = "") {
    if (!snippets || snippets.length === 0) {
      emptyState.style.display = "flex";
      transcriptList.style.display = "none";
      emptyState.innerHTML = `<p>No transcript segments found.</p>`;
      matchCountEl.textContent = "";
      return;
    }

    emptyState.style.display = "none";
    transcriptList.style.display = "flex";
    transcriptList.innerHTML = "";

    snippets.forEach(s => {
      let displayText = escapeHtml(s.text);
      if (highlight) {
        const regex = new RegExp(`(${escapeRegex(highlight)})`, "gi");
        displayText = displayText.replace(regex, "<mark>$1</mark>");
      }

      const row = document.createElement("div");
      row.className = "snippet-row";
      row.setAttribute("data-time", s.start);
      row.innerHTML = `
        <span class="snippet-timestamp">${formatTime(s.start)}</span>
        <span class="snippet-text">${displayText}</span>
      `;

      row.addEventListener("click", () => {
        if (activeTab && activeTab.id) {
          chrome.tabs.sendMessage(activeTab.id, { action: "SEEK_VIDEO", time: s.start });
        }
      });

      transcriptList.appendChild(row);
    });

    matchCountEl.textContent = highlight ? `${snippets.length} matches` : `${snippets.length} lines`;
  }

  // Real-Time Search Filter
  searchInput.addEventListener("input", e => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderTranscript(currentSnippets);
      return;
    }
    const filtered = currentSnippets.filter(s => s.text.toLowerCase().includes(q));
    renderTranscript(filtered, q);
  });

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

  function escapeHtml(text) {
    return (text || "").replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Dropdown Handling
  btnCopy.addEventListener("click", e => {
    e.stopPropagation();
    copyMenu.parentElement.classList.toggle("open");
    downloadMenu.parentElement.classList.remove("open");
  });

  btnDownload.addEventListener("click", e => {
    e.stopPropagation();
    downloadMenu.parentElement.classList.toggle("open");
    copyMenu.parentElement.classList.remove("open");
  });

  document.addEventListener("click", () => {
    copyMenu.parentElement.classList.remove("open");
    downloadMenu.parentElement.classList.remove("open");
  });

  // Copy Actions
  document.getElementById("action-copy-plain").addEventListener("click", e => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const text = currentSnippets.map(s => s.text).join(" ");
      copyToClipboard(text, "Plain text copied to clipboard!");
    }
  });

  document.getElementById("action-copy-timestamps").addEventListener("click", e => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const text = currentSnippets.map(s => `[${formatTime(s.start)}] ${s.text}`).join("\n");
      copyToClipboard(text, "Timestamped transcript copied!");
    }
  });

  document.getElementById("action-copy-markdown").addEventListener("click", e => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const md = generateMarkdown();
      copyToClipboard(md, "Markdown transcript copied!");
    }
  });

  function copyToClipboard(text, successMsg) {
    navigator.clipboard.writeText(text).then(() => {
      alert(successMsg);
    });
  }

  function verifySnippetsExist() {
    if (!currentSnippets || currentSnippets.length === 0) {
      alert("No transcript loaded. Please scrape a video first.");
      return false;
    }
    return true;
  }

  // Export / Download Actions
  document.getElementById("action-download-txt").addEventListener("click", e => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const text = currentSnippets.map(s => s.text).join(" ");
      downloadBlob(text, `${sanitizeFilename(currentVideoTitle)}.txt`, "text/plain");
    }
  });

  document.getElementById("action-download-srt").addEventListener("click", e => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const srt = generateSRT();
      downloadBlob(srt, `${sanitizeFilename(currentVideoTitle)}.srt`, "text/plain");
    }
  });

  document.getElementById("action-download-vtt").addEventListener("click", e => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const vtt = generateVTT();
      downloadBlob(vtt, `${sanitizeFilename(currentVideoTitle)}.vtt`, "text/vtt");
    }
  });

  document.getElementById("action-download-json").addEventListener("click", e => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const json = JSON.stringify(
        {
          video_id: currentVideoId,
          title: currentVideoTitle,
          count: currentSnippets.length,
          transcript: currentSnippets
        },
        null,
        2
      );
      downloadBlob(json, `${sanitizeFilename(currentVideoTitle)}.json`, "application/json");
    }
  });

  document.getElementById("action-download-md").addEventListener("click", e => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const md = generateMarkdown();
      downloadBlob(md, `${sanitizeFilename(currentVideoTitle)}.md`, "text/markdown");
    }
  });

  function generateMarkdown() {
    let out = `# ${currentVideoTitle}\n\n`;
    out += `**Video URL:** https://www.youtube.com/watch?v=${currentVideoId}\n\n`;
    out += `## Transcript\n\n`;
    currentSnippets.forEach(s => {
      out += `**[${formatTime(s.start)}]** ${s.text}\n\n`;
    });
    return out;
  }

  function generateSRT() {
    let out = "";
    currentSnippets.forEach((s, idx) => {
      const start = formatSRTTime(s.start);
      const end = formatSRTTime(s.start + (s.duration || 2.0));
      out += `${idx + 1}\n${start} --> ${end}\n${s.text}\n\n`;
    });
    return out;
  }

  function formatSRTTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
  }

  function generateVTT() {
    let out = "WEBVTT\n\n";
    currentSnippets.forEach((s, idx) => {
      const start = formatVTTTime(s.start);
      const end = formatVTTTime(s.start + (s.duration || 2.0));
      out += `${idx + 1}\n${start} --> ${end}\n${s.text}\n\n`;
    });
    return out;
  }

  function formatVTTTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
  }

  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function sanitizeFilename(name) {
    return (name || "transcript").replace(/[/\\?%*:|"<>]/g, "-").slice(0, 60);
  }

  // Settings & Upgrades Modal
  btnSettings.addEventListener("click", () => {
    modalOverlay.style.display = "flex";
    checkBackendHealth();
  });

  modalCloseBtn.addEventListener("click", () => {
    modalOverlay.style.display = "none";
  });

  modalOverlay.addEventListener("click", e => {
    if (e.target === modalOverlay) {
      modalOverlay.style.display = "none";
    }
  });

  btnTestConnection.addEventListener("click", async () => {
    backendUrl = settingBackendUrl.value.trim().replace(/\/+$/, "");
    chrome.storage.local.set({ backendUrl });
    const ok = await checkBackendHealth();
    alert(
      ok
        ? "Connected successfully to Python API!"
        : "Could not connect to Python API. Check if server is running."
    );
  });

  btnCheckUpdates.addEventListener("click", async () => {
    modalUpdateStatus.textContent = "Checking PyPI & GitHub...";
    try {
      const resp = await fetch(`${backendUrl}/health`);
      const data = await resp.json();
      modalInstalledVer.textContent = data.installed_version;
      modalLatestVer.textContent = data.latest_pypi_version;
      if (data.update_available) {
        modalUpdateStatus.textContent = `🚀 Update available! Installed: ${data.installed_version} -> Latest: ${data.latest_pypi_version}`;
        modalUpdateStatus.style.color = "#2ba640";
      } else {
        modalUpdateStatus.textContent = "✅ You have the newest version of youtube-transcript-api.";
        modalUpdateStatus.style.color = "#aaaaaa";
      }
    } catch (e) {
      modalUpdateStatus.textContent = "Error contacting backend.";
      modalUpdateStatus.style.color = "#ff0033";
    }
  });

  btnUpgradeApi.addEventListener("click", async () => {
    if (
      !confirm(
        "This will upgrade 'youtube-transcript-api' in your backend to the latest upstream version. Proceed?"
      )
    )
      return;

    modalUpdateStatus.textContent = "Upgrading package via pip... Please wait...";
    modalUpdateStatus.style.color = "#fbc02d";
    try {
      const resp = await fetch(`${backendUrl}/api/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "pypi" })
      });
      const data = await resp.json();
      if (data.success) {
        modalUpdateStatus.textContent = `🎉 Upgrade successful! Version: ${data.new_version}`;
        modalUpdateStatus.style.color = "#2ba640";
        modalInstalledVer.textContent = data.new_version;
        checkBackendHealth();
      } else {
        modalUpdateStatus.textContent = `Upgrade failed: ${data.details || data.error}`;
        modalUpdateStatus.style.color = "#ff0033";
      }
    } catch (e) {
      modalUpdateStatus.textContent = `Error during upgrade request: ${e.message}`;
      modalUpdateStatus.style.color = "#ff0033";
    }
  });
});
