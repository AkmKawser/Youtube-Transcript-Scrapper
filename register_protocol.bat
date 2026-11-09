@echo off
setlocal
title Register yt-transcript Protocol Handler

cd /d "%~dp0"
set "SERVER_BAT=%~dp0backend\run_server.bat"

echo ========================================================
echo   Registering yt-transcript:// Protocol Handler
echo ========================================================
echo.
echo Target script: %SERVER_BAT%
echo.

:: Add URL Protocol to current user registry (no admin required)
reg add "HKCU\Software\Classes\yt-transcript" /ve /d "URL:YouTube Transcript Backend Protocol" /f >nul
reg add "HKCU\Software\Classes\yt-transcript" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\yt-transcript\shell" /f >nul
reg add "HKCU\Software\Classes\yt-transcript\shell\open" /f >nul
reg add "HKCU\Software\Classes\yt-transcript\shell\open\command" /ve /d "cmd.exe /c start \"\" \"%SERVER_BAT%\"" /f >nul

if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] yt-transcript:// protocol registered successfully!
    echo Clicking "Start Python AI Server" in the Chrome extension will now launch the backend.
) else (
    echo [ERROR] Failed to register protocol in registry.
)

echo.
pause

