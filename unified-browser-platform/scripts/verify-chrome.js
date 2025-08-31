#!/usr/bin/env node

/**
 * Chrome Verification Script
 * This script verifies Chrome installation and configuration
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { platform } from 'os';

const OS = platform();

console.log('🔍 Verifying Chrome installation and configuration...');

function runCommand(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (error) {
    return null;
  }
}

function checkChromeInstallation() {
  console.log('\n🌐 Checking Chrome installation...');
  
  // Check system Chrome
  const chromeVersion = runCommand('google-chrome --version');
  const chromePath = runCommand('which google-chrome');
  
  if (chromeVersion && chromePath) {
    console.log(`✅ System Chrome found: ${chromeVersion}`);
    console.log(`📍 Path: ${chromePath}`);
    return chromePath;
  } else {
    console.log('❌ System Chrome not found');
    return null;
  }
}

function checkPuppeteerChrome() {
  console.log('\n📦 Checking Puppeteer Chrome...');
  
  // Check if Puppeteer has downloaded Chrome
  const puppeteerCache = '/home/ubuntu/.cache/puppeteer';
  if (existsSync(puppeteerCache)) {
    console.log(`✅ Puppeteer cache exists: ${puppeteerCache}`);
    
    // List Chrome versions in cache
    try {
      const chromeVersions = execSync(`ls ${puppeteerCache}`, { encoding: 'utf8' });
      console.log('📋 Available Chrome versions in Puppeteer cache:');
      console.log(chromeVersions);
    } catch (error) {
      console.log('⚠️ Could not list Puppeteer cache contents');
    }
  } else {
    console.log('❌ Puppeteer cache not found');
  }
}

function checkEnvironmentConfig() {
  console.log('\n⚙️ Checking environment configuration...');
  
  if (existsSync('.env')) {
    console.log('✅ .env file exists');
    const envContent = readFileSync('.env', 'utf8');
    console.log('📋 Environment variables:');
    console.log(envContent);
    
    // Check if CHROME_PATH is set
    if (envContent.includes('CHROME_PATH=')) {
      console.log('✅ CHROME_PATH is configured');
    } else {
      console.log('❌ CHROME_PATH not found in .env');
    }
  } else {
    console.log('❌ .env file not found');
  }
}

function testPuppeteerLaunch() {
  console.log('\n🧪 Testing Puppeteer launch...');
  
  try {
    // Test with system Chrome
    const testScript = `
      import puppeteer from 'puppeteer';
      
      try {
        const browser = await puppeteer.launch({
          executablePath: '/usr/bin/google-chrome',
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        await browser.close();
        console.log('✅ Puppeteer can launch with system Chrome');
      } catch (error) {
        console.log('❌ Puppeteer failed to launch with system Chrome:', error.message);
      }
    `;
    
    execSync(`node -e "${testScript}"`, { stdio: 'inherit' });
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

function provideSolutions() {
  console.log('\n🔧 Recommended solutions:');
  console.log('');
  console.log('1. Update .env file with correct Chrome path:');
  console.log('   CHROME_PATH=/usr/bin/google-chrome');
  console.log('');
  console.log('2. Install Puppeteer Chrome as fallback:');
  console.log('   npx puppeteer browsers install chrome');
  console.log('');
  console.log('3. Restart the server after making changes:');
  console.log('   npm start');
  console.log('');
  console.log('4. If still having issues, try:');
  console.log('   export CHROME_PATH=/usr/bin/google-chrome');
  console.log('   npm start');
}

async function main() {
  const chromePath = checkChromeInstallation();
  checkPuppeteerChrome();
  checkEnvironmentConfig();
  testPuppeteerLaunch();
  provideSolutions();
  
  console.log('\n🎉 Verification complete!');
}

main().catch(console.error);
