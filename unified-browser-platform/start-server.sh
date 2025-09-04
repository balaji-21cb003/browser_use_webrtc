#!/bin/bash

# Simple startup script - sets environment and runs npm start
# Usage: ./start-server.sh

echo "🚀 Starting Browser Automation Server"
echo "====================================="

# Set up environment
export DISPLAY=:99
export NODE_ENV=production

# Check if Xvfb is running (for display)
if ! pgrep -f "Xvfb :99" > /dev/null; then
    echo "🖥️ Starting virtual display..."
    sudo nohup Xvfb :99 -screen 0 1920x1080x24 > /dev/null 2>&1 &
    sleep 2
fi

# Show current configuration
echo "📋 Configuration:"
echo "  - Display: $DISPLAY"
echo "  - Environment: $NODE_ENV"
echo "  - Working Directory: $(pwd)"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️ Warning: .env file not found"
    echo "Make sure your .env file has the timeout configurations"
fi

echo "🚀 Starting with npm..."
echo "Server will be available at: http://$(curl -s ifconfig.me || echo 'YOUR_IP'):3000"
echo ""

# Start the server
npm start
