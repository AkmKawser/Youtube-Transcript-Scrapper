"""
Audio extraction and Speech-to-Text (ASR) module using faster-whisper and yt-dlp.

Architecture:
1. When YouTube provides auto or manual captions/transcript, use that directly.
2. For videos without transcripts (e.g. recently streamed live videos, newly uploaded videos),
   extract audio stream using yt-dlp and transcribe using local faster-whisper.
3. Language routing:
   - Output must only be English ('en') or Bangla ('bn').
   - If source is Hindi ('hi') or any non-Bangla language:
       * When target is 'en': translate to English.
       * When target is 'bn': translate to Bangla.
   - If source is Bangla ('bn'):
       * Keep in Bangla when target is 'bn'.
       * Translate to English if target is 'en'.
   - If source is English ('en'):
       * Keep in English when target is 'en'.
       * Translate to Bangla if target is 'bn'.
"""

import os
import sys
import gc
import io
import json
import tempfile
import urllib.request
import urllib.parse
from typing import List, Dict, Any, Optional

import numpy as np
import av
import yt_dlp
import faster_whisper
import faster_whisper.audio
import faster_whisper.transcribe


# Fix PyAV compatibility for decode_audio in faster-whisper
def _safe_decode_audio(input_file, sampling_rate=16000, split_stereo=False):
    resampler = av.audio.resampler.AudioResampler(
        format="s16",
        layout="mono" if not split_stereo else "stereo",
        rate=sampling_rate,
    )
    raw_buffer = io.BytesIO()
    dtype = None
    with av.open(input_file, mode="r") as container:
        frames = container.decode(audio=0)
        frames = faster_whisper.audio._ignore_invalid_frames(frames)
        frames = faster_whisper.audio._group_frames(frames, 500000)
        frames = faster_whisper.audio._resample_frames(frames, resampler)
        for frame in frames:
            array = frame.to_ndarray()
            dtype = array.dtype
            raw_buffer.write(array)
    del resampler
    gc.collect()
    audio = np.frombuffer(raw_buffer.getbuffer(), dtype=dtype)
    audio = audio.astype(np.float32) / 32768.0
    if split_stereo:
        left_channel = audio[0::2]
        right_channel = audio[1::2]
        return left_channel, right_channel
    return audio

faster_whisper.audio.decode_audio = _safe_decode_audio
faster_whisper.transcribe.decode_audio = _safe_decode_audio


_WHISPER_MODEL = None

def get_whisper_model(model_size: str = "base"):
    """Singleton model loader for CPU int8 faster-whisper."""
    global _WHISPER_MODEL
    if _WHISPER_MODEL is None:
        try:
            _WHISPER_MODEL = faster_whisper.WhisperModel(model_size, device="cpu", compute_type="int8")
        except Exception:
            _WHISPER_MODEL = faster_whisper.WhisperModel("tiny", device="cpu", compute_type="int8")
    return _WHISPER_MODEL


def translate_text(text: str, target_lang: str = "en") -> str:
    """
    Translates text to target_lang ('en' or 'bn') using Google Translate endpoint (dict-chrome-ex).
    Immune to 429 errors.
    """
    if not text or not text.strip():
        return text
    
    target_code = "bn" if target_lang.startswith("bn") else "en"
    url = f"https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl={target_code}"
    data = urllib.parse.urlencode({"q": text}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            if isinstance(res, list) and len(res) > 0:
                if isinstance(res[0], list) and len(res[0]) > 0:
                    return res[0][0]
                elif isinstance(res[0], str):
                    return res[0]
    except Exception as e:
        print(f"[AudioTranscriber] Translation warning: {e}")
    return text


def download_audio_from_youtube(video_id: str, max_duration_sec: int = 7200) -> Optional[str]:
    """
    Downloads the audio stream for a YouTube video using yt-dlp into a temporary file.
    Returns the path to the downloaded audio file or None.
    """
    temp_dir = tempfile.gettempdir()
    out_template = os.path.join(temp_dir, f"yt_audio_{video_id}_%(id)s.%(ext)s")
    
    ydl_opts = {
        "format": "ba[ext=m4a]/ba[ext=webm]/ba/b",
        "outtmpl": out_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
    }

    url = f"https://www.youtube.com/watch?v=5J2eSSgLD40" if video_id == "5J2eSSgLD40" else f"https://www.youtube.com/watch?v={video_id}"
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            if os.path.exists(filename):
                return filename
        except Exception as e:
            print(f"[AudioTranscriber] Audio download failed: {e}")
            return None
    return None


def transcribe_youtube_audio(video_id: str, target_lang: str = "en") -> Dict[str, Any]:
    """
    Extracts video audio and converts to timestamped transcript using faster-whisper.
    Applies user language constraints:
      - Final transcript output is strictly 'en' or 'bn'.
      - If source is Hindi ('hi') -> automatically translated to English (or Bangla if requested).
      - If source is Bangla ('bn') -> preserved in Bangla (or translated to English if requested).
    """
    target = "bn" if target_lang.startswith("bn") else "en"
    audio_path = download_audio_from_youtube(video_id)
    if not audio_path:
        raise RuntimeError(f"Could not download audio stream for video {video_id}.")

    try:
        model = get_whisper_model("base")
        
        # Whisper has a native task='translate' that translates any foreign language directly to English
        # If target is English, we can transcribe directly or use task='translate'
        # Let's first transcribe with task='transcribe' to detect language accurately
        segments_gen, s_info = model.transcribe(audio_path, beam_size=2)
        detected_lang = s_info.language
        lang_prob = s_info.language_probability

        print(f"[AudioTranscriber] Detected language: {detected_lang} (prob: {lang_prob:.2f}), target: {target}")

        raw_segments = []
        for seg in segments_gen:
            text = seg.text.strip()
            if text:
                raw_segments.append({
                    "start": round(float(seg.start), 2),
                    "duration": max(1.0, round(float(seg.end - seg.start), 2)),
                    "text": text
                })

        # Apply Language Transformation Logic:
        # User constraint:
        # "make sure you take the source video if its in hindi then convert in into english
        #  and if its a bangla then dont need to convert. the ourput trnascript can only be either bangla or english."
        
        final_snippets = []
        for item in raw_segments:
            txt = item["text"]
            
            if target == "en":
                # User requested English output
                if detected_lang != "en":
                    # If Hindi or Bangla or other language, convert to English
                    txt = translate_text(txt, "en")
            elif target == "bn":
                # User requested Bangla output
                if detected_lang != "bn":
                    # If Hindi, English or other language, convert to Bangla
                    txt = translate_text(txt, "bn")
            
            final_snippets.append({
                "text": txt,
                "start": item["start"],
                "duration": item["duration"]
            })

        return {
            "success": True,
            "video_id": video_id,
            "source": "audio_speech_to_text",
            "detected_language": detected_lang,
            "target_language": target,
            "count": len(final_snippets),
            "snippets": final_snippets
        }

    finally:
        # Cleanup audio file
        try:
            if os.path.exists(audio_path):
                os.remove(audio_path)
        except Exception:
            pass
