/**
 * Unit tests for config loader module
 */

const path = require('path');
const os = require('os');
const {
  getHomeDir,
  getDeviceRegistryPath,
  getResultsDir,
  DEFAULT_CONFIG,
} = require('../src/config/loader');

describe('config/loader', () => {
  describe('getHomeDir', () => {
    it('should return path to .mobile-test-suite in home directory', () => {
      const result = getHomeDir();
      expect(result).toBe(path.join(os.homedir(), '.mobile-test-suite'));
    });
  });

  describe('getDeviceRegistryPath', () => {
    it('should return path to devices.json in home dir', () => {
      const result = getDeviceRegistryPath();
      expect(result).toBe(path.join(os.homedir(), '.mobile-test-suite', 'devices.json'));
    });
  });

  describe('getResultsDir', () => {
    it('should be in cwd test-results', () => {
      const result = getResultsDir();
      expect(result).toBe(path.join(process.cwd(), 'test-results'));
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_CONFIG).toHaveProperty('projectType');
      expect(DEFAULT_CONFIG).toHaveProperty('testDir');
      expect(DEFAULT_CONFIG).toHaveProperty('llm');
      expect(DEFAULT_CONFIG.llm).toHaveProperty('provider');
      expect(DEFAULT_CONFIG.llm).toHaveProperty('model');
      expect(DEFAULT_CONFIG.llm).toHaveProperty('apiKeyEnv');
      expect(DEFAULT_CONFIG).toHaveProperty('devices');
      expect(DEFAULT_CONFIG).toHaveProperty('tiers');
    });

    it('should have all three tiers configured', () => {
      expect(DEFAULT_CONFIG.tiers['1']).toBeDefined();
      expect(DEFAULT_CONFIG.tiers['2']).toBeDefined();
      expect(DEFAULT_CONFIG.tiers['3']).toBeDefined();
      expect(DEFAULT_CONFIG.tiers['1'].runner).toBe('jest');
      expect(DEFAULT_CONFIG.tiers['2'].runner).toBe('rntl');
      expect(DEFAULT_CONFIG.tiers['3'].runner).toBe('detox');
    });

    it('should have valid LLM defaults', () => {
      expect(DEFAULT_CONFIG.llm.provider).toBe('anthropic');
      expect(DEFAULT_CONFIG.llm.model).toBe('claude-sonnet-4-20250514');
      expect(DEFAULT_CONFIG.llm.apiKeyEnv).toBe('ANTHROPIC_API_KEY');
    });
  });
});