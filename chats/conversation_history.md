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



