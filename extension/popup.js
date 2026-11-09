/**
 * YouTube Transcript Scraper - Popup Controller
 * Dual Mode: In-Browser Direct & Python API (youtube-transcript-api)
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
  const viewport = document.getElementById("transcript-viewport");
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
  let availableTracks = [];
  let backendUrl = "http://127.0.0.1:5000";

  // Load saved preferences
  chrome.storage.local.get(["backendUrl", "preferredMode"], (res) => {
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
      const resp = await fetch(`${backendUrl}/health`, { method: "GET", signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        const data = await resp.json();
        const ver = data.installed_version || "OK";
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
    backendPill.className = "status-pill status-offline";
    backendStatusText.textContent = "API Offline";
    modalInstalledVer.textContent = "Not Running";
    modalUpdateStatus.textContent = "Run backend/run_server.bat to start Python API.";
    modalUpdateStatus.style.color = "#ff0033";
    return false;
  }

  // Detect Active YouTube Tab
  function initActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        activeTab = tabs[0];
        const url = activeTab.url || "";
        const videoId = extractVideoId(url);
        if (videoId) {
          currentVideoId = videoId;
          videoIdBadge.textContent = `ID: ${videoId}`;
          videoTitleEl.textContent = activeTab.title ? activeTab.title.replace(" - YouTube", "") : "YouTube Video";
          currentVideoTitle = videoTitleEl.textContent;
          queryPageData();
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

  // Request caption tracks from page context
  function queryPageData() {
    if (!activeTab || !activeTab.id) return;
    chrome.tabs.sendMessage(activeTab.id, { action: "GET_PAGE_DATA" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        // Content script might not have responded or page reloaded
        return;
      }
      if (res.title) {
        currentVideoTitle = res.title;
        videoTitleEl.textContent = res.title;
      }
      if (res.tracks && res.tracks.length > 0) {
        availableTracks = res.tracks;
        populateLanguageDropdown();
      }
    });
  }

  function populateLanguageDropdown() {
    langSelect.innerHTML = "";
    if (currentMode === "browser" && availableTracks.length > 0) {
      availableTracks.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.languageCode;
        opt.textContent = `${t.name?.runs?.[0]?.text || t.languageCode} (${t.languageCode})${t.kind === "asr" ? " [Auto]" : ""}`;
        langSelect.appendChild(opt);
      });
    } else {
      // Default common languages for Python API mode
      const defaults = [
        { code: "en", name: "English" },
        { code: "es", name: "Spanish" },
        { code: "fr", name: "French" },
        { code: "de", name: "German" },
        { code: "pt", name: "Portuguese" },
        { code: "ja", name: "Japanese" },
        { code: "zh", name: "Chinese" },
        { code: "hi", name: "Hindi" },
        { code: "ar", name: "Arabic" },
        { code: "ru", name: "Russian" }
      ];
      defaults.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.code;
        opt.textContent = `${d.name} (${d.code})`;
        langSelect.appendChild(opt);
      });
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
      alert("No active YouTube video selected.");
      return;
    }

    setLoading(true, "Scraping transcript...");

    if (currentMode === "browser") {
      fetchViaBrowserMode();
    } else {
      fetchViaPythonMode();
    }
  }

  // 1. In-Browser Direct Mode (via content.js)
  function fetchViaBrowserMode() {
    if (!activeTab || !activeTab.id) {
      fallbackToPythonDueToNoTab("No active browser tab found. Trying Python API...");
      return;
    }

    const selectedLang = langSelect.value || "en";
    chrome.tabs.sendMessage(activeTab.id, {
      action: "FETCH_PAGE_TRANSCRIPT",
      languageCode: selectedLang
    }, (res) => {
      if (chrome.runtime.lastError || !res || !res.success) {
        const err = res ? res.error : "Could not connect to YouTube page.";
        console.warn("In-Browser fetch failed:", err);
        // Fallback automatically to Python API if running
        fallbackToPythonDueToNoTab(`In-browser extraction unavailable (${err}). Trying Python API...`);
        return;
      }
      currentSnippets = res.snippets || [];
      renderTranscript(currentSnippets);
    });
  }

  function fallbackToPythonDueToNoTab(msg) {
    setLoading(true, msg);
    fetchViaPythonMode();
  }

  // 2. Python API Mode (via youtube-transcript-api)
  async function fetchViaPythonMode() {
    const selectedLang = langSelect.value || "en";
    const translateTo = translateSelect.value || "";

    let url = `${backendUrl}/api/transcript?video_id=${currentVideoId}&languages=${selectedLang}&format=json`;
    if (translateTo) {
      url += `&translate=${translateTo}`;
    }

    try {
      const resp = await fetch(url);
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch transcript from Python API");
      }
      currentSnippets = data.snippets || [];
      renderTranscript(currentSnippets);
    } catch (err) {
      setLoading(false);
      emptyState.style.display = "flex";
      transcriptList.style.display = "none";
      emptyState.innerHTML = `
        <div style="color:#ff0033; font-weight:600; margin-bottom:8px;">Scrape Failed</div>
        <p style="font-size:12px; line-height:1.4;">${err.message}</p>
        <div style="font-size:11px; color:#888; margin-top:8px;">
          Tip: If running Python mode, make sure <code>run_server.bat</code> is running, or switch to <strong>⚡ In-Browser Direct</strong> mode.
        </div>
      `;
    }
  }

  function setLoading(loading, text = "Loading...") {
    if (loading) {
      emptyState.style.display = "flex";
      transcriptList.style.display = "none";
      emptyState.innerHTML = `
        <div style="margin-bottom:8px;">
          <svg width="28" height="28" viewBox="0 0 24 24" stroke="#ff0033" stroke-width="2" fill="none" class="spin">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10"></path>
          </svg>
        </div>
        <p>${text}</p>
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

      // Click to seek video in the active YouTube tab!
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
  searchInput.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderTranscript(currentSnippets);
      return;
    }
    const filtered = currentSnippets.filter(s => s.text.toLowerCase().includes(q));
    renderTranscript(filtered, q);
  });

  // Time Formatter
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
    return text.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Dropdown Handling
  btnCopy.addEventListener("click", (e) => {
    e.stopPropagation();
    copyMenu.parentElement.classList.toggle("open");
    downloadMenu.parentElement.classList.remove("open");
  });

  btnDownload.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadMenu.parentElement.classList.toggle("open");
    copyMenu.parentElement.classList.remove("open");
  });

  document.addEventListener("click", () => {
    copyMenu.parentElement.classList.remove("open");
    downloadMenu.parentElement.classList.remove("open");
  });

  // Copy Actions
  document.getElementById("action-copy-plain").addEventListener("click", (e) => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const text = currentSnippets.map(s => s.text).join(" ");
      copyToClipboard(text, "Plain text copied to clipboard!");
    }
  });

  document.getElementById("action-copy-timestamps").addEventListener("click", (e) => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const text = currentSnippets.map(s => `[${formatTime(s.start)}] ${s.text}`).join("\n");
      copyToClipboard(text, "Timestamped transcript copied!");
    }
  });

  document.getElementById("action-copy-markdown").addEventListener("click", (e) => {
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
  document.getElementById("action-download-txt").addEventListener("click", (e) => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const text = currentSnippets.map(s => s.text).join(" ");
      downloadBlob(text, `${sanitizeFilename(currentVideoTitle)}.txt`, "text/plain");
    }
  });

  document.getElementById("action-download-srt").addEventListener("click", (e) => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const srt = generateSRT();
      downloadBlob(srt, `${sanitizeFilename(currentVideoTitle)}.srt`, "text/plain");
    }
  });

  document.getElementById("action-download-vtt").addEventListener("click", (e) => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const vtt = generateVTT();
      downloadBlob(vtt, `${sanitizeFilename(currentVideoTitle)}.vtt`, "text/vtt");
    }
  });

  document.getElementById("action-download-json").addEventListener("click", (e) => {
    e.preventDefault();
    if (verifySnippetsExist()) {
      const json = JSON.stringify({
        video_id: currentVideoId,
        title: currentVideoTitle,
        count: currentSnippets.length,
        transcript: currentSnippets
      }, null, 2);
      downloadBlob(json, `${sanitizeFilename(currentVideoTitle)}.json`, "application/json");
    }
  });

  document.getElementById("action-download-md").addEventListener("click", (e) => {
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

  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.style.display = "none";
    }
  });

  btnTestConnection.addEventListener("click", async () => {
    backendUrl = settingBackendUrl.value.trim().replace(/\/+$/, "");
    chrome.storage.local.set({ backendUrl });
    const ok = await checkBackendHealth();
    alert(ok ? "Connected successfully to Python API!" : "Could not connect to Python API. Check if server is running.");
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
    if (!confirm("This will upgrade 'youtube-transcript-api' in your backend to the latest upstream version. Proceed?")) return;

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

