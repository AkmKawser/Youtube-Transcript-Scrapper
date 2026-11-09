"""
Audio Extractor & MP3 Converter Module for YouTube Transcript Scraper.

Architecture:
- When a video has no native/auto YouTube captions (e.g. live streams, recent uploads),
  the system extracts the audio stream using yt-dlp and converts it to a standard audio.mp3
  using PyAV.
- The user can download the audio.mp3 file directly and feed it to their preferred AI agent/service.
- No heavy local Whisper models or translations needed.
"""

import os
import sys
import tempfile
from typing import Optional

import av
import yt_dlp


def get_cached_mp3_path(video_id: str) -> str:
    """Returns the path where the generated audio.mp3 is cached."""
    temp_dir = tempfile.gettempdir()
    return os.path.join(temp_dir, f"youtube_audio_{video_id}.mp3")


def download_raw_audio(video_id: str) -> Optional[str]:
    """
    Downloads raw audio stream for a YouTube video using yt-dlp.
    Returns path to downloaded raw file or None.
    """
    temp_dir = tempfile.gettempdir()
    out_template = os.path.join(temp_dir, f"yt_raw_{video_id}_%(id)s.%(ext)s")

    ydl_opts = {
        "format": "ba[ext=m4a]/ba[ext=webm]/ba/b",
        "outtmpl": out_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
    }

    url = f"https://www.youtube.com/watch?v={video_id}"

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            if os.path.exists(filename):
                return filename
        except Exception as e:
            print(f"[AudioExtractor] Download failed: {e}")
            return None
    return None


def convert_to_mp3(input_path: str, output_path: str) -> bool:
    """Converts downloaded raw audio stream into a clean MP3 file using PyAV."""
    try:
        with av.open(input_path, mode="r") as in_c, av.open(output_path, mode="w", format="mp3") as out_c:
            in_stream = in_c.streams.audio[0]
            rate = in_stream.rate or 44100
            layout = "mono" if (in_stream.layout and in_stream.layout.name in ("mono", "1")) else "stereo"
            out_stream = out_c.add_stream("mp3", rate=rate)
            out_stream.layout = layout
            out_stream.format = "s16p"
            resampler = av.AudioResampler(format="s16p", layout=layout, rate=rate)
            for frame in in_c.decode(in_stream):
                for r_frame in resampler.resample(frame):
                    for packet in out_stream.encode(r_frame):
                        out_c.mux(packet)
            for packet in out_stream.encode(None):
                out_c.mux(packet)
        return os.path.exists(output_path) and os.path.getsize(output_path) > 0
    except Exception as e:
        print(f"[AudioExtractor] Transcode error: {e}")
        return False


def extract_and_get_mp3(video_id: str) -> Optional[str]:
    """
    Ensures MP3 is created and cached for video_id. Returns the path to the MP3 file.
    """
    mp3_path = get_cached_mp3_path(video_id)
    if os.path.exists(mp3_path) and os.path.getsize(mp3_path) > 0:
        return mp3_path

    raw_audio = download_raw_audio(video_id)
    if not raw_audio:
        return None

    try:
        success = convert_to_mp3(raw_audio, mp3_path)
        if success:
            return mp3_path
    finally:
        try:
            if os.path.exists(raw_audio):
                os.remove(raw_audio)
        except Exception:
            pass
    return None
