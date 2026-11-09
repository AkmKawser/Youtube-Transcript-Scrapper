# 🎬 YouTube Transcript Scraper & Downloader

[![GitHub Release](https://img.shields.io/github/v/release/AkmKawser/Youtube-Transcript-Scrapper?color=ff0033&logo=github)](https://github.com/AkmKawser/Youtube-Transcript-Scrapper/releases)
[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue?logo=googlechrome)](https://github.com/AkmKawser/Youtube-Transcript-Scrapper/releases/latest)
[![Python Version](https://img.shields.io/badge/python-3.10%2B-brightgreen?logo=python)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A modern Chrome Extension (Manifest V3) and Python API for extracting, searching, and exporting YouTube transcripts in **TXT**, **SRT**, **WebVTT**, **JSON**, and **Markdown**.

Powered by the popular [**`jdepoix/youtube-transcript-api`**](https://github.com/jdepoix/youtube-transcript-api) engine with **seamless upstream synchronization** so updates to the core repository are immediately reflected in your extension.

---

## 🌟 Key Features

* **⚡ Dual-Engine Extraction:**
  * **Engine 1: In-Browser Direct (Zero-Setup):** Scrapes captions directly from your active YouTube tab using your existing browser session. *Never gets blocked by IP bans or cloud 429 limits, and works with logged-in cookies.*
  * **Engine 2: Python API (`youtube-transcript-api`):** Communicates with a local REST backend powered by the latest `youtube-transcript-api` library. Supports automatic translation, formatters, and upstream updates.
* **🔄 Upstream Repo Synchronization:** When `jdepoix/youtube-transcript-api` releases updates or fixes on GitHub/PyPI, you can update your backend directly with **one click** from the Chrome extension popup or via `updater.py`.
* **⏱️ Clickable Timestamps:** Clicking any timestamp in the transcript automatically jumps the YouTube video player to that exact second.
* **🔍 Real-Time Search & Highlight:** Instantly search through transcript lines with keyword highlighting and match counters.
* **📥 Multi-Format Export:**
  * **Plain Text (`.txt`)** – continuous text for notes or LLM summarization.
  * **SubRip (`.srt`)** – standard timecoded subtitles.
  * **WebVTT (`.vtt`)** – HTML5 video subtitles.
  * **JSON (`.json`)** – structured data with `start`, `duration`, and `text`.
  * **Markdown (`.md`)** – formatted timestamped headers.
* **📋 One-Click Copy:** Copy plain text, timestamped transcripts, or Markdown directly to your clipboard.
* **🎯 In-Page Action Button:** Adds a discreet **"Transcript"** button directly on the YouTube video page (next to Like / Share) to open a slide-out transcript drawer.

---

## 📁 Repository Structure

```
Youtube-Transcript-Scrapper/
├── backend/                      # Python backend API (youtube-transcript-api wrapper)
│   ├── app.py                    # Flask REST API with CORS & formatters
│   ├── updater.py                # PyPI/GitHub upstream version checker & updater
│   ├── run_server.bat            # One-click Windows runner
│   └── requirements.txt          # Backend dependencies
├── extension/                    # Chrome Extension (Manifest V3)
│   ├── manifest.json             # Extension manifest
│   ├── popup.html                # Modern popup UI (Dark Theme)
│   ├── popup.css                 # Responsive YouTube-style styling
│   ├── popup.js                  # Controller for Dual-Engine + update manager
│   ├── content.js                # In-page extractor, video seek & injected drawer
│   ├── background.js             # Service worker & context menu handler
│   └── icons/                    # Extension icons (16, 48, 128)
├── requirements.txt              # Project dependencies
├── .gitignore                    # Git ignore file
└── README.md                     # Documentation
```

---

## 🚀 Quick Start Guide

### Step 1: Install the Chrome Extension

1. Open Google Chrome and navigate to: `chrome://extensions/`
2. Enable **Developer mode** using the toggle switch in the top right corner.
3. Click the **"Load unpacked"** button in the top left.
4. Select the `extension/` folder inside this repository:
   ```
   c:\Users\USER\Documents\.MYGITHUB\Youtube-Transcript-Scrapper\extension
   ```
5. The extension icon will appear in your Chrome toolbar. Pin it for easy access!

---

### Step 2: Start the Python Backend (Optional for Python API Mode)

The extension works out of the box in **⚡ In-Browser Direct** mode. If you also want to use the **🐍 Python API** engine (for translation, batch processing, and exact `youtube-transcript-api` formatters):

1. Double-click `backend/run_server.bat` (on Windows), **OR** run in terminal:
   ```bash
   # Activate virtual environment
   .venv\Scripts\activate

   # Run backend API
   python backend/app.py
   ```
2. The server starts on `http://127.0.0.1:5000`.
3. The extension will automatically detect the server and show a green **`API v1.2.5`** status pill!

---

## 🔄 How Upstream Repository Updates Work

When [jdepoix/youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api) updates on GitHub or releases a new version on PyPI, you don't need to rewrite or re-install the extension:

### Method A: One-Click from Extension UI
1. Click the extension icon.
2. Click the ⚙️ **Settings** icon in the header.
3. Click **"Check for Updates"**. The modal will compare your installed version against the latest PyPI release.
4. Click **"Update Library"**. The backend will upgrade `youtube-transcript-api` via pip and immediately apply the changes without restarting your browser!

### Method B: From the Terminal
Run the included updater script anytime:
```bash
python backend/updater.py
```
Or upgrade directly from GitHub's master branch:
```bash
pip install --upgrade git+https://github.com/jdepoix/youtube-transcript-api.git
```

---

## 🛠️ API Reference (Backend)

The Python backend exposes clean REST endpoints:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/health` | `GET` | Health check, installed version, and update status |
| `/api/languages?video_id={id}` | `GET` | Lists all manual, auto-generated, and translation target languages |
| `/api/transcript?video_id={id}&format={txt\|srt\|vtt\|json\|md}` | `GET` | Extracts and formats transcript |
| `/api/update` | `POST` | Triggers an upgrade of `youtube-transcript-api` |

---

## 💡 Troubleshooting & Tips

* **Age-Restricted Videos:** Use the **In-Browser Direct** mode while logged into your YouTube account in Chrome. It reads your authenticated session directly.
* **Rate Limits (`429 Too Many Requests`):** If your Python backend or IP gets rate-limited by YouTube, switch to the **In-Browser Direct** mode tab in the extension—it uses standard video player traffic and is never blocked.

