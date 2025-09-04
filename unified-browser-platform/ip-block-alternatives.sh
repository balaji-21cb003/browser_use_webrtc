#!/bin/bash

# Alternative Strategy for IP-Blocked Servers
# This script helps when your server IP is blocked by major platforms

echo "🚨 Alternative Strategy for Blocked Server IPs"
echo "==============================================="

# 1. Check current IP reputation
echo "🔍 Checking IP reputation..."
PUBLIC_IP=$(curl -s ifconfig.me)
echo "Current IP: $PUBLIC_IP"

# Check if IP is in blacklists
echo "🔎 Checking major blacklists..."
curl -s "https://whatismyipaddress.com/blacklist-check?ip=$PUBLIC_IP" | grep -q "blacklisted" && echo "❌ IP may be blacklisted" || echo "✅ IP appears clean"

# 2. Test connectivity to major platforms
echo ""
echo "🌐 Testing platform connectivity..."
echo "Testing Instagram..."
curl -s -I "https://www.instagram.com" | head -1
echo "Testing Google..."  
curl -s -I "https://www.google.com" | head -1
echo "Testing YouTube..."
curl -s -I "https://www.youtube.com" | head -1

# 3. Set up Tor for rotating IPs (if available)
echo ""
echo "🔄 Setting up Tor for IP rotation..."
sudo apt update
sudo apt install -y tor privoxy

# Configure Tor
sudo tee -a /etc/tor/torrc << EOF
# Browser automation configuration
SocksPort 9050
ControlPort 9051
CookieAuthentication 1
EOF

# Start Tor
sudo systemctl start tor
sudo systemctl enable tor

# 4. Configure HTTP proxy through Tor
sudo tee /etc/privoxy/config << EOF
listen-address 127.0.0.1:8118
forward-socks5 / 127.0.0.1:9050 .
EOF

sudo systemctl start privoxy
sudo systemctl enable privoxy

# 5. Test new IP through Tor
echo ""
echo "🎭 Testing Tor connection..."
curl --proxy 127.0.0.1:8118 -s ifconfig.me
echo " <- This should be different from your server IP"

# 6. Create browser launch script with proxy
cat > ~/browser_use_webrtc/unified-browser-platform/launch-with-proxy.sh << 'EOF'
#!/bin/bash
# Launch browser automation with Tor proxy

export DISPLAY=:99
export HTTP_PROXY=http://127.0.0.1:8118
export HTTPS_PROXY=http://127.0.0.1:8118

# Add proxy args to browser
export BROWSER_ARGS="--proxy-server=http://127.0.0.1:8118 --no-sandbox --disable-setuid-sandbox"

cd ~/browser_use_webrtc/unified-browser-platform
npm start
EOF

chmod +x ~/browser_use_webrtc/unified-browser-platform/launch-with-proxy.sh

# 7. Alternative: Use different cloud regions
echo ""
echo "🌍 Cloud Server Alternatives:"
echo "================================"
echo "If current server IP is blocked, consider:"
echo ""
echo "1. 🇺🇸 US Regions:"
echo "   - AWS: us-west-1 (N. California), us-east-1 (N. Virginia)"
echo "   - DigitalOcean: NYC1, SFO3"
echo "   - Google Cloud: us-central1, us-west1"
echo ""
echo "2. 🇪🇺 EU Regions:"
echo "   - AWS: eu-west-1 (Ireland), eu-central-1 (Frankfurt)"
echo "   - DigitalOcean: AMS3, LON1"
echo "   - Azure: West Europe, North Europe"
echo ""
echo "3. 🇦🇺 Asia Pacific:"
echo "   - AWS: ap-southeast-1 (Singapore), ap-northeast-1 (Tokyo)"
echo "   - DigitalOcean: SGP1"
echo ""

# 8. Create monitoring script
cat > ~/browser_use_webrtc/unified-browser-platform/monitor-blocks.sh << 'EOF'
#!/bin/bash
# Monitor for IP blocks and rate limits

echo "🔍 Monitoring for IP blocks..."
while true; do
    # Check Instagram
    IG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://www.instagram.com")
    
    # Check Google  
    GOOGLE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://www.google.com")
    
    echo "[$(date)] Instagram: $IG_STATUS, Google: $GOOGLE_STATUS"
    
    if [ "$IG_STATUS" = "429" ] || [ "$GOOGLE_STATUS" = "429" ]; then
        echo "⚠️ Rate limiting detected - consider switching IP/proxy"
    fi
    
    sleep 300  # Check every 5 minutes
done
EOF

chmod +x ~/browser_use_webrtc/unified-browser-platform/monitor-blocks.sh

echo ""
echo "✅ Alternative strategies configured!"
echo "===================================="
echo ""
echo "🎯 Next Steps:"
echo "1. Try running with Tor proxy: ~/browser_use_webrtc/unified-browser-platform/launch-with-proxy.sh"
echo "2. Monitor for blocks: ~/browser_use_webrtc/unified-browser-platform/monitor-blocks.sh"
echo "3. Consider migrating to a different server region if blocks persist"
echo ""
echo "💡 Pro Tips:"
echo "- Residential proxy services work better than datacenter IPs"
echo "- Use different user agents and browser fingerprints"
echo "- Add random delays between requests"
echo "- Try accessing platforms during different time zones"
