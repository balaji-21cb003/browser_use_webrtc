#!/usr/bin/env node

/**
 * Cross-platform Chrome Installation Script
 * This script detects the OS and installs Chrome accordingly
 */

import { execSync } from 'child_process';
import { platform, arch } from 'os';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OS = platform();
const ARCH = arch();

console.log('🚀 Installing Chrome for Unified Browser Platform...');
console.log(`📍 Detected OS: ${OS}, Architecture: ${ARCH}`);

function runCommand(command, description) {
  try {
    console.log(`📦 ${description}...`);
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`❌ Failed to ${description}:`, error.message);
    return false;
  }
}

function detectChromePath() {
  const possiblePaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', // Windows 32-bit
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      console.log(`✅ Found Chrome at: ${path}`);
      return path;
    }
  }

  return null;
}

function installChromeUbuntu() {
  console.log('🐧 Installing Chrome on Ubuntu/Debian...');
  
  // First check if Chrome is already installed
  const existingChrome = detectChromePath();
  if (existingChrome) {
    console.log(`✅ Chrome already installed at: ${existingChrome}`);
    return true;
  }
  
  const commands = [
    ['sudo apt update', 'Updating package list'],
    ['sudo apt install -y wget gnupg2 ca-certificates', 'Installing dependencies'],
    ['wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -', 'Adding Chrome repository key'],
    ['echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list', 'Adding Chrome repository'],
    ['sudo apt update', 'Updating package list with Chrome repository'],
    ['sudo apt install -y google-chrome-stable', 'Installing Google Chrome']
  ];

  for (const [command, description] of commands) {
    if (!runCommand(command, description)) {
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
    if (!runCommand(command, description)) {
      return false;
    }
  }

  return true;
}

function installChromeMacOS() {
  console.log('🍎 Installing Chrome on macOS...');
  
  const commands = [
    ['brew install --cask google-chrome', 'Installing Chrome via Homebrew']
  ];

  for (const [command, description] of commands) {
    if (!runCommand(command, description)) {
      return false;
    }
  }

  return true;
}

function installChromeWindows() {
  console.log('🪟 Installing Chrome on Windows...');
  console.log('⚠️  Please install Chrome manually from: https://www.google.com/chrome/');
  console.log('   After installation, Chrome will be automatically detected.');
  return true; // Assume success for manual installation
}

function createEnvFile(chromePath) {
  const envContent = `# Chrome Configuration
CHROME_PATH=${chromePath}

# Server Configuration
PORT=3000
NODE_ENV=production

# Allowed Origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,http://your-domain.com

# Browser Configuration
HEADLESS=true
WINDOW_MODE=maximized
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

async function main() {
  // First, check if Chrome is already installed
  let chromePath = detectChromePath();
  
  if (chromePath) {
    console.log('✅ Chrome is already installed!');
    console.log(`📍 Chrome path: ${chromePath}`);
    
    // Check Chrome version
    try {
      const chromeVersion = execSync('google-chrome --version', { encoding: 'utf8' }).trim();
      console.log(`📋 Chrome version: ${chromeVersion}`);
    } catch (error) {
      console.log('⚠️ Could not get Chrome version');
    }
    
    // Create env file with existing Chrome
    createEnvFile(chromePath);
    console.log('\n🎉 Using existing Chrome installation!');
    console.log('\n📋 Next steps:');
    console.log('1. Start the server: npm start');
    console.log('2. Test the API: curl http://localhost:3000/health');
    console.log('3. Try browser automation: curl -X POST http://localhost:3000/api/browser-use/execute');
    return;
  }
  
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
  
  if (installSuccess) {
    // Try to detect Chrome again after installation
    chromePath = detectChromePath();
  }
  
  if (chromePath) {
    createEnvFile(chromePath);
    console.log('\n🎉 Chrome setup completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Start the server: npm start');
    console.log('2. Test the API: curl http://localhost:3000/health');
    console.log('3. Try browser automation: curl -X POST http://localhost:3000/api/browser-use/execute');
  } else {
    console.log('\n❌ Chrome installation failed or Chrome not found.');
    console.log('📋 Manual installation required:');
    console.log('   Ubuntu/Debian: sudo apt install google-chrome-stable');
    console.log('   CentOS/RHEL: sudo yum install google-chrome-stable');
    console.log('   macOS: brew install --cask google-chrome');
    console.log('   Windows: Download from https://www.google.com/chrome/');
  }
}

main().catch(console.error);
