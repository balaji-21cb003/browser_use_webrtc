#!/bin/bash

# Quick Server Setup - Just for npm start
# Copy this file to your server and run it before npm start

echo "🚀 Quick Browser Automation Setup"
echo "================================="

# 1. Install essential packages for browser
echo "📦 Installing essential packages..."
sudo apt update
sudo apt install -y \
    chromium-browser \
    xvfb \
    fonts-liberation \
    libnss3 \
    libgtk-3-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2

# 2. Set up virtual display (fixes zoom issues)
echo "🖥️ Setting up virtual display..."
export DISPLAY=:99
sudo pkill Xvfb || true
sudo nohup Xvfb :99 -screen 0 1920x1080x24 > /dev/null 2>&1 &
sleep 2

# 3. Set environment for this session
echo "⚙️ Setting environment..."
export DISPLAY=:99
export NODE_ENV=production

# 4. Install Node.js dependencies
echo "📦 Installing dependencies..."
npm install

# 5. Install Python dependencies
echo "🐍 Installing Python dependencies..."
cd python-agent
pip install -r requirements.txt || pip3 install -r requirements.txt
cd ..

echo ""
echo "✅ Setup complete! Now you can run:"
echo "npm start"
echo ""
echo "🌐 Your server will be available at:"
echo "http://$(curl -s ifconfig.me || echo 'YOUR_SERVER_IP'):3000"
