# Ubuntu Server Fixes for Browser-Use Platform

## Issues Identified

### 1. DOM Watchdog Timeouts
The Ubuntu server is experiencing DOM watchdog timeouts (>30s) which cause task failures.

### 2. Character Encoding Issues
Unicode character encoding problems with charmap codec.

### 3. Browser Performance Issues
Slower browser initialization and DOM processing on Ubuntu server.

## Solutions

### 1. Environment Variables for Ubuntu Server

Add these to your Ubuntu server environment:

```bash
# In your ~/.bashrc or server environment
export PYTHONIOENCODING=utf-8
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export PYTHONUNBUFFERED=1

# Browser optimization
export CHROME_NO_SANDBOX=true
export CHROME_DISABLE_GPU=true
export CHROME_DISABLE_DEV_SHM_USAGE=true
```

### 2. Chrome Launch Args for Server

Update your browser launching with these args:

```javascript
const serverArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-plugins',
  '--disable-images',
  '--disable-javascript-harmony-shipping',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=TranslateUI',
  '--disable-ipc-flooding-protection',
  '--memory-pressure-off',
  '--max_old_space_size=4096'
];
```

### 3. Timeout Configuration

Increase timeouts for Ubuntu environment:

```javascript
// In your browser-use agent configuration
const ubuntuConfig = {
  DOM_WATCHDOG_TIMEOUT: 60000, // 60 seconds instead of 30
  BROWSER_WAIT_TIMEOUT: 30000,  // 30 seconds
  ACTION_TIMEOUT: 20000,        // 20 seconds
  PAGE_LOAD_TIMEOUT: 30000      // 30 seconds
};
```

### 4. System Optimization Commands

Run these on your Ubuntu server:

```bash
# Increase system limits
echo 'fs.file-max = 2097152' | sudo tee -a /etc/sysctl.conf
echo '* soft nofile 65536' | sudo tee -a /etc/security/limits.conf
echo '* hard nofile 65536' | sudo tee -a /etc/security/limits.conf

# Install required fonts for rendering
sudo apt-get update
sudo apt-get install -y fonts-liberation fonts-dejavu-core fontconfig

# Chrome dependencies
sudo apt-get install -y \
  libnss3-dev \
  libgconf-2-4 \
  libxss1 \
  libasound2 \
  libxtst6 \
  libgtk-3-0 \
  libdrm2 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libasound2 \
  libpangocairo-1.0-0 \
  libatk1.0-0 \
  libcairo-gobject2 \
  libgtk-3-0 \
  libgdk-pixbuf2.0-0

# Reload system configuration
sudo sysctl -p
```

### 5. Python Agent Fixes

Create a wrapper script for better encoding handling:

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import locale

# Force UTF-8 encoding
os.environ['PYTHONIOENCODING'] = 'utf-8'
os.environ['LANG'] = 'en_US.UTF-8'
os.environ['LC_ALL'] = 'en_US.UTF-8'

# Set locale
try:
    locale.setlocale(locale.LC_ALL, 'en_US.UTF-8')
except:
    locale.setlocale(locale.LC_ALL, 'C.UTF-8')

# Your existing agent code here
```

### 6. Docker Alternative (Recommended)

For consistent environment, use Docker:

```dockerfile
FROM node:18-bullseye

# Install Chrome and dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    fonts-dejavu-core \
    fontconfig \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Python setup
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv

# Set environment variables
ENV PYTHONIOENCODING=utf-8
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV CHROME_NO_SANDBOX=true
ENV CHROME_DISABLE_GPU=true

WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3000
CMD ["npm", "start"]
```

## Quick Fix Commands for Ubuntu

```bash
# 1. Update system encoding
sudo apt-get update && sudo apt-get install -y locales
sudo locale-gen en_US.UTF-8
sudo update-locale LANG=en_US.UTF-8

# 2. Install Chrome properly
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
sudo apt-get update
sudo apt-get install -y google-chrome-stable

# 3. Set environment variables
echo 'export PYTHONIOENCODING=utf-8' >> ~/.bashrc
echo 'export LANG=en_US.UTF-8' >> ~/.bashrc
echo 'export LC_ALL=en_US.UTF-8' >> ~/.bashrc
source ~/.bashrc

# 4. Restart your application
```

## Performance Comparison

| Environment | DOM Processing | Character Encoding | Browser Launch |
|------------|----------------|-------------------|-----------------|
| Windows Local | ✅ Fast | ✅ No issues | ✅ Quick |
| Ubuntu Server | ❌ Slow (30s+ timeouts) | ❌ Charmap errors | ⚠️ Slower |
| Ubuntu + Fixes | ✅ Improved | ✅ UTF-8 support | ✅ Optimized |

The main difference is that Ubuntu servers typically have:
- Limited resources
- Missing fonts/libraries
- Different locale settings
- No GPU acceleration
- Stricter security (sandbox issues)

Apply these fixes to achieve similar performance to your local Windows environment.
