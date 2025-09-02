#!/bin/bash
# Linux Cloud Server Startup Script for Unified Browser Platform

echo "🚀 Starting Unified Browser Platform for Linux Cloud Server..."

# Check if running as root (not recommended for security)
if [ "$EUID" -eq 0 ]; then
  echo "⚠️  WARNING: Running as root. Consider using a non-root user for security."
fi

# Check Chrome installation
if ! command -v google-chrome &> /dev/null; then
    echo "❌ Google Chrome not found. Installing..."
    
    # Install Chrome dependencies
    sudo apt-get update
    sudo apt-get install -y \
        wget \
        gnupg \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        curl \
        lsb-release
    
    # Add Google Chrome repository
    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
    
    # Install Chrome
    sudo apt-get update
    sudo apt-get install -y google-chrome-stable
    
    echo "✅ Google Chrome installed successfully"
else
    echo "✅ Google Chrome found: $(google-chrome --version)"
fi

# Check Node.js version
NODE_VERSION=$(node --version 2>/dev/null || echo "not installed")
echo "📦 Node.js version: $NODE_VERSION"

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ before running this script."
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 --version 2>/dev/null || echo "not installed")
echo "🐍 Python version: $PYTHON_VERSION"

if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 not found. Please install Python 3.8+ before running this script."
    exit 1
fi

# Set environment variables for cloud deployment
export BROWSER_HEADLESS=true
export CHROME_PATH=/usr/bin/google-chrome
export NODE_OPTIONS="--max-old-space-size=4096"
export BROWSER_TIMEOUT=120000
export PROTOCOL_TIMEOUT=120000

# Copy Linux cloud environment configuration
if [ -f ".env.linux-cloud" ]; then
    echo "📋 Using Linux cloud environment configuration..."
    cp .env.linux-cloud .env
else
    echo "⚠️  Linux cloud environment file not found, using defaults"
fi

# Install npm dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    npm install
fi

# Setup Python environment for browser-use agent
if [ ! -d "python-agent/venv" ]; then
    echo "🐍 Setting up Python virtual environment..."
    cd python-agent
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    cd ..
    echo "✅ Python environment setup complete"
else
    echo "✅ Python virtual environment already exists"
fi

# Check available memory
TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
AVAILABLE_MEM=$(free -m | awk 'NR==2{printf "%.0f", $7}')
echo "💾 Total Memory: ${TOTAL_MEM}MB, Available: ${AVAILABLE_MEM}MB"

if [ "$AVAILABLE_MEM" -lt 2048 ]; then
    echo "⚠️  WARNING: Low available memory (${AVAILABLE_MEM}MB). Recommended: 2GB+"
    echo "🔧 Consider reducing MAX_CONCURRENT_SESSIONS or adding swap space"
fi

# Check disk space
DISK_SPACE=$(df -h . | awk 'NR==2 {print $4}')
echo "💿 Available disk space: $DISK_SPACE"

# Increase system limits for browser processes
echo "🔧 Adjusting system limits for browser processes..."
ulimit -n 65536 2>/dev/null || echo "⚠️  Could not increase file descriptor limit"
ulimit -u 32768 2>/dev/null || echo "⚠️  Could not increase process limit"

# Create necessary directories
mkdir -p logs
mkdir -p downloads
mkdir -p /tmp/chrome-user-data

# Set permissions for Chrome user data directory
chmod 755 /tmp/chrome-user-data

echo "🏁 Pre-flight checks complete. Starting Unified Browser Platform..."
echo "📊 Memory: ${AVAILABLE_MEM}MB available"
echo "💿 Disk: $DISK_SPACE available"
echo "🌐 Chrome: $(google-chrome --version)"
echo "📦 Node: $NODE_VERSION"
echo "🐍 Python: $PYTHON_VERSION"
echo ""
echo "🚀 Starting server with optimized settings for cloud deployment..."

# Start the application with cloud-optimized settings
npm start
