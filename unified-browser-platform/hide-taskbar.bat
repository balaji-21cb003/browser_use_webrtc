@echo off
echo ========================================
echo    Windows Taskbar Control Tool
echo ========================================
echo.
echo Choose an option:
echo 1. Hide Taskbar
echo 2. Show Taskbar
echo 3. Exit
echo.
set /p choice="Enter your choice (1-3): "

if "%choice%"=="1" (
    echo.
    echo 🔽 Hiding Windows taskbar...
    powershell -ExecutionPolicy Bypass -File "%~dp0hide-taskbar.ps1" -Action hide
    echo.
    echo ✅ Taskbar hidden! Press any key to continue...
    pause >nul
) else if "%choice%"=="2" (
    echo.
    echo 🔼 Showing Windows taskbar...
    powershell -ExecutionPolicy Bypass -File "%~dp0hide-taskbar.ps1" -Action show
    echo.
    echo ✅ Taskbar shown! Press any key to continue...
    pause >nul
) else if "%choice%"=="3" (
    echo.
    echo 👋 Goodbye!
    exit /b 0
) else (
    echo.
    echo ❌ Invalid choice. Please select 1, 2, or 3.
    echo.
    pause
    goto :eof
)

echo.
echo 🎯 Operation completed!
echo 💡 Note: You may need to run as Administrator for best results
echo.
pause



