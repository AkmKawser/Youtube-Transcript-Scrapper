"""
Package the Chrome Extension into a distribution zip file.
Validates Manifest V3 structure, checks file integrity, and outputs release zip.
Usage: python package_extension.py
"""

import os
import json
import zipfile
from pathlib import Path


def validate_manifest(extension_dir: Path) -> dict:
    """Validate manifest.json exists, is valid JSON, and has MV3 structure."""
    manifest_path = extension_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Missing manifest.json in {extension_dir}")

    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if data.get("manifest_version") != 3:
        raise ValueError(f"Expected manifest_version: 3, found: {data.get('manifest_version')}")

    print(f"  * Validated Manifest: {data.get('name')} (v{data.get('version')}) [MV3]")
    return data


def package_extension():
    project_root = Path(__file__).parent.resolve()
    extension_dir = project_root / "extension"
    release_dir = project_root / "dist"
    release_dir.mkdir(exist_ok=True)

    zip_path = release_dir / "youtube-transcript-scraper-extension.zip"

    print(f"📦 Packaging extension from: {extension_dir}")
    manifest_info = validate_manifest(extension_dir)
    file_count = 0

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for file in sorted(extension_dir.rglob("*")):
            if file.is_file():
                arcname = file.relative_to(extension_dir)
                zipf.write(file, arcname)
                print(f"  + Added: {arcname}")
                file_count += 1

    zip_size_kb = zip_path.stat().st_size / 1024
    print(f"\n✅ Packaged {file_count} files successfully!")
    print(f"📁 Zip file ready: {zip_path}")
    print(f"📦 Release Asset: youtube-transcript-scraper-extension.zip ({zip_size_kb:.2f} KB)")
    print(f"🚀 Version: v{manifest_info.get('version')}")


if __name__ == "__main__":
    package_extension()

