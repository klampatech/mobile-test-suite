/**
 * Config Loader
 * Loads and validates mobile-test-suite.config.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const DEFAULT_CONFIG = {
  projectType: 'cli',
  testDir: './tests',
  specDir: './specs',
  outputDir: './test-results',
  llm: {
    provider: process.env.LLM_PROVIDER || 'anthropic',
    model: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  devices: {
    defaultPlatform: 'ios',
    defaultTimeout: 30000,
    retryAttempts: 2,
  },
  tiers: {
    1: { enabled: true, runner: 'jest', testMatch: ['**/tier1/**/*.test.ts'] },
    2: { enabled: true, runner: 'rntl', testMatch: ['**/tier2/**/*.test.tsx'] },
    3: { enabled: true, runner: 'detox', testMatch: ['**/tier3/**/*.spec.ts'], deviceType: 'real' },
  },
  notifications: {
    onFailure: {
      slack: { enabled: false, webhookUrl: process.env.SLACK_WEBHOOK_URL, channel: '#mobile-tests' },
    },
  },
  retention: {
    maxRuns: 100,
    maxAge: '30d',
    keepFlakyRuns: true,
    keepFailedRuns: true,
  },
};

function loadConfig(configPath) {
  const searchPaths = [
    configPath,
    process.cwd(),
    process.env.MOBILE_TEST_SUITE_CONFIG_PATH,
  ].filter(Boolean);

  for (const searchDir of searchPaths) {
    const configFile = path.join(searchDir, 'mobile-test-suite.config.js');
    if (fs.existsSync(configFile)) {
      try {
        const userConfig = require(configFile);
        return { ...DEFAULT_CONFIG, ...userConfig };
      } catch (error) {
        console.warn(`Failed to load config from ${configFile}: ${error.message}`);
      }
    }
  }

  return DEFAULT_CONFIG;
}

function getHomeDir() {
  return path.join(os.homedir(), '.mobile-test-suite');
}

function ensureHomeDir() {
  const homeDir = getHomeDir();
  if (!fs.existsSync(homeDir)) {
    fs.mkdirSync(homeDir, { recursive: true });
  }
  return homeDir;
}

function getDeviceRegistryPath() {
  return path.join(getHomeDir(), 'devices.json');
}

function getFlakinessDbPath() {
  return path.join(getHomeDir(), 'flakiness.db');
}

function getResultsDir() {
  const resultsDir = path.join(process.cwd(), 'test-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  return resultsDir;
}

function validateConfig(config) {
  const errors = [];

  if (!config.llm || !config.llm.apiKeyEnv) {
    errors.push('LLM apiKeyEnv is required');
  }

  const apiKey = process.env[config.llm?.apiKeyEnv];
  if (!apiKey) {
    errors.push(`Environment variable ${config.llm?.apiKeyEnv} is not set`);
  }

  if (errors.length > 0) {
    throw new Error(`Config validation failed: ${errors.join(', ')}`);
  }

  return true;
}

module.exports = {
  loadConfig,
  getHomeDir,
  ensureHomeDir,
  getDeviceRegistryPath,
  getFlakinessDbPath,
  getResultsDir,
  validateConfig,
  DEFAULT_CONFIG,
};