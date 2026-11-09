"""
Live Stream DVR WebVTT Caption Extractor for YouTube.
When a YouTube Live Stream finishes streaming (isPostLiveDvr=True), standard
captionTracks are often unavailable for 12-24 hours while YouTube processes the VOD.
However, the live broadcast captions are immediately available as WebVTT (text/vtt)
segments inside streamingData.dashManifestUrl.

This module extracts, deduplicates, and optionally translates those Live DVR
WebVTT segments so completed live streams work immediately.
"""

import re
from html import unescape
from concurrent.futures import ThreadPoolExecutor
import requests
from requests.adapters import HTTPAdapter


class SimpleSnippet:
    """Compatible snippet object for youtube-transcript-api formatters."""
    def __init__(self, text: str, start: float, duration: float):
        self.text = text
        self.start = start
        self.duration = duration

    def get(self, key, default=None):
        return getattr(self, key, default)

    def __getitem__(self, key):
        return getattr(self, key)


def translate_snippets_gtx(snippets: list, target_lang: str) -> list:
    """Translate a list of snippet dicts into target_lang ('bn' or 'en') via Google Translate API."""
    if not snippets or not target_lang:
        return snippets

    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )
    })
    chunk_size = 60
    translated_snippets = [dict(s) for s in snippets]

    for i in range(0, len(translated_snippets), chunk_size):
        chunk = translated_snippets[i:i + chunk_size]
        try:
            resp = session.post(
                "https://clients5.google.com/translate_a/t",
                params={
                    "client": "dict-chrome-ex",
                    "sl": "auto",
                    "tl": target_lang
                },
                data=[("q", c["text"]) for c in chunk],
                timeout=12
            )
            if resp.ok:
                data = resp.json()
                if isinstance(data, list):
                    for idx_in_chunk, item in enumerate(data):
                        if idx_in_chunk >= len(chunk):
                            break
                        if isinstance(item, list) and item and isinstance(item[0], str):
                            chunk[idx_in_chunk]["text"] = item[0].strip()
                        elif isinstance(item, str) and item.strip():
                            chunk[idx_in_chunk]["text"] = item.strip()
        except Exception:
            pass

    return translated_snippets


def extract_live_dvr_transcript(video_id: str, target_lang: str = "en") -> list:
    """
    Extract WebVTT live captions from YouTube's DASH manifest for completed live streams.
    Returns a list of dicts: [{'text': ..., 'start': ..., 'duration': ...}, ...]
    """
    session = requests.Session()
    adapter = HTTPAdapter(pool_connections=16, pool_maxsize=16, max_retries=2)
    session.mount("https://", adapter)

    watch_resp = session.get(f"https://www.youtube.com/watch?v={video_id}", timeout=10)
    m_key = re.search(r'"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"', watch_resp.text)
    if not m_key:
        return []
    api_key = m_key.group(1)

    def get_dash_vtt_info():
        resp = session.post(
            f"https://www.youtube.com/youtubei/v1/player?key={api_key}",
            json={
                "context": {"client": {"clientName": "ANDROID", "clientVersion": "20.10.38"}},
                "videoId": video_id
            },
            timeout=10
        )
        if not resp.ok:
            return None, 0, "en"
        sd = resp.json().get("streamingData", {})
        dash_url = sd.get("dashManifestUrl")
        if not dash_url:
            return None, 0, "en"
        rd = session.get(dash_url, timeout=10)
        if not rd.ok:
            return None, 0, "en"
        m_set = re.search(
            r'<AdaptationSet[^>]*mimeType="text/vtt"[^>]*lang="([^"]*)"[^>]*>(.*?)</AdaptationSet>',
            rd.text,
            re.DOTALL
        )
        if not m_set:
            m_set2 = re.search(
                r'<AdaptationSet[^>]*mimeType="text/vtt"[^>]*>(.*?)</AdaptationSet>',
                rd.text,
                re.DOTALL
            )
            if not m_set2:
                return None, 0, "en"
            track_lang = "en"
            set_xml = m_set2.group(1)
        else:
            track_lang = m_set.group(1) or "en"
            set_xml = m_set.group(2)

        m_base = re.search(r"<BaseURL>([^<]+)</BaseURL>", set_xml)
        if not m_base:
            return None, 0, track_lang
        base_url = unescape(m_base.group(1))
        segs = re.findall(r'<SegmentURL media="sq/(\d+)"/>', set_xml)
        return base_url, len(segs), track_lang

    base_url, total_segs, track_lang = get_dash_vtt_info()
    if not base_url or total_segs == 0:
        return []

    # Fetch in batches of 85 segments, refreshing player token per batch to avoid 100-request 401 limit
    raw_segments = {}
    batch_size = 85
    for start_idx in range(0, total_segs, batch_size):
        b_url = base_url if start_idx == 0 else (get_dash_vtt_info()[0] or base_url)
        end_idx = min(start_idx + batch_size, total_segs)

        def fetch_seg(i):
            for _ in range(2):
                try:
                    res = session.get(f"{b_url}sq/{i}", timeout=8)
                    if res.status_code == 200:
                        return (i, res.text)
                except Exception:
                    pass
            return (i, "")

        with ThreadPoolExecutor(max_workers=15) as ex:
            for i, txt in ex.map(fetch_seg, range(start_idx, end_idx)):
                if txt.strip():
                    raw_segments[i] = txt

    # Parse WebVTT cues and deduplicate CEA-608 roll-up lines
    snippets = []
    for seg_idx in sorted(raw_segments.keys()):
        vtt = raw_segments[seg_idx]
        m_mpegts = re.search(r"MPEGTS:(\d+)", vtt)
        seg_offset = (int(m_mpegts.group(1)) / 90000.0) if m_mpegts else (seg_idx * 5.0)

        blocks = re.split(r"\r?\n\r?\n", vtt)
        for block in blocks:
            m_time = re.search(r"(\d+):(\d+):(\d+\.\d+)\s*-->\s*(\d+):(\d+):(\d+\.\d+)", block)
            if not m_time:
                continue
            c_start = int(m_time.group(1)) * 3600 + int(m_time.group(2)) * 60 + float(m_time.group(3))
            c_end = int(m_time.group(4)) * 3600 + int(m_time.group(5)) * 60 + float(m_time.group(6))
            lines = block.splitlines()
            ts_line_idx = next((idx for idx, l in enumerate(lines) if "-->" in l), -1)
            if ts_line_idx < 0:
                continue
            text_lines = lines[ts_line_idx + 1:]

            for tl in text_lines:
                clean_line = unescape(re.sub(r"<[^>]+>", "", tl)).strip()
                if not clean_line:
                    continue

                # Check recent 6 snippets for roll-up duplicates or progressive expansions
                recent = snippets[-6:]
                is_dup = False
                for prev in reversed(recent):
                    if clean_line == prev["text"] or prev["text"].endswith(clean_line):
                        is_dup = True
                        break
                    if clean_line.startswith(prev["text"]) and ((seg_offset + c_start) - prev["start"] < 8.0):
                        prev["text"] = clean_line
                        prev["duration"] = round(max(1.5, (seg_offset + c_end) - prev["start"]), 2)
                        is_dup = True
                        break

                if not is_dup:
                    snippets.append({
                        "text": clean_line,
                        "start": round(seg_offset + c_start, 2),
                        "duration": round(max(1.5, c_end - c_start), 2)
                    })

    # Merge tiny consecutive fragments from the same speaker within 3 seconds
    merged = []
    for item in snippets:
        if (
            merged
            and not item["text"].startswith(">>")
            and (item["start"] - merged[-1]["start"] < 4.0)
            and len(merged[-1]["text"]) < 80
        ):
            merged[-1]["text"] = f"{merged[-1]['text']} {item['text']}".strip()
            merged[-1]["duration"] = round(
                max(merged[-1]["duration"], (item["start"] + item["duration"]) - merged[-1]["start"]), 2
            )
        else:
            merged.append(item)

    if target_lang and not track_lang.startswith(target_lang):
        merged = translate_snippets_gtx(merged, target_lang)

    return merged

