# PowerShell script to hide/show Windows taskbar
# Run this as Administrator for best results

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("hide", "show")]
    [string]$Action = "hide"
)

Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    public class Win32 {
        [DllImport("user32.dll")]
        public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
        
        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        
        [DllImport("user32.dll")]
        public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);
    }
"@

function Hide-Taskbar {
    Write-Host "🔽 Hiding Windows taskbar..." -ForegroundColor Yellow
    
    # Hide main taskbar
    $taskbar = [Win32]::FindWindow("Shell_TrayWnd", $null)
    if ($taskbar -ne [IntPtr]::Zero) {
        [Win32]::ShowWindow($taskbar, 0) | Out-Null
        Write-Host "✅ Main taskbar hidden" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Main taskbar not found" -ForegroundColor Yellow
    }
    
    # Hide secondary taskbar (if exists)
    $secondaryTaskbar = [Win32]::FindWindow("Shell_SecondaryTrayWnd", $null)
    if ($secondaryTaskbar -ne [IntPtr]::Zero) {
        [Win32]::ShowWindow($secondaryTaskbar, 0) | Out-Null
        Write-Host "✅ Secondary taskbar hidden" -ForegroundColor Green
    }
    
    Write-Host "🎯 Taskbar hiding completed!" -ForegroundColor Green
}

function Show-Taskbar {
    Write-Host "🔼 Showing Windows taskbar..." -ForegroundColor Yellow
    
    # Show main taskbar
    $taskbar = [Win32]::FindWindow("Shell_TrayWnd", $null)
    if ($taskbar -ne [IntPtr]::Zero) {
        [Win32]::ShowWindow($taskbar, 5) | Out-Null
        Write-Host "✅ Main taskbar shown" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Main taskbar not found" -ForegroundColor Yellow
    }
    
    # Show secondary taskbar (if exists)
    $secondaryTaskbar = [Win32]::FindWindow("Shell_SecondaryTrayWnd", $null)
    if ($secondaryTaskbar -ne [IntPtr]::Zero) {
        [Win32]::ShowWindow($secondaryTaskbar, 5) | Out-Null
        Write-Host "✅ Secondary taskbar shown" -ForegroundColor Green
    }
    
    Write-Host "🎯 Taskbar showing completed!" -ForegroundColor Green
}

# Main execution
try {
    switch ($Action.ToLower()) {
        "hide" { Hide-Taskbar }
        "show" { Show-Taskbar }
        default { 
            Write-Host "Usage: .\hide-taskbar.ps1 -Action hide|show" -ForegroundColor Cyan
            Write-Host "Examples:" -ForegroundColor Cyan
            Write-Host "  .\hide-taskbar.ps1 -Action hide    # Hide taskbar" -ForegroundColor White
            Write-Host "  .\hide-taskbar.ps1 -Action show    # Show taskbar" -ForegroundColor White
            Write-Host "  .\hide-taskbar.ps1                 # Hide taskbar (default)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Try running as Administrator if you get permission errors" -ForegroundColor Yellow
}



