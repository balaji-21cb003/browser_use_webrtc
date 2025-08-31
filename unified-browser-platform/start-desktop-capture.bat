@echo off
REM Desktop Capture Startup Script for Windows
REM This script sets up the environment and starts the desktop capture service

echo 🚀 Starting Desktop Capture Service...

REM Set environment variables for desktop capture
set BROWSER_HEADLESS=false
set CAPTURE_FPS=10
set CAPTURE_QUALITY=90
set BROWSER_WIDTH=1920
set BROWSER_HEIGHT=1280
set LOG_LEVEL=info

REM Set Chrome path for Windows
set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe

REM Check if Chrome exists
if not exist "%CHROME_PATH%" (
    echo ⚠️  Chrome not found at %CHROME_PATH%
    echo 🔍 Searching for Chrome...
    
    REM Try alternative paths
    if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
        set CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
        echo ✅ Found Chrome at: %CHROME_PATH%
    ) else (
        echo ❌ Chrome not found. Please install it first.
        pause
        exit /b 1
    )
)

REM Create logs directory if it doesn't exist
if not exist "logs" mkdir logs

echo 📋 Environment Configuration:
echo    BROWSER_HEADLESS: %BROWSER_HEADLESS%
echo    CAPTURE_FPS: %CAPTURE_FPS%
echo    CAPTURE_QUALITY: %CAPTURE_QUALITY%
echo    BROWSER_WIDTH: %BROWSER_WIDTH%
echo    BROWSER_HEIGHT: %BROWSER_HEIGHT%
echo    CHROME_PATH: %CHROME_PATH%
echo    LOG_LEVEL: %LOG_LEVEL%

echo.
echo 🧪 To test desktop capture, run:
echo    node test-desktop-capture.js
echo.
echo 🌐 To start the full service, run:
echo    node src/server.js
echo.
echo 📖 For more information, see: DESKTOP_CAPTURE_README.md
echo.

REM Test if Node.js is available
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)

echo ✅ Environment setup complete!
echo 🎯 Ready to test desktop capture functionality!
echo.
pause




