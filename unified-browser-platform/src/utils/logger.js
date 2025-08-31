/**
 * Logger Utility
 * Centralized logging with different levels and formatting
 */

import util from 'util';

export class Logger {
  constructor(component = 'App') {
    this.component = component;
    this.colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m'
    };
  }

  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.map(arg => 
      typeof arg === 'object' ? util.inspect(arg, { colors: true, depth: 2 }) : arg
    ).join(' ');
    
    const fullMessage = `${message} ${formattedArgs}`.trim();
    
    return `${timestamp} [${level}] [${this.component}] ${fullMessage}`;
  }

  getColorForLevel(level) {
    switch (level.toLowerCase()) {
      case 'error': return this.colors.red;
      case 'warn': return this.colors.yellow;
      case 'info': return this.colors.green;
      case 'debug': return this.colors.cyan;
      default: return this.colors.white;
    }
  }

  log(level, message, ...args) {
    const formattedMessage = this.formatMessage(level.toUpperCase(), message, ...args);
    
    if (process.env.NODE_ENV !== 'test') {
      const color = this.getColorForLevel(level);
      console.log(`${color}${formattedMessage}${this.colors.reset}`);
    }
  }

  error(message, ...args) {
    this.log('error', message, ...args);
  }

  warn(message, ...args) {
    this.log('warn', message, ...args);
  }

  info(message, ...args) {
    this.log('info', message, ...args);
  }

  debug(message, ...args) {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      this.log('debug', message, ...args);
    }
  }
}

export default Logger;
