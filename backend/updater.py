"""
Updater module for youtube-transcript-api.
Enables checking for upstream updates and automatically upgrading the package
so your Chrome extension and backend always stay synchronized with the latest
jdepoix/youtube-transcript-api changes.
"""

import sys
import subprocess
import json
from importlib.metadata import version, PackageNotFoundError
import requests

PACKAGE_NAME = "youtube-transcript-api"
GITHUB_REPO = "jdepoix/youtube-transcript-api"
PYPI_URL = f"https://pypi.org/pypi/{PACKAGE_NAME}/json"


def get_current_version() -> str:
    """Return currently installed version of youtube-transcript-api."""
    try:
        return version(PACKAGE_NAME)
    except PackageNotFoundError:
        return "Not Installed"


def check_latest_pypi_version() -> dict:
    """Check PyPI for the newest published release."""
    current = get_current_version()
    try:
        resp = requests.get(PYPI_URL, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            latest = data.get("info", {}).get("version", "Unknown")
            is_update_available = (current != "Not Installed" and current != latest and latest != "Unknown")
            return {
                "success": True,
                "current_version": current,
                "latest_version": latest,
                "update_available": is_update_available,
                "pypi_url": f"https://pypi.org/project/{PACKAGE_NAME}/",
                "github_url": f"https://github.com/{GITHUB_REPO}"
            }
        return {
            "success": False,
            "current_version": current,
            "error": f"PyPI responded with status {resp.status_code}"
        }
    except Exception as e:
        return {
            "success": False,
            "current_version": current,
            "error": str(e)
        }


def upgrade_from_pypi() -> dict:
    """Upgrade youtube-transcript-api to latest PyPI version."""
    python_exe = sys.executable
    cmd = [python_exe, "-m", "pip", "install", "--upgrade", PACKAGE_NAME]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        new_version = get_current_version()
        return {
            "success": True,
            "message": f"Successfully updated to version {new_version}",
            "new_version": new_version,
            "stdout": result.stdout
        }
    except subprocess.CalledProcessError as e:
        return {
            "success": False,
            "error": "Upgrade failed",
            "details": e.stderr or e.stdout
        }


def upgrade_from_github() -> dict:
    """Upgrade youtube-transcript-api directly from the latest master branch on GitHub."""
    python_exe = sys.executable
    git_url = f"git+https://github.com/{GITHUB_REPO}.git"
    cmd = [python_exe, "-m", "pip", "install", "--upgrade", git_url]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        new_version = get_current_version()
        return {
            "success": True,
            "message": f"Successfully upgraded directly from GitHub ({new_version})",
            "new_version": new_version,
            "stdout": result.stdout
        }
    except subprocess.CalledProcessError as e:
        return {
            "success": False,
            "error": "GitHub upgrade failed (ensure git is installed)",
            "details": e.stderr or e.stdout
        }


if __name__ == "__main__":
    print(f"=== {PACKAGE_NAME} Update Manager ===")
    info = check_latest_pypi_version()
    print(f"Installed Version: {info.get('current_version')}")
    if info.get("success"):
        print(f"Latest Version on PyPI: {info.get('latest_version')}")
        if info.get("update_available"):
            print("🚀 An update is available! Upgrading now...")
            res = upgrade_from_pypi()
            print(res.get("message") if res.get("success") else res.get("details"))
        else:
            print("✅ You are using the latest version!")
    else:
        print(f"Could not check PyPI: {info.get('error')}")

