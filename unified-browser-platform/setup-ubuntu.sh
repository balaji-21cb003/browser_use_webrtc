#!/bin/bash

# Ubuntu Server Setup Script for Browser-Use Platform
# Run this script on your Ubuntu server to fix the timeout and encoding issues

set -e

echo "🚀 Setting up Ubuntu server for Browser-Use Platform..."

# Update system
echo "📦 Updating system packages..."
sudo apt-get update

# Install locales and set UTF-8
echo "🌍 Setting up UTF-8 locale..."
sudo apt-get install -y locales
sudo locale-gen en_US.UTF-8
sudo update-locale LANG=en_US.UTF-8

# Install Chrome dependencies
echo "🔧 Installing Chrome dependencies..."
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

# Install Google Chrome
echo "🌐 Installing Google Chrome..."
if ! command -v google-chrome &> /dev/null; then
    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
    sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
    sudo apt-get update
    sudo apt-get install -y google-chrome-stable
else
    echo "✅ Google Chrome already installed"
fi

# Install Python if not present
echo "🐍 Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    sudo apt-get install -y python3 python3-pip python3-venv
fi

# Install Node.js if not present
echo "📟 Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Set system limits
echo "⚙️ Optimizing system limits..."
echo 'fs.file-max = 2097152' | sudo tee -a /etc/sysctl.conf
echo '* soft nofile 65536' | sudo tee -a /etc/security/limits.conf
echo '* hard nofile 65536' | sudo tee -a /etc/security/limits.conf
sudo sysctl -p

# Create environment variables file
echo "🔧 Setting up environment variables..."
cat > ~/.browser_use_env << 'EOF'
export PYTHONIOENCODING=utf-8
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export PYTHONUNBUFFERED=1
export CHROME_NO_SANDBOX=true
export CHROME_DISABLE_GPU=true
export CHROME_DISABLE_DEV_SHM_USAGE=true
export NODE_ENV=production
EOF

# Add to bashrc if not already present
if ! grep -q "source ~/.browser_use_env" ~/.bashrc; then
    echo "source ~/.browser_use_env" >> ~/.bashrc
fi

# Create optimized Chrome config
echo "🎯 Creating optimized Chrome configuration..."
cat > /tmp/chrome-args.json << 'EOF'
{
  "serverArgs": [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-plugins",
    "--disable-images",
    "--disable-javascript-harmony-shipping",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=TranslateUI",
    "--disable-ipc-flooding-protection",
    "--memory-pressure-off",
    "--max_old_space_size=4096",
    "--single-process",
    "--no-zygote"
  ],
  "timeouts": {
    "DOM_WATCHDOG_TIMEOUT": 60000,
    "BROWSER_WAIT_TIMEOUT": 30000,
    "ACTION_TIMEOUT": 20000,
    "PAGE_LOAD_TIMEOUT": 30000
  }
}
EOF

# Create systemd service file for the platform
echo "🔄 Creating systemd service..."
sudo tee /etc/systemd/system/browser-use-platform.service > /dev/null << EOF
[Unit]
Description=Unified Browser Platform
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/browser_use_webrtc/unified-browser-platform
Environment=NODE_ENV=production
Environment=PYTHONIOENCODING=utf-8
Environment=LANG=en_US.UTF-8
Environment=LC_ALL=en_US.UTF-8
Environment=CHROME_NO_SANDBOX=true
Environment=CHROME_DISABLE_GPU=true
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Ubuntu server setup completed!"
echo ""
echo "🔧 Next steps:"
echo "1. Source the environment: source ~/.bashrc"
echo "2. Navigate to your project: cd /path/to/unified-browser-platform"
echo "3. Install dependencies: npm install"
echo "4. Start the service: npm start"
echo ""
echo "📋 Or use systemd:"
echo "1. sudo systemctl enable browser-use-platform"
echo "2. sudo systemctl start browser-use-platform"
echo "3. sudo systemctl status browser-use-platform"
echo ""
echo "🐛 If you still experience issues, check the logs:"
echo "   sudo journalctl -u browser-use-platform -f"

source ~/.browser_use_env || true
