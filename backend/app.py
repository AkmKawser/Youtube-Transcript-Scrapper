"""
Flask REST API server for YouTube Transcript Scraper.
Connects the Chrome Extension to youtube-transcript-api with dynamic formatters,
language translation, and on-the-fly package updates.
"""

import os
import sys
import re
import traceback

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify
from flask_cors import CORS

import youtube_transcript_api
from youtube_transcript_api import (
    YouTubeTranscriptApi,
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
    IpBlocked,
    RequestBlocked,
    AgeRestricted
)
from youtube_transcript_api.formatters import (
    TextFormatter,
    SRTFormatter,
    WebVTTFormatter,
    JSONFormatter
)

import updater
import live_dvr

app = Flask(__name__)
# Enable CORS for all routes so Chrome Extension can communicate seamlessly
CORS(app, resources={r"/*": {"origins": "*"}})


def extract_video_id(url_or_id: str) -> str:
    """Extract 11-char video ID from various YouTube URL formats or return raw ID."""
    if not url_or_id:
        return ""
    url_or_id = url_or_id.strip()
    patterns = [
        r"(?:v=|\/embed\/|\/live\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})",
        r"^([a-zA-Z0-9_-]{11})$"
    ]
    for pattern in patterns:
        match = re.search(pattern, url_or_id)
        if match:
            return match.group(1)
    return url_or_id


def format_markdown(snippets) -> str:
    """Format transcript snippets into Markdown with timestamps."""
    lines = []
    for item in snippets:
        start_sec = int(item.get("start", 0))
        minutes = start_sec // 60
        seconds = start_sec % 60
        timestamp = f"{minutes:02d}:{seconds:02d}"
        text = item.get("text", "").strip()
        lines.append(f"**[{timestamp}]** {text}")
    return "\n\n".join(lines)


@app.route("/", methods=["GET"])
@app.route("/health", methods=["GET"])
@app.route("/api/status", methods=["GET"])
def health():
    """Health check and version status."""
    update_info = updater.check_latest_pypi_version()
    return jsonify({
        "status": "online",
        "service": "YouTube Transcript Scraper API",
        "package": "youtube-transcript-api",
        "installed_version": updater.get_current_version(),
        "latest_pypi_version": update_info.get("latest_version"),
        "update_available": update_info.get("update_available", False)
    })


@app.route("/api/languages", methods=["GET", "POST"])
def get_languages():
    """List all available transcripts & translation targets for a given video."""
    data = request.get_json(silent=True) or {}
    video_id_param = request.args.get("video_id") or request.args.get("url") or data.get("video_id") or data.get("url")
    video_id = extract_video_id(video_id_param)

    if not video_id:
        return jsonify({"error": "Missing 'video_id' or 'url' parameter"}), 400

    try:
        ytt = YouTubeTranscriptApi()
        transcript_list = ytt.list(video_id)

        manual = []
        generated = []
        translation_targets = []

        for t in transcript_list:
            item = {
                "language": t.language,
                "code": t.language_code,
                "is_generated": t.is_generated,
                "is_translatable": t.is_translatable
            }
            if t.is_generated:
                generated.append(item)
            else:
                manual.append(item)

        # Retrieve available translation languages if translatable
        if hasattr(transcript_list, "_translation_languages"):
            for lang in transcript_list._translation_languages:
                l_name = getattr(lang, "language", None)
                if not l_name and isinstance(lang, dict):
                    l_name = lang.get("language") or lang.get("language_name", {}).get("runs", [{}])[0].get("text", "")
                
                l_code = getattr(lang, "language_code", None)
                if not l_code and isinstance(lang, dict):
                    l_code = lang.get("language_code", "")

                translation_targets.append({
                    "language": str(l_name or ""),
                    "code": str(l_code or "")
                })

        return jsonify({
            "success": True,
            "video_id": video_id,
            "manual": manual,
            "generated": generated,
            "available_translations": translation_targets
        })

    except TranscriptsDisabled:
        return jsonify({"error": "Transcripts are disabled for this video", "code": "TRANSCRIPTS_DISABLED"}), 404
    except VideoUnavailable:
        return jsonify({"error": "Video is unavailable or does not exist", "code": "VIDEO_UNAVAILABLE"}), 404
    except AgeRestricted:
        return jsonify({"error": "Video is age restricted (cookies required)", "code": "AGE_RESTRICTED"}), 403
    except (IpBlocked, RequestBlocked):
        return jsonify({"error": "YouTube blocked this request from this IP. Please use the extension's In-Browser mode.", "code": "IP_BLOCKED"}), 429
    except Exception as e:
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


@app.route("/api/transcript", methods=["GET", "POST"])
def get_transcript():
    """
    Fetch transcript for a video.
    Params:
      - video_id / url
      - languages: comma separated (e.g. 'en,es') or list
      - translate: language code to translate into (e.g. 'es')
      - format: 'json', 'txt', 'srt', 'vtt', 'markdown' (default 'json')
      - cookies: optional path to cookies.txt
    """
    data = request.get_json(silent=True) or {}
    video_id_param = request.args.get("video_id") or request.args.get("url") or data.get("video_id") or data.get("url")
    video_id = extract_video_id(video_id_param)

    if not video_id:
        return jsonify({"error": "Missing 'video_id' or 'url' parameter"}), 400

    lang_param = request.args.get("languages") or data.get("languages") or "en"
    if isinstance(lang_param, str):
        languages = [l.strip() for l in lang_param.split(",") if l.strip()]
    else:
        languages = list(lang_param)

    translate_target = request.args.get("translate") or data.get("translate")
    out_format = (request.args.get("format") or data.get("format") or "json").lower()
    cookies_path = request.args.get("cookies") or data.get("cookies")

    try:
        ytt = YouTubeTranscriptApi()
        
        # If translation or advanced fallback is requested
        if translate_target:
            transcript_list = ytt.list(video_id)
            # Find closest transcript or first available
            try:
                base_transcript = transcript_list.find_transcript(languages)
            except Exception:
                base_transcript = next(iter(transcript_list))
            fetched = base_transcript.translate(translate_target).fetch()
        else:
            try:
                fetched = ytt.fetch(video_id, languages=languages)
            except NoTranscriptFound:
                # Fallback to any transcript available
                transcript_list = ytt.list(video_id)
                first_tr = next(iter(transcript_list))
                fetched = first_tr.fetch()

        # Convert fetched to raw list of dicts
        raw_snippets = []
        for s in fetched:
            raw_snippets.append({
                "text": s.text if hasattr(s, "text") else s.get("text", ""),
                "start": float(s.start if hasattr(s, "start") else s.get("start", 0)),
                "duration": float(s.duration if hasattr(s, "duration") else s.get("duration", 0))
            })

        # Apply desired formatting
        if out_format == "txt":
            content = TextFormatter().format_transcript(fetched)
            return content, 200, {"Content-Type": "text/plain; charset=utf-8"}
        elif out_format == "srt":
            content = SRTFormatter().format_transcript(fetched)
            return content, 200, {"Content-Type": "text/plain; charset=utf-8"}
        elif out_format == "vtt":
            content = WebVTTFormatter().format_transcript(fetched)
            return content, 200, {"Content-Type": "text/vtt; charset=utf-8"}
        elif out_format == "markdown":
            content = format_markdown(raw_snippets)
            return content, 200, {"Content-Type": "text/markdown; charset=utf-8"}
        else:
            return jsonify({
                "success": True,
                "video_id": video_id,
                "count": len(raw_snippets),
                "snippets": raw_snippets,
                "plain_text": TextFormatter().format_transcript(fetched),
                "markdown": format_markdown(raw_snippets)
            })

    except (TranscriptsDisabled, NoTranscriptFound, IpBlocked, RequestBlocked) as fallback_err:
        # Fallback for recently completed Live Streams (isPostLiveDvr) using DASH WebVTT segments
        target_lang = translate_target or (languages[0] if languages else "en")
        dvr_snippets = live_dvr.extract_live_dvr_transcript(video_id, target_lang=target_lang)
        if dvr_snippets:
            fetched_objs = [live_dvr.SimpleSnippet(s["text"], s["start"], s["duration"]) for s in dvr_snippets]
            if out_format == "txt":
                return TextFormatter().format_transcript(fetched_objs), 200, {"Content-Type": "text/plain; charset=utf-8"}
            elif out_format == "srt":
                return SRTFormatter().format_transcript(fetched_objs), 200, {"Content-Type": "text/plain; charset=utf-8"}
            elif out_format == "vtt":
                return WebVTTFormatter().format_transcript(fetched_objs), 200, {"Content-Type": "text/vtt; charset=utf-8"}
            elif out_format == "markdown":
                return format_markdown(dvr_snippets), 200, {"Content-Type": "text/markdown; charset=utf-8"}
            else:
                return jsonify({
                    "success": True,
                    "video_id": video_id,
                    "source": "live_dvr_webvtt",
                    "count": len(dvr_snippets),
                    "snippets": dvr_snippets,
                    "plain_text": TextFormatter().format_transcript(fetched_objs),
                    "markdown": format_markdown(dvr_snippets)
                })
        if isinstance(fallback_err, (IpBlocked, RequestBlocked)):
            return jsonify({
                "error": "YouTube blocked /api/timedtext from this IP. Open the video in Chrome and use '⚡ In-Browser Direct' mode.",
                "code": "IP_BLOCKED"
            }), 429
        return jsonify({"error": "Transcripts are disabled for this video", "code": "TRANSCRIPTS_DISABLED"}), 404
    except Exception as e:
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


@app.route("/api/update", methods=["POST"])
def trigger_update():
    """
    Triggers an on-demand update of youtube-transcript-api from PyPI or GitHub.
    Allows seamlessly keeping the extension integrated with upstream repo fixes.
    """
    data = request.get_json(silent=True) or {}
    source = data.get("source", "pypi").lower()

    if source == "github":
        result = updater.upgrade_from_github()
    else:
        result = updater.upgrade_from_pypi()

    return jsonify(result)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"🚀 Starting YouTube Transcript Scraper API on http://127.0.0.1:{port}")
    print(f"📦 youtube-transcript-api version: {updater.get_current_version()}")
    app.run(host="127.0.0.1", port=port, debug=False)
