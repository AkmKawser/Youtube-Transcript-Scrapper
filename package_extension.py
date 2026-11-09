"""
Package the Chrome Extension into a distribution zip file.
Usage: python package_extension.py
"""

import os
import zipfile
from pathlib import Path


def package_extension():
    project_root = Path(__file__).parent.resolve()
    extension_dir = project_root / "extension"
    release_dir = project_root / "dist"
    release_dir.mkdir(exist_ok=True)

    zip_path = release_dir / "youtube-transcript-scraper-extension.zip"

    print(f"📦 Packaging extension from: {extension_dir}")
    file_count = 0

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for file in extension_dir.rglob("*"):
            if file.is_file():
                arcname = file.relative_to(extension_dir)
                zipf.write(file, arcname)
                print(f"  + Added: {arcname}")
                file_count += 1

    print(f"\n✅ Packaged {file_count} files successfully!")
    print(f"📁 Zip file ready: {zip_path}")
    print(f"Size: {zip_path.stat().st_size / 1024:.2f} KB")


if __name__ == "__main__":
    package_extension()

