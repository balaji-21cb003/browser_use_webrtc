#!/usr/bin/env node

/**
 * Environment Setup Script
 * Handles Chrome version compatibility and environment configuration
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { platform } from 'os';

const OS = platform();

function detectChromePath() {
  // First try to find Chrome using 'which' command
  try {
    const chromePath = execSync('which google-chrome', { encoding: 'utf8' }).trim();
    if (chromePath && existsSync(chromePath)) {
      return chromePath;
    }
  } catch (error) {
    // Chrome not found via which command
  }

  // Try alternative Chrome names
  try {
    const chromePath = execSync('which chromium-browser', { encoding: 'utf8' }).trim();
    if (chromePath && existsSync(chromePath)) {
      return chromePath;
    }
  } catch (error) {
    // Chromium not found via which command
  }

  // Fallback to checking common paths
  const possiblePaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/chromium',
    '/opt/google/chrome/chrome', // Alternative Chrome location
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', // Windows 32-bit
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

function getChromeVersion(chromePath) {
  try {
    const version = execSync(`"${chromePath}" --version`, { encoding: 'utf8' }).trim();
    return version;
  } catch (error) {
    return 'Unknown version';
  }
}

function createEnvFile(chromePath, chromeVersion) {
  const envContent = `# Chrome Configuration
# Using system Chrome: ${chromeVersion}
CHROME_PATH=${chromePath}

# Puppeteer Configuration
# Force Puppeteer to use system Chrome instead of bundled version
PUPPETEER_EXECUTABLE_PATH=${chromePath}
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_PRODUCT=chrome

# Server Configuration
PORT=3000
NODE_ENV=production

# Allowed Origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,http://your-domain.com

# Browser Configuration
HEADLESS=true
WINDOW_MODE=maximized

# API Keys (add your keys here)
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Logging
LOG_LEVEL=info
`;

  try {
    writeFileSync('.env', envContent);
    console.log('✅ Created .env file with Chrome configuration');
    return true;
  } catch (error) {
    console.error('❌ Failed to create .env file:', error.message);
    return false;
  }
}

function installChromeUbuntu() {
  console.log('🐧 Installing Chrome on Ubuntu/Debian...');
  
  const commands = [
    ['sudo apt update', 'Updating package list'],
    ['sudo apt install -y wget gnupg2 ca-certificates', 'Installing dependencies'],
    ['wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -', 'Adding Chrome repository key'],
    ['echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list', 'Adding Chrome repository'],
    ['sudo apt update', 'Updating package list with Chrome repository'],
    ['sudo apt install -y google-chrome-stable', 'Installing Google Chrome']
  ];

  for (const [command, description] of commands) {
    try {
      console.log(`📦 ${description}...`);
      execSync(command, { stdio: 'inherit' });
    } catch (error) {
      console.error(`❌ Failed to ${description}:`, error.message);
      return false;
    }
  }

  return true;
}

function installChromeCentOS() {
  console.log('🔴 Installing Chrome on CentOS/RHEL...');
  
  const commands = [
    ['sudo yum update -y', 'Updating package list'],
    ['sudo yum install -y wget', 'Installing wget'],
    ['wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo rpm --import -', 'Adding Chrome repository key'],
    ['sudo yum install -y google-chrome-stable', 'Installing Google Chrome']
  ];

  for (const [command, description] of commands) {
    try {
      console.log(`📦 ${description}...`);
      execSync(command, { stdio: 'inherit' });
    } catch (error) {
      console.error(`❌ Failed to ${description}:`, error.message);
      return false;
    }
  }

  return true;
}

function installChromeMacOS() {
  console.log('🍎 Installing Chrome on macOS...');
  
  try {
    console.log('📦 Installing Chrome via Homebrew...');
    execSync('brew install --cask google-chrome', { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('❌ Failed to install Chrome via Homebrew:', error.message);
    return false;
  }
}

function installChromeWindows() {
  console.log('🪟 Installing Chrome on Windows...');
  console.log('⚠️  Please install Chrome manually from: https://www.google.com/chrome/');
  console.log('   After installation, Chrome will be automatically detected.');
  return true; // Assume success for manual installation
}

function installChrome() {
  console.log('📥 Chrome not found, installing...');
  
  let installSuccess = false;
  
  switch (OS) {
    case 'linux':
      // Detect Linux distribution
      try {
        const osRelease = execSync('cat /etc/os-release', { encoding: 'utf8' });
        if (osRelease.includes('Ubuntu') || osRelease.includes('Debian')) {
          installSuccess = installChromeUbuntu();
        } else if (osRelease.includes('CentOS') || osRelease.includes('Red Hat')) {
          installSuccess = installChromeCentOS();
        } else {
          console.log('⚠️  Unsupported Linux distribution. Please install Chrome manually.');
          installSuccess = false;
        }
      } catch (error) {
        console.log('⚠️  Could not detect Linux distribution. Please install Chrome manually.');
        installSuccess = false;
      }
      break;
      
    case 'darwin':
      installSuccess = installChromeMacOS();
      break;
      
    case 'win32':
      installSuccess = installChromeWindows();
      break;
      
    default:
      console.log(`⚠️  Unsupported OS: ${OS}. Please install Chrome manually.`);
      installSuccess = false;
  }
  
  return installSuccess;
}

function main() {
  console.log('🔧 Setting up environment for Unified Browser Platform...');
  console.log(`📍 Detected OS: ${OS}`);

  // Detect Chrome
  let chromePath = detectChromePath();
  
  if (!chromePath) {
    console.log('❌ Chrome not found. Installing Chrome automatically...');
    
    const installSuccess = installChrome();
    
    if (installSuccess) {
      // Try to detect Chrome again after installation
      chromePath = detectChromePath();
    }
    
    if (!chromePath) {
      console.log('❌ Chrome installation failed or Chrome not found.');
      console.log('📋 Manual installation required:');
      console.log('   Ubuntu/Debian: sudo apt install google-chrome-stable');
      console.log('   CentOS/RHEL: sudo yum install google-chrome-stable');
      console.log('   macOS: brew install --cask google-chrome');
      console.log('   Windows: Download from https://www.google.com/chrome/');
      process.exit(1);
    }
  }

  // Get Chrome version
  const chromeVersion = getChromeVersion(chromePath);
  console.log(`✅ Found Chrome: ${chromeVersion}`);
  console.log(`📍 Chrome path: ${chromePath}`);

  // Check Puppeteer version
  try {
    const puppeteerVersion = execSync('npm list puppeteer', { encoding: 'utf8' }).trim();
    console.log(`📦 Puppeteer: ${puppeteerVersion.split('@')[1]?.split(' ')[0] || 'Unknown'}`);
  } catch (error) {
    console.log('⚠️ Could not get Puppeteer version');
  }

  // Create environment file
  if (createEnvFile(chromePath, chromeVersion)) {
    console.log('\n🎉 Environment setup completed successfully!');
    console.log('\n📋 Configuration summary:');
    console.log(`   Chrome: ${chromeVersion}`);
    console.log(`   Chrome Path: ${chromePath}`);
    console.log(`   Environment: .env file created`);
    console.log('\n📋 Next steps:');
    console.log('1. Edit .env file to add your API keys');
    console.log('2. Start the server: npm start');
    console.log('3. Test the API: curl http://localhost:3000/health');
    console.log('4. Try browser automation: curl -X POST http://localhost:3000/api/browser-use/execute');
    console.log('\n💡 Note: Puppeteer will use your system Chrome (${chromeVersion}) instead of its bundled version.');
  } else {
    console.log('\n❌ Environment setup failed.');
    process.exit(1);
  }
}

main();
