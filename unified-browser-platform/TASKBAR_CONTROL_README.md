# Windows Taskbar Control Tools

This directory contains tools to hide and show the Windows taskbar, which is useful for:

- Creating clean screenshots without taskbar interference
- Full-screen browser automation
- Professional presentation mode
- Gaming or kiosk applications

## Files

- **`hide-taskbar.ps1`** - PowerShell script with advanced taskbar control
- **`hide-taskbar.bat`** - User-friendly batch file interface
- **`browser-config.js`** - Browser configuration with taskbar hiding options

## Quick Start

### Option 1: Use the Batch File (Recommended)

1. Double-click `hide-taskbar.bat`
2. Choose option 1 to hide the taskbar
3. Choose option 2 to show the taskbar again

### Option 2: Use PowerShell Directly

```powershell
# Hide taskbar
.\hide-taskbar.ps1 -Action hide

# Show taskbar
.\hide-taskbar.ps1 -Action show
```

### Option 3: Run as Administrator (Best Results)

1. Right-click `hide-taskbar.bat`
2. Select "Run as administrator"
3. Follow the prompts

## Browser Configuration

The browser is configured to automatically hide the taskbar when possible:

```javascript
// In browser-config.js
WINDOW_MODE: "taskbar_hidden",
HIDE_TASKBAR: true,
```

Additional Chrome arguments are added:

- `--app=about:blank` - App mode to hide taskbar
- `--kiosk` - Kiosk mode for fullscreen

## Troubleshooting

### Taskbar Not Hiding

- **Run as Administrator**: Right-click and select "Run as administrator"
- **Check Windows Version**: Works best on Windows 10/11
- **Antivirus**: Some antivirus software may block the script

### Taskbar Stuck Hidden

- Use the "Show Taskbar" option
- Or restart Windows Explorer: `taskkill /f /im explorer.exe`

### Permission Errors

- Ensure PowerShell execution policy allows scripts
- Run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

## Technical Details

The script uses Windows API calls to:

1. Find the taskbar window (`Shell_TrayWnd`)
2. Find secondary taskbars (`Shell_SecondaryTrayWnd`)
3. Hide/show windows using `ShowWindow` API
4. Handle both primary and secondary monitors

## Safety Notes

- The taskbar can always be restored using the "Show" option
- If the script fails, the taskbar will remain visible
- Works with Windows 7, 8, 10, and 11
- No permanent changes are made to system settings

## Integration with Browser Automation

When using the browser automation features:

1. The taskbar is automatically hidden during capture
2. Full-screen browser windows are captured without taskbar
3. Clean, professional screenshots are generated
4. No taskbar interference in automated workflows

## Support

If you encounter issues:

1. Check that you're running as Administrator
2. Ensure PowerShell execution policy allows scripts
3. Try restarting the script
4. Check Windows Event Viewer for error details



