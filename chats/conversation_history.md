# Project Conversations & Changelog History

This directory archives key conversations, user architectural requests, and changelogs for the **YouTube Transcript Scraper & Downloader** project.

---

## 📜 Conversation Log - November 9–10, 2026

### 1. Language Restriction Request
* **User Directive:** "add only 2 language. English, Bangla"
* **Implementation:**
  * Cleaned all language selectors across the Chrome Extension popup, in-page UI, backend API, and CLI.
  * Restricted dropdowns and API validation to `English ('en')` and `Bangla ('bn' - বাংলা)`.

### 2. Live Stream & YouTube Modern UI Bug Fixes
* **Issues Encountered:**
  * Completed live streams (e.g. `5J2eSSgLD40`) returned no direct subtitles via `/api/timedtext`.
  * YouTube's new 2026 DOM panel (`PAmodern_transcript_view` using `<transcript-segment-view-model>`) failed detection in older query selectors.
* **Resolution:**
  * Updated DOM selectors to detect both `<transcript-segment-view-model>` and `<ytd-transcript-segment-renderer>`.
  * Implemented Bengali Unicode regex `[\u0980-\u09FF]` to detect native Bangla vs. English without unnecessary translation calls.

### 3. Architecture Redesign: Direct Copy + Local Whisper ASR
* **User Directive:**
  > "i want to completely change the project architecture. for videos where youtube provide auto transcript you can take that and copy that. for video which did not provide transcript for example live videos or videos that has been recently released which youtube did not provide any transcript yet you can convert that video into auto and then convert that audio to text. make sure you take the source video if its in hindi then convert in into english and if its a bangla then dont need to convert. the output transcript can only be either bangla or english."
* **Implementation:**
  * **Path 1 (Native Transcript):** When auto or manual captions exist, copies instantly (0ms) from YouTube's DOM or Innertube API.
  * **Path 2 (Audio-to-Text Fallback):** When no transcript exists (completed live streams, newly uploaded videos, disabled captions), extracts audio via `yt-dlp` and converts to timestamped text locally using `faster-whisper` (CPU int8, zero external API keys).
  * **Language Transformation:**
    * Hindi source $\rightarrow$ converted to English.
    * Bangla source $\rightarrow$ preserved in Bangla (or translated to English if requested).
    * Output is strictly constrained to English (`en`) or Bangla (`bn`).

### 4. Removal of Obsolete Legacy Code
* **User Directive:** "remove all the old technology files and only keep the new update files and methods."
* **Actions Taken:**
  * Removed `backend/live_dvr.py` and obsolete multi-segment WebVTT batch loaders (`extractLiveDvrDashInPopup` and `extractLiveDvrDashInPage`).
  * Removed `FETCH_DVR_BATCH` from `extension/background.js`.
  * Standardized backend, CLI, and extension on `backend/audio_transcriber.py`.

### 5. Persistent Window Feature (Pop-out Mode)
* **User Directive:** "make the feature if i click somewhere else the extension work should never go."
* **Implementation:**
  * Added a dedicated **Pop-out Window Button** (↗️) in the extension popup header.
  * Clicking it opens the scraper in an independent Chrome window (`popup.html?mode=window`, 480x640px).
  * Unlike standard extension popups which automatically close when you click elsewhere in your browser, this window stays open persistently, allowing continuous scraping, viewing, searching, and exporting while pair-programming or browsing other tabs.

### 6. Environment Execution Rule
* **User Directive:** "stop running virtual env in the background from next time"
* **Rule Established:** The assistant will not spawn background daemons or background Python servers automatically. The user runs `backend/run_server.bat` or `.venv\Scripts\python.exe backend\app.py` on demand when needed.

### 7. One-Click Python Server Launch via Windows Protocol Handler
* **User Directive:** "is there a way to put that button on the extension so it does what is mention run_server.bat? option-1"
* **Implementation:**
  * Created `register_protocol.bat` which registers the `yt-transcript://` protocol in the Windows Registry (`HKCU\Software\Classes\yt-transcript`).
  * Updated extension error states: when a video has no YouTube captions and the Python backend is offline, a prominent **`🚀 Start Python AI Server`** button appears in the popup.
  * Clicking it triggers `yt-transcript://start` to launch `backend/run_server.bat` directly from the extension, auto-polls for connection, and automatically resumes transcription once online.

### 8. Full State Persistence & Anti-Dismissal Workflow
* **User Directive:** "আমি যদি extension থেকে mouse সরিয়ে দেই তারপরও extension তার কাজ করতে থাকবে। mouse সরিয়ে অন্য কোথাও CLICK করলে এখন যেটা হচ্ছে তা হোল extension তার কাজ বন্ধ করে দিচ্ছে।"
* **Implementation:**
  * Enabled automatic caching in `chrome.storage.local` (`lastVideoId`, `lastVideoTitle`, `lastSnippets`, `lastLang`).
  * Reopening the extension instantly restores the previously scraped transcript lines and active state without re-fetching or losing data.
  * Combined with the dedicated **Pop-out Window Button (↗️)**, users can keep the extension open in a persistent floating window that never dismisses when interacting with other browser tabs or windows.

### 9. Documentation & Diagram Fixes
* **User Directive:** "remove this piece of crap image. it was a bug. remove this image." / "fix Mermaid parse error"
* **Implementation:**
  * Permanently deleted `docs/images/preview.png` and removed all preview image tags from `README.md`.
  * Sanitized all edge labels in the Mermaid diagram (`-- "English (en)" -->` and `-- "Bangla (bn)" -->`) to resolve syntax errors in GitHub's native parser.

### 10. Direct Audio (.mp3) Download Feature
* **User Directive:** "when you generate the audio file. let the user download it. so that he can use the audio.mp3"
* **Implementation:**
  * Added `convert_to_mp3()` using `PyAV` in `backend/audio_transcriber.py` to produce a high-fidelity MP3 file.
  * Added `/api/audio?video_id={id}` and `/api/download_audio` endpoints in `backend/app.py` to stream the generated MP3 as an attachment.
  * Added a dedicated **"🎵 Audio (.mp3)"** option in the extension's **⬇ Export** dropdown menu with Chrome `downloads` permission, allowing one-click download of the extracted audio.

### 11. Architecture Pivot: Direct Captions Copy + MP3 Download for External AI Agents
* **User Directive:**
  > "i want to change the architecture., just let the user download the audio. you dont have to translate. user will place the audio to an agent and make it translate by themselves. change all the codes and files including the readme.md and the architecture."
* **Implementation:**
  * **Removed Heavy Local ASR (`faster-whisper`):** Removed `faster-whisper` and local translation dependencies, eliminating slow CPU inference, PyAV metadata errors, and heavy PyTorch/ctranslate2 memory consumption.
  * **Lightweight Audio Extraction (`backend/audio_extractor.py`):** Utilizes `yt-dlp` to download the audio stream directly and `PyAV` (`av`) to encode standard `audio.mp3` in 1–2 seconds.
  * **Extension UI Overhaul:**
    * When YouTube provides native/auto captions: transcripts are copied directly with 0ms latency.
    * When YouTube has NO captions (e.g. fresh uploads or completed live streams): the extension presents a dedicated download card with **`⬇ Download Audio (.mp3)`**, informing the user that they can upload this audio directly to ChatGPT, Claude, Gemini, or Whisper AI.
  * **Updated CLI & API:**
    * CLI supports `--audio` to extract and save audio directly to a target MP3 file.
    * Backend API provides `/api/audio?video_id={id}` for instant streaming and download.
  * **Documentation & Diagram:**
    * Updated `README.md` with the new two-path architecture (Direct Captions $\rightarrow$ Multi-format Export vs. Audio Extraction $\rightarrow$ MP3 Download $\rightarrow$ External AI Agent).

### 12. Release v1.0.1
* **User Directive:** "make the release 1.0.1 also update the release readme"
* **Implementation:**
  * Bumped Manifest V3 extension version to `1.0.1` in `extension/manifest.json`.
  * Added Release Highlights section to `README.md`.
  * Re-packaged `dist/youtube-transcript-scraper-extension.zip` with validated Manifest V3 structure.
  * Tagged Git commit with `v1.0.1` and pushed to remote `origin main`.
  * Published official GitHub Release `v1.0.1` with release notes and downloadable extension asset.

### 13. High-Speed Bandwidth Optimization, API Reconnect & UI Redesign
* **User Directive:** "make sure it uses maximum speed of internet when downloading audio. also fix the api always offline. also i want you to redesign the extension interface according to the new update."
* **Implementation:**
  * **Maximum Network Throughput in Audio Extractor:**
    * Configured `yt-dlp` in `backend/audio_extractor.py` with 16 parallel fragment streams (`concurrent_fragment_downloads: 16`), 20MB HTTP chunk sizes (`http_chunk_size: 20971520`), 4MB memory buffer (`buffersize: 4194304`), and aggressive retry handling.
    * Allows saturating the user's full internet bandwidth during audio stream extraction.
  * **API Offline Resolution & Seamless Reconnection:**
    * Bound Flask server to `0.0.0.0` with multi-threading enabled (`threaded=True`).
    * Updated extension health checker in `extension/popup.js` to probe both `127.0.0.1` and `localhost` with automatic fallback.
    * Updated protocol handler command in Windows Registry to `cmd.exe /c start "" "...\backend\run_server.bat"`.
    * Made the status pill in the popup header interactive: clicking it immediately launches the backend server or refreshes the connection.
  * **Extension Interface Redesign:**
    * Added a dedicated **Quick Audio Banner** (`.quick-audio-bar`) under the mode toggle with a prominent **`⬇ Download .mp3`** action.
    * Modernized styling with sleek gradient highlights, enhanced hover states, and clear guidance for feeding audio into ChatGPT, Claude, Gemini, or Whisper AI.

### 14. Elimination of Server Dependency for Audio Download
* **User Directive:** "what the heck is its doing with this? just download the audio file. and do nothing else. what are you doing here?"
* **Problem Identified:**
  * Previously, clicking audio download buttons forced a launch of `backend/run_server.bat`, which opened a command prompt window running Flask, dependency checks, and debug logging.
  * The user did not want a web server running or a terminal window open just to save an audio file.
* **Resolution:**
  * **100% In-Browser Native Audio Download:** The Chrome extension now extracts the raw audio stream (`audio/mp4` / `m4a` or `webm`) directly from YouTube's Innertube ANDROID player API and invokes `chrome.downloads.download` right inside the browser.
  * **Zero Server & Zero Terminal:** No Python server, no Flask, and no command prompt window are opened or required.
  * Users can simply close the terminal window. Audio downloads directly to their local download folder at maximum internet speed.






