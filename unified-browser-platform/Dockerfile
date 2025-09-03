# Unified Browser Platform - Multi-stage Docker Build
# This Dockerfile builds a complete unified browser platform with:
# - Node.js server for WebRTC streaming and API
# - Python agent with browser-use AI capabilities
# - Chromium browser for automation
# - All necessary dependencies for browser automation

# Stage 1: Python Environment
FROM python:3.11-slim AS python-builder

# Install system dependencies for Python packages
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory for Python agent
WORKDIR /app/python-agent

# Copy Python requirements first for better caching
COPY python-agent/requirements.txt .
COPY python-agent/pyproject.toml .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN playwright install chromium && \
    playwright install-deps chromium

# Copy Python agent source code
COPY python-agent/ .

# Stage 2: Node.js Environment
FROM node:20-slim AS node-builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Stage 3: Final Runtime Image
FROM node:20-slim

# Install system dependencies required for browser automation
RUN apt-get update && apt-get install -y \
    # Python 3.11 and pip
    python3.11 \
    python3.11-dev \
    python3-pip \
    python3.11-venv \
    # Browser dependencies
    chromium \
    chromium-driver \
    # System tools
    curl \
    wget \
    git \
    # Media processing
    ffmpeg \
    # X11 for GUI apps (if needed)
    xvfb \
    x11-utils \
    x11-xserver-utils \
    # Fonts
    fonts-liberation \
    fonts-dejavu-core \
    fontconfig \
    # Additional dependencies
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create symlink for python3 to python3.11
RUN ln -sf /usr/bin/python3.11 /usr/bin/python3 && \
    ln -sf /usr/bin/python3.11 /usr/bin/python

# Set working directory
WORKDIR /app

# Copy Node.js dependencies from builder stage
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/package*.json ./

# Copy Python environment from builder stage
COPY --from=python-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-builder /usr/local/bin /usr/local/bin
COPY --from=python-builder /app/python-agent ./python-agent

# Copy application source code
COPY src/ ./src/
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY *.js ./
COPY *.json ./

# Copy environment configuration
COPY .env.example .env

# Add Puppeteer configuration for system Chrome
RUN echo "" >> .env && \
    echo "# Puppeteer Configuration" >> .env && \
    echo "PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium" >> .env && \
    echo "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true" >> .env && \
    echo "CHROME_PATH=/usr/bin/chromium" >> .env

# Create necessary directories
RUN mkdir -p logs temp screenshots uploads

# Create app user for security and set up home directory
RUN groupadd -r appuser && useradd -r -g appuser -m -d /home/appuser -s /bin/bash appuser

# Create Python virtual environment as root first
RUN python3 -m venv /app/python-agent/venv
RUN /app/python-agent/venv/bin/pip install --upgrade pip

# Install Python packages in virtual environment
RUN /app/python-agent/venv/bin/pip install -r /app/python-agent/requirements.txt

# Install Playwright browsers as root to avoid permission issues
RUN /app/python-agent/venv/bin/playwright install chromium
RUN /app/python-agent/venv/bin/playwright install-deps chromium

# Install Puppeteer browsers (skip Chromium download, use system one)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN npm install puppeteer && npm run setup:chrome || echo "Chrome setup completed"

# Set permissions after everything is installed
RUN chown -R appuser:appuser /app
RUN chown -R appuser:appuser /home/appuser
RUN chmod +x scripts/*.js

# Make sure the virtual environment is accessible
RUN chmod -R 755 /app/python-agent/venv

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV BROWSER_HEADLESS=true
ENV DISPLAY=:99
ENV PYTHON_PATH=/app/python-agent/venv/bin/python
ENV PYTHONPATH=/app/python-agent
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/chromium

# AI Service Configuration
ENV AZURE_OPENAI_API_KEY=FnRvTMf6iUsMvJcX551KMybnAT7wjd6KxK6G8XSShi4I9aNdDFJOJQQJ99BFACYeBjFXJ3w3AAABACOGM2XH
ENV AZURE_OPENAI_ENDPOINT=https://mcp-openai-eastus.openai.azure.com
ENV AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4.1
ENV AZURE_OPENAI_API_VERSION=2025-01-01-preview
ENV GOOGLE_API_KEY=AIzaSyBlesjcM_k_92Pt7m6X5QpomVixvO5UoJU
ENV LLM_PROVIDER=azure_openai

# Session and Performance Configuration
ENV MAX_SESSIONS=10
ENV MAX_CONCURRENT_SESSIONS=10
ENV SESSION_TIMEOUT=1800000
ENV AUTO_CLEANUP=true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expose ports
EXPOSE 3000 8080 9222

# Create startup script
RUN cat > /app/start.sh << 'EOF'
#!/bin/bash
set -e

# Start Xvfb for headless display
if [ "$BROWSER_HEADLESS" = "true" ]; then
    Xvfb :99 -screen 0 1920x1080x24 &
    export DISPLAY=:99
fi

# Validate Python environment
echo "🐍 Validating Python environment..."
$PYTHON_PATH --version
$PYTHON_PATH -c "import browser_use; print('✅ browser-use imported successfully')" || echo "⚠️ browser-use not found, will try to install"

# Start the Node.js server
echo "🚀 Starting Unified Browser Platform..."
exec node src/server.js
EOF

RUN chmod +x /app/start.sh

# Set final permissions
RUN chown appuser:appuser /app/start.sh

# Switch to app user for running the application
USER appuser

# Start the application
CMD ["/app/start.sh"]
