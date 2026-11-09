"""
Unit tests for YouTube Transcript Scraper.
Tests video ID extraction, formatting algorithms, and backend API endpoints.
"""

import unittest
import sys
import os
import json

# Add project root and backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from cli import extract_video_id, format_markdown
from backend.app import app
from backend.live_dvr import SimpleSnippet, translate_snippets_gtx
import updater


class TestVideoIdExtraction(unittest.TestCase):
    """Test URL and ID extraction from various YouTube link formats."""

    def test_standard_watch_url(self):
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        self.assertEqual(extract_video_id(url), "dQw4w9WgXcQ")

    def test_watch_url_with_parameters(self):
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&feature=shared"
        self.assertEqual(extract_video_id(url), "dQw4w9WgXcQ")

    def test_short_url(self):
        url = "https://youtu.be/dQw4w9WgXcQ"
        self.assertEqual(extract_video_id(url), "dQw4w9WgXcQ")

    def test_embed_url(self):
        url = "https://www.youtube.com/embed/dQw4w9WgXcQ"
        self.assertEqual(extract_video_id(url), "dQw4w9WgXcQ")

    def test_shorts_url(self):
        url = "https://www.youtube.com/shorts/dQw4w9WgXcQ"
        self.assertEqual(extract_video_id(url), "dQw4w9WgXcQ")

    def test_live_url(self):
        url = "https://www.youtube.com/live/dQw4w9WgXcQ"
        self.assertEqual(extract_video_id(url), "dQw4w9WgXcQ")

    def test_raw_id(self):
        raw_id = "dQw4w9WgXcQ"
        self.assertEqual(extract_video_id(raw_id), "dQw4w9WgXcQ")


class TestFormatters(unittest.TestCase):
    """Test Markdown and custom formatting output."""

    def test_format_markdown(self):
        snippets = [
            {"text": "Hello world", "start": 0.0, "duration": 2.5},
            {"text": "Testing transcripts", "start": 65.0, "duration": 3.0}
        ]
        md = format_markdown(snippets, "test1234567")
        self.assertIn("# Transcript for YouTube Video (test1234567)", md)
        self.assertIn("**[00:00]** Hello world", md)
        self.assertIn("**[01:05]** Testing transcripts", md)


class TestBackendAPI(unittest.TestCase):
    """Test Flask backend endpoints."""

    def setUp(self):
        self.client = app.test_client()

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data.get("status"), "online")
        self.assertEqual(data.get("package"), "youtube-transcript-api")
        self.assertTrue("installed_version" in data)

    def test_missing_video_id(self):
        response = self.client.get("/api/transcript")
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertIn("error", data)


class TestUpdaterModule(unittest.TestCase):
    """Test updater metadata retrieval."""

    def test_get_current_version(self):
        ver = updater.get_current_version()
        self.assertNotEqual(ver, "Not Installed")
        self.assertTrue(len(ver) > 0)


class TestLiveDvrModule(unittest.TestCase):
    """Test Live Stream DVR helper objects."""

    def test_simple_snippet(self):
        snip = SimpleSnippet("Hello Live DVR", 12.5, 3.0)
        self.assertEqual(snip.text, "Hello Live DVR")
        self.assertEqual(snip["start"], 12.5)
        self.assertEqual(snip.get("duration"), 3.0)


class TestAudioTranscriber(unittest.TestCase):
    """Test audio translation and language rules."""

    def test_translate_text_helper(self):
        from backend.audio_transcriber import translate_text
        res_en = translate_text("नमस्ते", "en")
        self.assertTrue(len(res_en) > 0)
        self.assertTrue(any(w in res_en.lower() for w in ["hi", "hello", "namaste"]))

        res_bn = translate_text("Hello world", "bn")
        self.assertTrue(any(ord(c) >= 0x0980 and ord(c) <= 0x09FF for c in res_bn))


if __name__ == "__main__":
    unittest.main()

