# Fix Ubuntu Server Permissions and Setup

## Issue
The setup script is owned by root and doesn't have execute permissions:
```
-rw-r--r-- 1 root root 4715 Sep  1 18:35 setup-ubuntu.sh
```

## Solutions

### Option 1: Fix Permissions and Run Script
```bash
# Change ownership to ubuntu user
sudo chown ubuntu:ubuntu setup-ubuntu.sh

# Add execute permissions
sudo chmod +x setup-ubuntu.sh

# Run the script
./setup-ubuntu.sh
```

### Option 2: Run Commands Manually (Recommended)
If you can't modify permissions, run these commands manually:

```bash
# 1. Update system
sudo apt-get update

# 2. Install locales and set UTF-8
sudo apt-get install -y locales
sudo locale-gen en_US.UTF-8
sudo update-locale LANG=en_US.UTF-8

# 3. Install Chrome dependencies
sudo apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    fonts-dejavu-core \
    fontconfig \
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
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgdk-pixbuf2.0-0

# 4. Install Google Chrome
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
sudo apt-get update
sudo apt-get install -y google-chrome-stable

# 5. Set system limits
echo 'fs.file-max = 2097152' | sudo tee -a /etc/sysctl.conf
echo '* soft nofile 65536' | sudo tee -a /etc/security/limits.conf
echo '* hard nofile 65536' | sudo tee -a /etc/security/limits.conf
sudo sysctl -p

# 6. Set environment variables
cat >> ~/.bashrc << 'EOF'
export PYTHONIOENCODING=utf-8
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export PYTHONUNBUFFERED=1
export CHROME_NO_SANDBOX=true
export CHROME_DISABLE_GPU=true
export CHROME_DISABLE_DEV_SHM_USAGE=true
export NODE_ENV=production
EOF

# 7. Source the environment
source ~/.bashrc
```

### Option 3: Run with Bash Directly
```bash
# Run the script with bash without execute permissions
sudo bash setup-ubuntu.sh
```

### Option 4: Quick Fix Commands Only
If you just want to fix the immediate browser issues:

```bash
# Set environment variables for current session
export PYTHONIOENCODING=utf-8
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export CHROME_NO_SANDBOX=true
export CHROME_DISABLE_GPU=true

# Install essential packages
sudo apt-get update
sudo apt-get install -y fonts-liberation fonts-dejavu-core fontconfig

# Install Chrome if not present
if ! command -v google-chrome &> /dev/null; then
    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
    sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
    sudo apt-get update
    sudo apt-get install -y google-chrome-stable
fi

# Restart your Node.js application
```

## Test the Fix

After running any of the above options, test your application:

```bash
# Check Chrome installation
google-chrome --version

# Check environment variables
echo $PYTHONIOENCODING
echo $LANG

# Restart your application
cd ~/browser_use_webrtc/unified-browser-platform
npm start
```

## Expected Result

You should see:
- No more DOM watchdog timeouts
- No more character encoding errors
- Successful task completion like your Windows environment

Choose **Option 2 (Manual Commands)** if you want to be safe and avoid permission issues.
