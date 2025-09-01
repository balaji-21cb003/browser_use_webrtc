// Ubuntu-specific browser configuration for unified-browser-platform
// This file provides optimized settings for Ubuntu servers

const ubuntuConfig = {
  // Chrome launch arguments optimized for Ubuntu servers
  chromeArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-plugins',
    '--disable-images',
    '--disable-javascript-harmony-shipping',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=TranslateUI',
    '--disable-ipc-flooding-protection',
    '--memory-pressure-off',
    '--max_old_space_size=4096',
    '--single-process',
    '--no-zygote',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--disable-threaded-animation',
    '--disable-threaded-scrolling',
    '--disable-in-process-stack-traces',
    '--disable-histogram-customizer',
    '--disable-gl-extensions',
    '--disable-composited-antialiasing',
    '--disable-canvas-aa',
    '--disable-3d-apis',
    '--disable-accelerated-2d-canvas',
    '--disable-accelerated-jpeg-decoding',
    '--disable-accelerated-mjpeg-decode',
    '--disable-app-list-dismiss-on-blur',
    '--disable-accelerated-video-decode'
  ],

  // Increased timeouts for Ubuntu environment
  timeouts: {
    DOM_WATCHDOG_TIMEOUT: 60000,      // 60 seconds instead of 30
    BROWSER_WAIT_TIMEOUT: 30000,      // 30 seconds
    ACTION_TIMEOUT: 20000,            // 20 seconds
    PAGE_LOAD_TIMEOUT: 30000,         // 30 seconds
    NAVIGATION_TIMEOUT: 45000,        // 45 seconds
    SCREENSHOT_TIMEOUT: 10000,        // 10 seconds
    ELEMENT_WAIT_TIMEOUT: 15000       // 15 seconds
  },

  // Puppeteer configuration for Ubuntu
  puppeteerConfig: {
    headless: true,
    args: [], // Will be populated with chromeArgs
    defaultViewport: {
      width: 1920,
      height: 1080
    },
    ignoreHTTPSErrors: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    slowMo: 100, // Add slight delay for stability on slower servers
    timeout: 30000
  },

  // Environment detection
  isUbuntu: () => {
    const os = require('os');
    return os.platform() === 'linux' && 
           (process.env.UBUNTU_VERSION || 
            process.env.WSL_DISTRO_NAME === 'Ubuntu' ||
            os.release().toLowerCase().includes('ubuntu'));
  },

  // Get optimized config based on environment
  getConfig: () => {
    const config = { ...ubuntuConfig };
    
    // Apply Ubuntu-specific settings if on Ubuntu
    if (config.isUbuntu()) {
      config.puppeteerConfig.args = config.chromeArgs;
      
      // Additional Ubuntu-specific settings
      config.puppeteerConfig.pipe = true;
      config.puppeteerConfig.dumpio = false;
      config.puppeteerConfig.handleSIGINT = false;
      config.puppeteerConfig.handleSIGTERM = false;
      config.puppeteerConfig.handleSIGHUP = false;
      
      console.log('🐧 Using Ubuntu-optimized browser configuration');
    } else {
      console.log('🪟 Using default browser configuration');
    }
    
    return config;
  },

  // Browser performance monitoring
  monitorPerformance: (page) => {
    if (!ubuntuConfig.isUbuntu()) return;
    
    page.on('metrics', (metrics) => {
      if (metrics.JSHeapUsedSize > 100 * 1024 * 1024) { // 100MB
        console.warn('⚠️ High memory usage detected:', Math.round(metrics.JSHeapUsedSize / 1024 / 1024) + 'MB');
      }
    });
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('🔥 Browser console error:', msg.text());
      }
    });
  },

  // Environment validation
  validateEnvironment: () => {
    const issues = [];
    
    // Check encoding
    if (process.env.PYTHONIOENCODING !== 'utf-8') {
      issues.push('PYTHONIOENCODING should be set to utf-8');
    }
    
    if (!process.env.LANG || !process.env.LANG.includes('UTF-8')) {
      issues.push('LANG should be set to a UTF-8 locale');
    }
    
    // Check Chrome
    const { execSync } = require('child_process');
    try {
      execSync('google-chrome --version', { stdio: 'ignore' });
    } catch (error) {
      issues.push('Google Chrome is not installed or not in PATH');
    }
    
    // Check system resources
    const os = require('os');
    const freeMemory = os.freemem();
    const totalMemory = os.totalmem();
    const memoryUsage = (totalMemory - freeMemory) / totalMemory;
    
    if (memoryUsage > 0.9) {
      issues.push('System memory usage is very high (>90%)');
    }
    
    if (issues.length > 0) {
      console.warn('⚠️ Environment validation issues:');
      issues.forEach(issue => console.warn('  -', issue));
      return false;
    }
    
    console.log('✅ Environment validation passed');
    return true;
  }
};

module.exports = ubuntuConfig;
