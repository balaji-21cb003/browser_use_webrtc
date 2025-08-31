# 🎯 OS-Level Capture Configuration Guide

## **Quick Setup - Show Only Browser Window**

To show **ONLY the Chrome browser window** instead of the full desktop:

### **Method 1: Edit JSON Config (Recommended)**

Edit `capture-settings.json`:

```json
{
  "os_capture_mode": "browser_only"
}
```

### **Method 2: Environment Variables**

Set environment variable:

```bash
OS_CAPTURE_MODE=browser_only
```

### **Method 3: API Request**

Send with your API call:

```json
{
  "sessionId": "your-session-id",
  "task": "your-task",
  "options": {
    "llmModel": "gpt-4.1",
    "maxSteps": 20,
    "captureMode": "browser_only"
  }
}
```

## **🎬 Available Capture Modes**

| Mode            | Description             | What You'll See                |
| --------------- | ----------------------- | ------------------------------ |
| `full_screen`   | Entire desktop          | All apps, taskbar, everything  |
| `browser_only`  | **Chrome browser only** | **Just the browser window** 🎯 |
| `custom_region` | Specific screen area    | Custom defined region          |
| `smart_browser` | Auto-detect browser     | Intelligent browser detection  |

## **🔧 Configuration Options**

### **Browser Detection Settings**

```json
{
  "browser_detection": {
    "enabled": true,
    "method": "process_list",
    "chrome_process_name": "chrome.exe",
    "fallback_to_full_screen": true
  }
}
```

### **Screen Region Settings**

```json
{
  "screen_regions": {
    "browser": {
      "x": 50,
      "y": 100,
      "width": 1820,
      "height": 880
    }
  }
}
```

### **Capture Quality Settings**

```json
{
  "capture_quality": {
    "fps": 1,
    "jpeg_quality": 90,
    "max_width": 1920,
    "max_height": 1080
  }
}
```

## **📱 How to Test**

1. **Set your desired mode** in `capture-settings.json`
2. **Restart the server:**
   ```bash
   npm run start:clean
   ```
3. **Make your API call** (the config will automatically apply)

## **🎯 Priority Order**

1. **API Options** (highest priority)
2. **JSON Config File**
3. **Environment Variables**
4. **Default Values** (lowest priority)

## **🚀 Examples**

### **Show Only Browser Window**

```json
{
  "os_capture_mode": "browser_only"
}
```

### **Show Full Desktop**

```json
{
  "os_capture_mode": "full_screen"
}
```

### **Show Custom Region**

```json
{
  "os_capture_mode": "custom_region",
  "screen_regions": {
    "custom": {
      "x": 100,
      "y": 100,
      "width": 800,
      "height": 600
    }
  }
}
```

## **🔍 Troubleshooting**

- **Still showing full screen?** Check the config file path and restart server
- **Browser not detected?** Ensure Chrome is running and check browser detection settings
- **Config not loading?** Check console for warnings about `capture-settings.json`

## **📝 Notes**

- Changes to config require server restart
- Browser-only mode will fallback to full screen if detection fails
- Custom regions must be within your screen resolution
- FPS affects performance - lower FPS = better performance





