# 🎬 YouTube Transcript Scraper & Downloader

<p align="center">
  <img src="extension/icons/icon128.png" width="96" height="96" alt="YouTube Transcript Scraper Logo" />
</p>

<p align="center">
  <a href="https://github.com/AkmKawser/Youtube-Transcript-Scrapper/releases"><img src="https://img.shields.io/github/v/release/AkmKawser/Youtube-Transcript-Scrapper?color=ff0033&logo=github" alt="GitHub Release" /></a>
  <a href="https://github.com/AkmKawser/Youtube-Transcript-Scrapper/releases/latest"><img src="https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue?logo=googlechrome" alt="Chrome Extension" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/python-3.10%2B-brightgreen?logo=python" alt="Python Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
</p>

A high-performance Chrome Extension (Manifest V3) and Python backend for extracting, translating, searching, and exporting YouTube transcripts in **TXT**, **SRT**, **WebVTT**, **JSON**, and **Markdown**.

Engineered with a **smart dual-path architecture**: instantly copies native YouTube transcripts when available, and automatically falls back to an **offline AI Speech-to-Text engine (`faster-whisper`)** for videos that have no captions (such as completed live streams and newly released uploads).

---

<p align="center">
  <img src="docs/images/preview.png" width="420" alt="Extension UI Preview" style="border-radius:10px; box-shadow: 0 4px 14px rgba(0,0,0,0.4);" />
</p>

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    Start["YouTube Video URL or Tab"] --> CheckCaptions{"Does YouTube provide auto or manual transcript?"}
    
    %% Path 1: Direct Caption Extraction
    CheckCaptions -- "Yes" --> Direct["Instant Direct Transcript Extractor 0ms"]
    Direct --> DOMModern["Modern DOM Panel PAmodern_transcript_view"]
    Direct --> DOMLegacy["Legacy DOM Panel ytd-transcript-segment-renderer"]
    Direct --> InnertubeAPI["Innertube API / youtube-transcript-api"]
    DOMModern --> LangRule["Strict Language Routing and Conversion"]
    DOMLegacy --> LangRule
    InnertubeAPI --> LangRule

    %% Path 2: Audio Extraction & Whisper ASR Fallback
    CheckCaptions -- "No (Live Stream / Fresh Upload)" --> ASR["Audio-to-Text Pipeline Whisper ASR"]
    ASR --> AudioDL["1. Extract Audio Stream via yt-dlp"]
    AudioDL --> AudioDec["2. In-Memory Audio Decode via PyAV"]
    AudioDec --> WhisperTranscribe["3. Speech Recognition via faster-whisper CPU int8"]
    WhisperTranscribe --> LangRule

    %% Strict Language Transformation
    LangRule --> TargetChoice{"Select Target Language"}
    TargetChoice -- "English (en)" --> OutEN["English Output: Preserves English, auto-converts Hindi or other sources to English"]
    TargetChoice -- "Bangla (bn)" --> OutBN["Bangla Output: Preserves native Bangla, auto-translates English or Hindi to Bangla"]

    %% Export Formats
    OutEN --> ExportFormats["Export Formats: Plain Text (.txt), Subtitles (.srt, .vtt), JSON, Markdown (.md)"]
    OutBN --> ExportFormats
```

### 🎯 Key Architectural Pillars

1. **Direct Native Caption Ingestion (0ms Latency):**
   - Automatically detects and copies native or auto-generated YouTube captions.
   - Fully compatible with YouTube's **2026 Modern Transcript Panel** (`PAmodern_transcript_view` with `<transcript-segment-view-model>`) and legacy panels.
2. **Audio-to-Text AI Fallback (`faster-whisper` + `yt-dlp`):**
   - When a video has **no captions** (e.g. newly streamed live videos or newly uploaded videos):
     - Downloads the audio stream directly with `yt-dlp`.
     - Automatically decodes audio in memory using `PyAV`.
     - Generates timestamped subtitle segments locally using `faster-whisper` (CPU int8, zero external API keys needed).
3. **Strict Two-Language Output Pipeline (`English` & `Bangla`):**
   - Output transcripts are strictly constrained to **English (`en`)** or **Bangla (`bn`)**.
   - **Hindi Source:** Automatically detected and converted into English (or Bangla if requested).
   - **Bangla Source:** Kept natively in Bangla without unwanted translation (or translated into English if requested).
   - **English Source:** Kept in English (or translated into Bangla if requested).
4. **Upstream Synchronization:**
   - Seamlessly synchronizes with upstream improvements from [`jdepoix/youtube-transcript-api`](https://github.com/jdepoix/youtube-transcript-api).

---

## 🌟 Key Features

* **⚡ Dual-Mode Integration:**
  * **⚡ In-Browser Direct (Zero-Setup):** Scrapes captions directly from your active YouTube tab using your existing browser session. *Immune to IP bans or HTTP 429 rate-limiting.*
  * **🐍 Python API Mode (`backend/app.py`):** Communicates with local REST backend providing formatters, Whisper ASR audio transcription, and upstream updates.
* **🎙️ Speech-to-Text for Caption-Less Videos:** Converts speech to text on demand for videos without captions.
* **⏱️ Interactive Clickable Timestamps:** Clicking any timestamp in the transcript automatically seeks the YouTube player to that exact moment.
* **🔍 Real-Time Search & Highlight:** Instantly search through transcript lines with keyword highlighting and match counts.
* **📥 Multi-Format Export:**
  * **Plain Text (`.txt`)** – Continuous text for reading, notes, or LLM prompting.
  * **SubRip (`.srt`)** – Standard timecoded subtitle file for video players.
  * **WebVTT (`.vtt`)** – HTML5 video subtitles.
  * **JSON (`.json`)** – Structured array with `start`, `duration`, and `text`.
  * **Markdown (`.md`)** – Clean timestamped document with headers.
* **📋 One-Click Copy:** Copy plain text, timestamped transcripts, or Markdown directly to your clipboard.

---

## 📁 Repository Structure

```
Youtube-Transcript-Scrapper/
├── backend/                      # Python backend API & AI speech engine
│   ├── app.py                    # Flask REST API with CORS, formatters & fallback
│   ├── audio_transcriber.py      # Audio extraction (yt-dlp) + Whisper ASR (faster-whisper)
│   ├── updater.py                # PyPI/GitHub upstream version checker & updater
│   ├── run_server.bat            # One-click Windows runner
│   └── requirements.txt          # Backend dependencies
├── extension/                    # Chrome Extension (Manifest V3)
│   ├── manifest.json             # Manifest V3 specification
│   ├── popup.html                # Modern popup UI (Dark Theme)
│   ├── popup.css                 # Responsive YouTube-style styling
│   ├── popup.js                  # Controller for Dual-Engine + update manager
│   ├── content.js                # In-page extractor, video seek & injected drawer
│   ├── background.js             # Service worker & origin header modifiers
│   └── icons/                    # Extension icons (16, 48, 128)
├── tests/                        # Comprehensive unit tests
│   └── test_scraper.py           # Test suite (URL parser, formatting, ASR translation)
├── cli.py                        # Standalone CLI tool for terminal power-users
├── package_extension.py          # Extension packager script
├── requirements.txt              # Project dependencies
├── LICENSE                       # MIT License
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
5. Pin the extension to your Chrome toolbar.

---

### Step 2: Start the Python Backend (Required for Whisper ASR & Python Mode)

To enable offline Speech-to-Text (`faster-whisper`) for live streams and videos without captions:

1. Double-click `backend/run_server.bat` (on Windows), **OR** run in terminal:
   ```bash
   # Activate virtual environment
   .venv\Scripts\activate

   # Install dependencies
   pip install -r backend/requirements.txt

   # Run backend API
   python backend/app.py
   ```
2. The server starts on `http://127.0.0.1:5000`.
3. The extension automatically detects the server and illuminates a green status pill.

---

## 💻 CLI Usage

You can also scrape and transcribe videos directly from the command line:

```bash
# 1. Scrape standard YouTube video transcript to TXT
python cli.py https://www.youtube.com/watch?v=dQw4w9WgXcQ --format txt

# 2. Extract subtitles as SRT file translated into Bangla
python cli.py dQw4w9WgXcQ --translate bn --format srt -o subtitles_bn.srt

# 3. Transcribe a live stream or video without captions using Whisper ASR
python cli.py https://www.youtube.com/watch?v=5J2eSSgLD40 --translate en --format md -o transcript.md

# 4. Check for upstream library updates
python cli.py --check-update
```

---

## 🛠️ REST API Reference

The backend exposes clean REST endpoints:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/health` | `GET` | Health check, installed version, and Whisper ASR status |
| `/api/languages?video_id={id}` | `GET` | Lists available native and translated caption languages |
| `/api/transcript?video_id={id}&format={txt\|srt\|vtt\|json\|md}` | `GET` | Fetches transcript (auto-falls back to Whisper ASR if no captions exist) |
| `/api/transcribe_audio?video_id={id}&target_lang={en\|bn}` | `GET/POST` | Dedicated Whisper speech-to-text audio pipeline |
| `/api/update` | `POST` | Upgrades core `youtube-transcript-api` package on the fly |

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

