#!/usr/bin/env node

/**
 * Find Python Path Script
 * Detects the correct Python executable path for the system
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { platform } from 'os';

const OS = platform();

function findPythonPath() {
  const projectRoot = process.cwd();
  
  // Try multiple possible Python paths
  const possiblePythonPaths = [
    // .venv (most common)
    OS === "win32"
      ? join(projectRoot, ".venv", "Scripts", "python.exe")
      : join(projectRoot, ".venv", "bin", "python"),
    // venv (alternative)
    OS === "win32"
      ? join(projectRoot, "venv", "Scripts", "python.exe")
      : join(projectRoot, "venv", "bin", "python"),
    // System Python
    OS === "win32" ? "python.exe" : "python3",
    "python",
  ];

  console.log('🔍 Searching for Python...');
  
  // Find the first existing Python path
  for (const pythonPath of possiblePythonPaths) {
    try {
      if (existsSync(pythonPath) || pythonPath.includes("python")) {
        // Test if it's executable
        const version = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' }).trim();
        console.log(`✅ Found Python: ${pythonPath} (${version})`);
        return pythonPath;
      }
    } catch (error) {
      // Continue to next path
    }
  }

  console.log('⚠️ No Python found, using fallback: python3');
  return "python3"; // Fallback
}

function main() {
  const pythonPath = findPythonPath();
  console.log(`🐍 Python path: ${pythonPath}`);
  
  // Export for use in other scripts
  process.env.PYTHON_PATH = pythonPath;
  
  return pythonPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { findPythonPath };
