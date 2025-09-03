#!/bin/bash

# Unified Browser Platform - Unused Files Cleanup Script
# This script removes unused files to reduce project size and improve performance

echo "🧹 Starting cleanup of unused files..."

# Function to safely remove files/directories
safe_remove() {
    if [ -e "$1" ]; then
        echo "🗑️  Removing: $1"
        rm -rf "$1"
    else
        echo "⚠️  Not found: $1"
    fi
}

# Function to get size before cleanup
echo "📊 Calculating current project size..."
BEFORE_SIZE=$(du -sh . 2>/dev/null | cut -f1)
echo "📁 Project size before cleanup: $BEFORE_SIZE"

echo ""
echo "=== REMOVING TEMPORARY & CACHE FILES ==="

# 1. Chrome profile cache (generates at runtime)
safe_remove "tmp/"

# 2. Python cache files
safe_remove "python-agent/__pycache__/"
find . -name "*.pyc" -type f -delete 2>/dev/null
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null

# 3. Node.js cache (will be regenerated)
safe_remove "node_modules/.cache/"

echo ""
echo "=== REMOVING DEVELOPMENT & BACKUP FILES ==="

# 4. Development files
safe_remove "Dockerfile.dev"
safe_remove ".env.backup"
safe_remove "test-docker-hub.sh"

# 5. Documentation files (keep main README, remove duplicates)
safe_remove "DOCKER_README.md"         # Duplicate of DOCKER_DEPLOYMENT.md
safe_remove "DOCKER_HUB_GUIDE.md"      # Duplicate info in DEPLOYMENT_SUCCESS.md
safe_remove "QUICK_PUSH.md"            # Duplicate info in DEPLOYMENT_SUCCESS.md

echo ""
echo "=== REMOVING UNUSED CONFIG FILES ==="

# 6. Unused config files (these were for separate components, now integrated)
safe_remove "desktop-capture-config.js"  # Desktop capture not used
safe_remove "env-config.js"             # Environment handled in server.js
safe_remove "os-capture-config.js"      # OS capture not used

echo ""
echo "=== REMOVING UNUSED SERVICE FILES ==="

# 7. Unused/duplicate service files
safe_remove "src/services/enhanced-browser-use-integration.js"  # Not imported in server.js
safe_remove "src/services/centralized-browser-manager.js"      # Not imported in server.js
safe_remove "src/services/optimized-browser-config.js"         # Not imported in server.js
safe_remove "src/services/SecurityService.js"                  # Duplicate of security.js
safe_remove "src/enhanced-browser-use-setup.js"                # Standalone setup, not used

# 8. Unused route files
safe_remove "src/routes/enhanced-browser-use-routes.js"        # Not imported in routes/index.js

# 9. Unused Python agent file
safe_remove "python-agent/browser_use_agent_optimized.py"      # Duplicate of browser_use_agent.py

echo ""
echo "=== REMOVING UNUSED UTILITY FILES ==="

# 10. Unused utilities
safe_remove "src/utils/session-cleanup.js"                     # Functionality moved to session-manager.js

echo ""
echo "=== REMOVING DEVELOPMENT SCRIPTS ==="

# 11. Development scripts that are no longer needed
safe_remove "docker-scripts.sh"                               # Replaced by docker-hub-push.sh
safe_remove "performance-optimizer.sh"                        # One-time use script

echo ""
echo "=== REMOVING DUPLICATE DOCKER FILES ==="

# 12. Docker development files
safe_remove "docker-compose.dev.yml"                          # Development version, production is main
safe_remove ".env.docker"                                     # Docker env handled in Dockerfile

echo ""
echo "=== CLEANING UP DOCUMENTATION ==="

# 13. Keep only essential documentation
safe_remove "PERFORMANCE_OPTIMIZATION.md"                     # Information integrated into main docs

echo ""
echo "=== KEEPING ESSENTIAL FILES ==="
echo "✅ Keeping:"
echo "   - src/server.js (main server)"
echo "   - src/services/browser-streaming.js (core service)"
echo "   - src/services/browser-use-integration.js (AI integration)"
echo "   - src/services/agent-service.js (agent management)"
echo "   - src/services/session-manager.js (session management)"
echo "   - src/services/security.js (security service)"
echo "   - src/routes/ (all active routes)"
echo "   - python-agent/browser_use_agent.py (main AI agent)"
echo "   - browser-config.js (used by centralized-browser-manager)"
echo "   - Dockerfile (production build)"
echo "   - docker-compose.yml (production deployment)"
echo "   - package.json & requirements.txt (dependencies)"

echo ""
echo "📊 Calculating new project size..."
AFTER_SIZE=$(du -sh . 2>/dev/null | cut -f1)
echo "📁 Project size after cleanup: $AFTER_SIZE"
echo "💾 Space saved by removing unused files!"

echo ""
echo "🎉 Cleanup completed successfully!"
echo ""
echo "📋 SUMMARY OF REMOVED FILES:"
echo "   ✅ Chrome profile cache (tmp/)"
echo "   ✅ Python cache files (__pycache__/)"
echo "   ✅ Development & backup files"
echo "   ✅ Duplicate documentation"
echo "   ✅ Unused config files (3 files)"
echo "   ✅ Unused service files (5 files)"
echo "   ✅ Unused route files (1 file)"
echo "   ✅ Duplicate Python agent file"
echo "   ✅ Development scripts (2 files)"
echo "   ✅ Docker development files"
echo ""
echo "🚀 Your project is now optimized and ready for production!"
