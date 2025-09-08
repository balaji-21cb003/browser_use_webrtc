/**
 * Stealth Navigator Object Patching
 * Phase 2: Override browser automation detection points
 */

export const NAVIGATOR_STEALTH_SCRIPT = `
(function() {
  'use strict';
  
  // Phase 2: Navigator Object Patching - Hide automation signatures
  
  // 1. Remove webdriver property
  if (navigator.webdriver !== undefined) {
    delete navigator.webdriver;
  }
  
  // 2. Define webdriver as false (non-configurable)
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false,
    configurable: false
  });
  
  // 3. Remove automation-related properties
  if (window.chrome && window.chrome.runtime) {
    delete window.chrome.runtime.onConnect;
    delete window.chrome.runtime.onMessage;
  }
  
  // 4. Patch the permissions API
  if (navigator.permissions && navigator.permissions.query) {
    const originalQuery = navigator.permissions.query;
    navigator.permissions.query = function(parameters) {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission });
      }
      return originalQuery.apply(this, arguments);
    };
  }
  
  // 5. Patch the plugins array to look more realistic
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      return [
        {
          0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format"},
          description: "Portable Document Format",
          filename: "internal-pdf-viewer",
          length: 1,
          name: "Chrome PDF Plugin"
        },
        {
          0: {type: "application/pdf", suffixes: "pdf", description: "Portable Document Format"},
          description: "Portable Document Format", 
          filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
          length: 1,
          name: "Chrome PDF Viewer"
        },
        {
          0: {type: "application/x-nacl", suffixes: "", description: "Native Client Executable"},
          1: {type: "application/x-pnacl", suffixes: "", description: "Portable Native Client Executable"},
          description: "Native Client",
          filename: "internal-nacl-plugin",
          length: 2,
          name: "Native Client"
        }
      ];
    },
    configurable: false
  });
  
  // 6. Mock Chrome runtime to prevent detection
  if (!window.chrome) {
    window.chrome = {};
  }
  
  window.chrome.runtime = {
    connect: function() {
      return {
        onMessage: { addListener: function() {}, removeListener: function() {} },
        onDisconnect: { addListener: function() {}, removeListener: function() {} },
        postMessage: function() {}
      };
    },
    sendMessage: function() {},
    onMessage: { addListener: function() {}, removeListener: function() {} }
  };
  
  // 7. Hide Puppeteer-specific properties
  if (window.__puppeteer_evaluation_script__) {
    delete window.__puppeteer_evaluation_script__;
  }
  
  // 8. Override toString methods to hide proxy traces
  const originalToString = Function.prototype.toString;
  Function.prototype.toString = function() {
    if (this === navigator.permissions.query) {
      return 'function query() { [native code] }';
    }
    return originalToString.apply(this, arguments);
  };
  
  // 9. Mock language and platform properties realistically
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
    configurable: false
  });
  
  // 10. Add realistic timing to prevent timing-based detection
  const originalDateNow = Date.now;
  Date.now = function() {
    return originalDateNow() + Math.floor(Math.random() * 10 - 5);
  };
  
  // 11. Mock screen properties for consistency
  Object.defineProperty(screen, 'availTop', {
    get: () => 0,
    configurable: false
  });
  
  Object.defineProperty(screen, 'availLeft', {
    get: () => 0, 
    configurable: false
  });
  
  // 12. Hide iframe detection
  if (window.top === window) {
    Object.defineProperty(window, 'top', {
      get: () => window,
      configurable: false
    });
  }
  
  // 13. Consistent document properties
  Object.defineProperty(document, 'hidden', {
    get: () => false,
    configurable: false
  });
  
  Object.defineProperty(document, 'visibilityState', {
    get: () => 'visible',
    configurable: false
  });
  
  // 14. Prevent automation detection through error stack traces
  const originalError = window.Error;
  window.Error = function(...args) {
    const error = new originalError(...args);
    if (error.stack) {
      error.stack = error.stack.replace(/puppeteer/gi, 'chrome');
      error.stack = error.stack.replace(/headless/gi, 'chrome');
    }
    return error;
  };
  
  // 15. Mock realistic battery API
  if ('getBattery' in navigator) {
    navigator.getBattery = function() {
      return Promise.resolve({
        charging: true,
        chargingTime: Infinity,
        dischargingTime: Infinity,
        level: 0.8 + Math.random() * 0.2,
        addEventListener: function() {},
        removeEventListener: function() {}
      });
    };
  }
  
  console.log('🔒 Stealth navigator patches applied successfully');
})();
`;

export const CANVAS_STEALTH_SCRIPT = `
(function() {
  'use strict';
  
  // Phase 10: Canvas Fingerprint Masking - Add subtle noise to canvas rendering
  
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  
  // Noise generation function
  function addCanvasNoise(imageData) {
    const data = imageData.data;
    const noiseLevel = 0.1; // Very subtle noise
    
    for (let i = 0; i < data.length; i += 4) {
      // Add very small random variations to RGB values
      const noise = (Math.random() - 0.5) * noiseLevel;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));     // Red
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise)); // Green  
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise)); // Blue
      // Alpha channel (data[i + 3]) remains unchanged
    }
    
    return imageData;
  }
  
  // Override getImageData to add noise
  CanvasRenderingContext2D.prototype.getImageData = function(...args) {
    const imageData = originalGetImageData.apply(this, args);
    return addCanvasNoise(imageData);
  };
  
  // Override toDataURL to ensure noise is applied
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    // Trigger getImageData to apply noise
    const ctx = this.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, this.width, this.height);
      ctx.putImageData(addCanvasNoise(imageData), 0, 0);
    }
    return originalToDataURL.apply(this, args);
  };
  
  console.log('🎨 Canvas fingerprint masking applied');
})();
`;

export const WEBGL_STEALTH_SCRIPT = `
(function() {
  'use strict';
  
  // WebGL fingerprint randomization
  const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
  const originalGetExtension = WebGLRenderingContext.prototype.getExtension;
  
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    // Randomize specific parameters that are used for fingerprinting
    if (parameter === this.RENDERER) {
      return 'Google Inc. (Intel)';
    }
    if (parameter === this.VENDOR) {
      return 'Google Inc.';
    }
    if (parameter === this.VERSION) {
      return 'WebGL 1.0 (OpenGL ES 2.0)';
    }
    if (parameter === this.SHADING_LANGUAGE_VERSION) {
      return 'WebGL GLSL ES 1.0';
    }
    
    return originalGetParameter.apply(this, arguments);
  };
  
  // Apply same for WebGL2
  if (window.WebGL2RenderingContext) {
    WebGL2RenderingContext.prototype.getParameter = WebGLRenderingContext.prototype.getParameter;
  }
  
  console.log('🖼️ WebGL fingerprint masking applied');
})();
`;

export const AUDIO_STEALTH_SCRIPT = `
(function() {
  'use strict';
  
  // Audio context fingerprint randomization
  const originalCreateAnalyser = AudioContext.prototype.createAnalyser;
  
  AudioContext.prototype.createAnalyser = function() {
    const analyser = originalCreateAnalyser.apply(this, arguments);
    
    const originalGetFloatFrequencyData = analyser.getFloatFrequencyData;
    analyser.getFloatFrequencyData = function(array) {
      originalGetFloatFrequencyData.apply(this, arguments);
      // Add tiny random variations
      for (let i = 0; i < array.length; i++) {
        array[i] += (Math.random() - 0.5) * 0.001;
      }
    };
    
    return analyser;
  };
  
  console.log('🔊 Audio fingerprint masking applied');
})();
`;

export const TIMEZONE_STEALTH_SCRIPT = `
(function() {
  'use strict';
  
  // Timezone consistency
  const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
  Date.prototype.getTimezoneOffset = function() {
    return 300; // EST timezone offset
  };
  
  // Consistent Intl.DateTimeFormat
  if (window.Intl && window.Intl.DateTimeFormat) {
    const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function() {
      const options = originalResolvedOptions.apply(this, arguments);
      options.timeZone = 'America/New_York';
      return options;
    };
  }
  
  console.log('🌍 Timezone consistency applied');
})();
`;

// Combine all stealth scripts
export const COMPLETE_STEALTH_SCRIPT =
  NAVIGATOR_STEALTH_SCRIPT +
  CANVAS_STEALTH_SCRIPT +
  WEBGL_STEALTH_SCRIPT +
  AUDIO_STEALTH_SCRIPT +
  TIMEZONE_STEALTH_SCRIPT;

export default {
  NAVIGATOR_STEALTH_SCRIPT,
  CANVAS_STEALTH_SCRIPT,
  WEBGL_STEALTH_SCRIPT,
  AUDIO_STEALTH_SCRIPT,
  TIMEZONE_STEALTH_SCRIPT,
  COMPLETE_STEALTH_SCRIPT,
};
