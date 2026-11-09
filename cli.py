#!/usr/bin/env python3
"""
YouTube Transcript Scraper - CLI Tool
Scrape transcripts directly from the command line for single videos or batch lists.
Supports TXT, SRT, WebVTT, JSON, and Markdown formats.
"""

import os
import sys
import argparse
import re
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

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


def format_markdown(snippets, video_id: str) -> str:
    """Format transcript snippets into Markdown."""
    lines = [
        f"# Transcript for YouTube Video ({video_id})",
        f"URL: https://www.youtube.com/watch?v={video_id}\n",
        "## Transcript Content\n"
    ]
    for item in snippets:
        start_sec = int(item.get("start", 0))
        minutes = start_sec // 60
        seconds = start_sec % 60
        timestamp = f"{minutes:02d}:{seconds:02d}"
        text = item.get("text", "").strip()
        lines.append(f"**[{timestamp}]** {text}\n")
    return "\n".join(lines)


def fetch_transcript_for_video(video_id: str, languages=("en",), translate_to=None):
    """Fetch transcript using youtube-transcript-api."""
    ytt = YouTubeTranscriptApi()

    if translate_to:
        transcript_list = ytt.list(video_id)
        try:
            base_tr = transcript_list.find_transcript(languages)
        except Exception:
            base_tr = next(iter(transcript_list))
        fetched = base_tr.translate(translate_to).fetch()
    else:
        try:
            fetched = ytt.fetch(video_id, languages=languages)
        except NoTranscriptFound:
            transcript_list = ytt.list(video_id)
            first_tr = next(iter(transcript_list))
            fetched = first_tr.fetch()

    snippets = []
    for s in fetched:
        snippets.append({
            "text": s.text if hasattr(s, "text") else s.get("text", ""),
            "start": float(s.start if hasattr(s, "start") else s.get("start", 0)),
            "duration": float(s.duration if hasattr(s, "duration") else s.get("duration", 0))
        })

    return fetched, snippets


def main():
    parser = argparse.ArgumentParser(
        description="YouTube Transcript Scraper - CLI Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Scrape a video to text
  python cli.py https://www.youtube.com/watch?v=dQw4w9WgXcQ

  # Scrape subtitles in SRT format to a specific file
  python cli.py dQw4w9WgXcQ --format srt -o subtitles.srt

  # Translate to Spanish
  python cli.py dQw4w9WgXcQ --translate es --format txt

  # Batch scrape a list of URLs from a file
  python cli.py --batch videos.txt --output-dir ./transcripts --format txt

  # Check / Upgrade upstream youtube-transcript-api library
  python cli.py --check-update
  python cli.py --upgrade
        """
    )

    parser.add_argument("url", nargs="?", help="YouTube video URL or 11-char Video ID")
    parser.add_argument("--batch", "-b", help="File containing YouTube URLs/IDs (one per line)")
    parser.add_argument("--format", "-f", choices=["txt", "srt", "vtt", "json", "md"], default="txt",
                        help="Export format (default: txt)")
    parser.add_argument("--languages", "-l", default="en",
                        help="Comma-separated preferred languages (default: en)")
    parser.add_argument("--translate", "-t", help="Translate transcript into target language code (e.g., es, de, fr)")
    parser.add_argument("--output", "-o", help="Output file path (for single video)")
    parser.add_argument("--output-dir", "-d", default="./transcripts", help="Output directory for batch downloads")
    parser.add_argument("--list-languages", action="store_true", help="List available languages for the video and exit")
    parser.add_argument("--check-update", action="store_true", help="Check if upstream youtube-transcript-api has an update")
    parser.add_argument("--upgrade", action="store_true", help="Upgrade youtube-transcript-api to latest version")

    args = parser.parse_args()

    # Handle update check
    if args.check_update:
        print(f"Current youtube-transcript-api: {updater.get_current_version()}")
        info = updater.check_latest_pypi_version()
        print(f"Latest on PyPI: {info.get('latest_version')}")
        if info.get("update_available"):
            print("🚀 Update available! Run: python cli.py --upgrade")
        else:
            print("✅ Up to date with latest release.")
        return

    # Handle upgrade
    if args.upgrade:
        print("Upgrading youtube-transcript-api...")
        res = updater.upgrade_from_pypi()
        print(res.get("message") if res.get("success") else res.get("details"))
        return

    # Handle batch processing
    if args.batch:
        batch_file = Path(args.batch)
        if not batch_file.exists():
            print(f"Error: Batch file '{args.batch}' not found.", file=sys.stderr)
            sys.exit(1)

        out_dir = Path(args.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        with open(batch_file, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip() and not line.startswith("#")]

        print(f"Processing {len(lines)} videos from {args.batch}...")
        languages = [l.strip() for l in args.languages.split(",") if l.strip()]

        for i, item in enumerate(lines, 1):
            vid = extract_video_id(item)
            if not vid:
                print(f"[{i}/{len(lines)}] Skipping invalid entry: {item}")
                continue
            print(f"[{i}/{len(lines)}] Scraping {vid}...")
            try:
                fetched, snippets = fetch_transcript_for_video(vid, languages=languages, translate_to=args.translate)
                ext = args.format
                out_path = out_dir / f"{vid}.{ext}"

                if args.format == "txt":
                    content = TextFormatter().format_transcript(fetched)
                elif args.format == "srt":
                    content = SRTFormatter().format_transcript(fetched)
                elif args.format == "vtt":
                    content = WebVTTFormatter().format_transcript(fetched)
                elif args.format == "json":
                    import json
                    content = json.dumps({"video_id": vid, "snippets": snippets}, indent=2)
                elif args.format == "md":
                    content = format_markdown(snippets, vid)

                out_path.write_text(content, encoding="utf-8")
                print(f"    Saved: {out_path}")
            except Exception as e:
                print(f"    Failed ({vid}): {e}")

        print(f"\nDone! All transcripts saved to: {out_dir.resolve()}")
        return

    # Handle single video
    if not args.url:
        parser.print_help()
        sys.exit(1)

    video_id = extract_video_id(args.url)
    if not video_id:
        print(f"Error: Could not extract valid Video ID from: {args.url}", file=sys.stderr)
        sys.exit(1)

    # List languages
    if args.list_languages:
        ytt = YouTubeTranscriptApi()
        try:
            tl = ytt.list(video_id)
            print(f"Available transcripts for video '{video_id}':\n")
            for t in tl:
                tag = "[Auto-Generated]" if t.is_generated else "[Manual]"
                print(f" - {t.language} ({t.language_code}) {tag}")
            return
        except Exception as e:
            print(f"Error listing languages: {e}", file=sys.stderr)
            sys.exit(1)

    languages = [l.strip() for l in args.languages.split(",") if l.strip()]

    try:
        print(f"Scraping transcript for video: {video_id} ...")
        fetched, snippets = fetch_transcript_for_video(video_id, languages=languages, translate_to=args.translate)

        if args.format == "txt":
            content = TextFormatter().format_transcript(fetched)
        elif args.format == "srt":
            content = SRTFormatter().format_transcript(fetched)
        elif args.format == "vtt":
            content = WebVTTFormatter().format_transcript(fetched)
        elif args.format == "json":
            import json
            content = json.dumps({"video_id": video_id, "snippets": snippets}, indent=2)
        elif args.format == "md":
            content = format_markdown(snippets, video_id)

        if args.output:
            out_file = Path(args.output)
            out_file.parent.mkdir(parents=True, exist_ok=True)
            out_file.write_text(content, encoding="utf-8")
            print(f"Successfully saved transcript ({len(snippets)} lines) to: {out_file.resolve()}")
        else:
            # Print to stdout
            print(content)

    except TranscriptsDisabled:
        print("Error: Transcripts/subtitles are disabled for this video.", file=sys.stderr)
        sys.exit(1)
    except NoTranscriptFound:
        print("Error: No transcript found for the requested language.", file=sys.stderr)
        sys.exit(1)
    except VideoUnavailable:
        print("Error: Video is unavailable, private, or does not exist.", file=sys.stderr)
        sys.exit(1)
    except (IpBlocked, RequestBlocked):
        print("Error: YouTube rate-limited this IP. Use the Chrome Extension In-Browser mode.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

