@echo off
title YouTube Transcript Scraper API Server
cd /d "%~dp0"

echo ========================================================
echo       YouTube Transcript Scraper - API Server
echo ========================================================
echo.

IF EXIST "..\.venv\Scripts\python.exe" (
    set "PYTHON_EXE=..\.venv\Scripts\python.exe"
) ELSE (
    set "PYTHON_EXE=python"
)

echo Using Python: %PYTHON_EXE%
echo Checking / Upgrading dependencies...
%PYTHON_EXE% updater.py
echo.
echo Starting Flask API Server on http://127.0.0.1:5000...
%PYTHON_EXE% app.py

pause

