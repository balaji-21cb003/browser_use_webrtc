#!/usr/bin/env node

/**
 * Chrome Detection Script
 * Checks if Chrome is already installed and skips installation if it is
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

function checkChromeInstalled() {
  try {
    // Check if Chrome is available
    const chromePath = execSync('which google-chrome', { encoding: 'utf8' }).trim();
    
    if (existsSync(chromePath)) {
      // Get Chrome version
      const chromeVersion = execSync('google-chrome --version', { encoding: 'utf8' }).trim();
      console.log(`✅ Chrome already installed: ${chromeVersion}`);
      console.log(`📍 Path: ${chromePath}`);
      return true;
    }
  } catch (error) {
    // Chrome not found
  }
  
  return false;
}

function main() {
  if (checkChromeInstalled()) {
    console.log('🚀 Skipping Chrome installation - already present');
    process.exit(0);
  } else {
    console.log('📥 Chrome not found, proceeding with installation...');
    // Run the Chrome installation script
    try {
      execSync('node scripts/install-chrome.js', { stdio: 'inherit' });
    } catch (error) {
      console.error('❌ Chrome installation failed:', error.message);
      process.exit(1);
    }
  }
}

main();
