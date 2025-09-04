#!/bin/bash

# Server Deployment and Fix Script for Browser Automation
# Run this on your Ubuntu server to apply all fixes

set -e

echo "🚀 Deploying Browser Automation Fixes to Server"
echo "================================================"

# 1. Stop existing services
echo "🛑 Stopping existing services..."
sudo pkill -f "node.*server.js" || true
sudo pkill -f "npm start" || true
sudo pkill -f "python.*browser_use_agent" || true

# 2. Update system packages for better browser support
echo "📦 Updating system packages..."
sudo apt update
sudo apt install -y \
    chromium-browser \
    xvfb \
    x11vnc \
    fluxbox \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgtk-3-0 \
    libgtk-4-1 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils

# 3. Set up virtual display for headless browser (helps with zoom issues)
echo "🖥️ Setting up virtual display..."
export DISPLAY=:99
sudo -E nohup Xvfb :99 -screen 0 1920x1080x24 > /dev/null 2>&1 &
sleep 2

# 4. Configure browser launch arguments for cloud servers
echo "🌐 Configuring browser for cloud server..."
cat > /tmp/browser-args.txt << 'EOF'
--no-sandbox
--disable-setuid-sandbox
--disable-dev-shm-usage
--disable-background-timer-throttling
--disable-renderer-backgrounding
--disable-features=VizDisplayCompositor
--disable-web-security=false
--window-size=1920,1080
--force-device-scale-factor=1.0
--user-agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
--accept-lang=en-US,en;q=0.9
--disable-blink-features=AutomationControlled
--exclude-switches=enable-automation
--disable-extensions-except=""
--disable-extensions
--disable-plugins
--disable-images=false
--timezone="America/New_York"
EOF

# 5. Set up IP rotation (if you have multiple IPs or proxy)
echo "🔄 Checking IP rotation capabilities..."
PUBLIC_IP=$(curl -s ifconfig.me)
echo "Current public IP: $PUBLIC_IP"

# 6. Configure DNS for better connectivity
echo "🌍 Configuring DNS..."
echo "nameserver 8.8.8.8" | sudo tee -a /etc/resolv.conf
echo "nameserver 1.1.1.1" | sudo tee -a /etc/resolv.conf

# 7. Optimize network settings for cloud servers
echo "⚡ Optimizing network settings..."
echo 'net.core.rmem_max = 16777216' | sudo tee -a /etc/sysctl.conf
echo 'net.core.wmem_max = 16777216' | sudo tee -a /etc/sysctl.conf
echo 'net.ipv4.tcp_rmem = 4096 87380 16777216' | sudo tee -a /etc/sysctl.conf
echo 'net.ipv4.tcp_wmem = 4096 65536 16777216' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# 8. Install/update Node.js dependencies
echo "📦 Installing Node.js dependencies..."
cd ~/browser_use_webrtc/unified-browser-platform
npm install

# 9. Install/update Python dependencies
echo "🐍 Installing Python dependencies..."
cd python-agent
pip install -r requirements.txt || pip3 install -r requirements.txt
cd ..

# 10. Apply our custom .env configuration
echo "⚙️ Applying configuration..."
# The .env file should already have our fixes, but ensure critical values
grep -q "BROWSER_PROTOCOL_TIMEOUT=120000" .env || echo "BROWSER_PROTOCOL_TIMEOUT=120000" >> .env
grep -q "CDP_TIMEOUT=120000" .env || echo "CDP_TIMEOUT=120000" >> .env
grep -q "BROWSER_USE_WATCHDOG_TIMEOUT=60000" .env || echo "BROWSER_USE_WATCHDOG_TIMEOUT=60000" >> .env

# 11. Create systemd service for auto-restart
echo "🔧 Creating systemd service..."
sudo tee /etc/systemd/system/browser-automation.service > /dev/null << EOF
[Unit]
Description=Browser Automation Service
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/browser_use_webrtc/unified-browser-platform
Environment=DISPLAY=:99
Environment=NODE_ENV=production
ExecStartPre=/bin/bash -c 'Xvfb :99 -screen 0 1920x1080x24 > /dev/null 2>&1 &'
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# 12. Enable and start the service
echo "🚀 Starting browser automation service..."
sudo systemctl daemon-reload
sudo systemctl enable browser-automation
sudo systemctl start browser-automation

# 13. Check service status
echo "📊 Checking service status..."
sudo systemctl status browser-automation --no-pager

# 14. Display useful information
echo ""
echo "✅ Deployment Complete!"
echo "======================="
echo "🌐 Service URL: http://$(curl -s ifconfig.me):3000"
echo "📊 Health Check: http://$(curl -s ifconfig.me):3000/health" 
echo "📱 Dashboard: http://$(curl -s ifconfig.me):3000"
echo ""
echo "🔧 Management Commands:"
echo "  - Check status: sudo systemctl status browser-automation"
echo "  - View logs: sudo journalctl -u browser-automation -f"
echo "  - Restart: sudo systemctl restart browser-automation"
echo "  - Stop: sudo systemctl stop browser-automation"
echo ""
echo "🚨 Important Notes:"
echo "  - If still getting IP blocks, consider using a proxy/VPN"
echo "  - For Instagram, try different server regions"
echo "  - Monitor logs for rate limiting warnings"
echo ""

# 15. Show current logs
echo "📋 Recent logs:"
sudo journalctl -u browser-automation --no-pager -n 20
