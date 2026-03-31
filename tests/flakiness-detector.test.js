/**
 * Flakiness Detector Tests
 */

const path = require('path');

// The actual paths used by flakiness-detector (based on os.homedir())
const FLAKINESS_HOME = '/tmp/test-mobile-test-suite/.mobile-test-suite';
const TEST_DB_PATH = path.join(FLAKINESS_HOME, 'flakiness.json');

// Mock the fs module at the module level
const mockFs = {
  files: {},
  dirs: new Set([FLAKINESS_HOME]),
};

jest.mock('fs', () => ({
  existsSync: (filePath) => {
    return mockFs.files[filePath] !== undefined || mockFs.dirs.has(filePath);
  },
  readFileSync: (filePath) => {
    if (mockFs.files[filePath]) {
      return mockFs.files[filePath];
    }
    throw new Error('File not found');
  },
  writeFileSync: (filePath, content) => {
    mockFs.files[filePath] = content;
  },
  mkdirSync: (dirPath, options) => {
    mockFs.dirs.add(dirPath);
  },
}));

jest.mock('os', () => ({
  homedir: () => '/tmp/test-mobile-test-suite',
}));

// Now import after mocks
const {
  initFlakinessDb,
  recordTestRun,
  detectFlakyTests,
  getTestHistory,
  getAllTestHistory,
  getRunHistory,
  clearHistory,
  exportFlakinessData,
  FLAKY_THRESHOLD,
  MIN_SAMPLE_SIZE,
} = require('../src/services/flakiness-detector');

describe('flakiness-detector', () => {
  beforeEach(() => {
    // Reset mock filesystem
    mockFs.files = {};
    mockFs.dirs = new Set([FLAKINESS_HOME]);
  });

  describe('initFlakinessDb', () => {
    it('should initialize with correct structure', () => {
      const db = initFlakinessDb();
      expect(db.testRuns).toEqual([]);
      expect(db.testHistory).toEqual({});
      expect(db.lastUpdated).toBeDefined();
    });
  });

  describe('recordTestRun', () => {
    it('should record a test run', () => {
      initFlakinessDb();
      recordTestRun({
        runId: 'run-1',
        timestamp: '2026-03-30T10:00:00Z',
        tier: 1,
        total: 10,
        passed: 8,
        failed: 2,
        tests: [
          { name: 'test-1', status: 'passed' },
          { name: 'test-2', status: 'failed', error: 'Assertion failed' },
        ],
      });

      const db = JSON.parse(mockFs.files[TEST_DB_PATH]);
      expect(db.testRuns.length).toBe(1);
      expect(db.testRuns[0].runId).toBe('run-1');
      expect(db.testHistory['test-1']).toBeDefined();
      expect(db.testHistory['test-2']).toBeDefined();
    });

    it('should append to existing history', () => {
      initFlakinessDb();
      recordTestRun({
        runId: 'run-1',
        timestamp: '2026-03-30T10:00:00Z',
        tier: 1,
        total: 5,
        passed: 4,
        failed: 1,
        tests: [{ name: 'test-1', status: 'passed' }],
      });

      recordTestRun({
        runId: 'run-2',
        timestamp: '2026-03-30T11:00:00Z',
        tier: 1,
        total: 5,
        passed: 3,
        failed: 2,
        tests: [
          { name: 'test-1', status: 'failed' },
          { name: 'test-2', status: 'passed' },
        ],
      });

      const db = JSON.parse(mockFs.files[TEST_DB_PATH]);
      expect(db.testRuns.length).toBe(2);
      expect(db.testHistory['test-1'].history.length).toBe(2);
      expect(db.testHistory['test-2'].history.length).toBe(1);
    });
  });

  describe('detectFlakyTests', () => {
    it('should not flag tests with insufficient data', () => {
      initFlakinessDb();
      recordTestRun({
        runId: 'run-1',
        timestamp: '2026-03-30T10:00:00Z',
        tier: 1,
        total: 1,
        passed: 1,
        failed: 0,
        tests: [{ name: 'test-1', status: 'passed' }],
      });

      const result = detectFlakyTests();
      expect(result.detected).toBe(0);
      expect(result.totalTestsAnalyzed).toBe(1);
    });

    it('should detect flaky test when inconsistent and high failure rate', () => {
      initFlakinessDb();
      // Record 10 runs: 7 passes, 3 failures (30% failure rate)
      for (let i = 0; i < 10; i++) {
        recordTestRun({
          runId: `run-${i}`,
          timestamp: `2026-03-30T${String(i).padStart(2, '0')}:00:00Z`,
          tier: 1,
          total: 1,
          passed: i < 7 ? 1 : 0,
          failed: i < 7 ? 0 : 1,
          tests: [{ name: 'flaky-test', status: i < 7 ? 'passed' : 'failed' }],
        });
      }

      const result = detectFlakyTests();
      expect(result.detected).toBe(1);
      expect(result.tests[0].flakinessRate).toBe(0.3);
      expect(result.tests[0].passCount).toBe(7);
      expect(result.tests[0].failCount).toBe(3);
    });

    it('should not flag consistent passing tests', () => {
      initFlakinessDb();
      for (let i = 0; i < 5; i++) {
        recordTestRun({
          runId: `run-${i}`,
          timestamp: `2026-03-30T${String(i).padStart(2, '0')}:00:00Z`,
          tier: 1,
          total: 1,
          passed: 1,
          failed: 0,
          tests: [{ name: 'stable-test', status: 'passed' }],
        });
      }

      const result = detectFlakyTests();
      expect(result.detected).toBe(0);
    });

    it('should not flag consistent failing tests (not flaky, just broken)', () => {
      initFlakinessDb();
      for (let i = 0; i < 5; i++) {
        recordTestRun({
          runId: `run-${i}`,
          timestamp: `2026-03-30T${String(i).padStart(2, '0')}:00:00Z`,
          tier: 1,
          total: 1,
          passed: 0,
          failed: 1,
          tests: [{ name: 'broken-test', status: 'failed', error: 'Always fails' }],
        });
      }

      const result = detectFlakyTests();
      // Not flaky - it's consistently broken (100% failure, 0% pass)
      expect(result.detected).toBe(0);
    });

    it('should not flag tests below threshold', () => {
      initFlakinessDb();
      // 10 runs: 9 passes, 1 failure (10% - below 30% threshold)
      for (let i = 0; i < 10; i++) {
        recordTestRun({
          runId: `run-${i}`,
          timestamp: `2026-03-30T${String(i).padStart(2, '0')}:00:00Z`,
          tier: 1,
          total: 1,
          passed: i < 9 ? 1 : 0,
          failed: i < 9 ? 0 : 1,
          tests: [{ name: 'mostly-stable', status: i < 9 ? 'passed' : 'failed' }],
        });
      }

      const result = detectFlakyTests();
      expect(result.detected).toBe(0);
    });
  });

  describe('getTestHistory', () => {
    it('should return null for non-existent test', () => {
      initFlakinessDb();
      expect(getTestHistory('nonexistent')).toBeNull();
    });

    it('should return test history for existing test', () => {
      initFlakinessDb();
      recordTestRun({
        runId: 'run-1',
        timestamp: '2026-03-30T10:00:00Z',
        tier: 1,
        total: 1,
        passed: 1,
        failed: 0,
        tests: [{ name: 'test-1', status: 'passed' }],
      });

      const history = getTestHistory('test-1');
      expect(history).not.toBeNull();
      expect(history.history.length).toBe(1);
      expect(history.lastRun.status).toBe('passed');
    });
  });

  describe('getAllTestHistory', () => {
    it('should return all test history', () => {
      initFlakinessDb();
      recordTestRun({
        runId: 'run-1',
        timestamp: '2026-03-30T10:00:00Z',
        tier: 1,
        total: 1,
        passed: 1,
        failed: 0,
        tests: [
          { name: 'test-1', status: 'passed' },
          { name: 'test-2', status: 'passed' },
        ],
      });

      const all = getAllTestHistory();
      expect(Object.keys(all)).toContain('test-1');
      expect(Object.keys(all)).toContain('test-2');
    });
  });

  describe('getRunHistory', () => {
    it('should return limited run history', () => {
      initFlakinessDb();
      for (let i = 0; i < 15; i++) {
        recordTestRun({
          runId: `run-${i}`,
          timestamp: `2026-03-30T${String(i).padStart(2, '0')}:00:00Z`,
          tier: 1,
          total: 1,
          passed: 1,
          failed: 0,
          tests: [{ name: 'test-1', status: 'passed' }],
        });
      }

      const history = getRunHistory(5);
      expect(history.length).toBe(5);
    });
  });

  describe('clearHistory', () => {
    it('should clear specific test history', () => {
      initFlakinessDb();
      recordTestRun({
        runId: 'run-1',
        timestamp: '2026-03-30T10:00:00Z',
        tier: 1,
        total: 2,
        passed: 1,
        failed: 1,
        tests: [
          { name: 'test-1', status: 'passed' },
          { name: 'test-2', status: 'failed' },
        ],
      });

      clearHistory('test-1');

      const db = JSON.parse(mockFs.files[TEST_DB_PATH]);
      expect(db.testHistory['test-1']).toBeUndefined();
      expect(db.testHistory['test-2']).toBeDefined();
    });

    it('should clear all history when no test specified', () => {
      initFlakinessDb();
      recordTestRun({
        runId: 'run-1',
        timestamp: '2026-03-30T10:00:00Z',
        tier: 1,
        total: 2,
        passed: 1,
        failed: 1,
        tests: [
          { name: 'test-1', status: 'passed' },
          { name: 'test-2', status: 'failed' },
        ],
      });

      clearHistory();

      const db = JSON.parse(mockFs.files[TEST_DB_PATH]);
      expect(db.testHistory).toEqual({});
      expect(db.testRuns).toEqual([]);
    });
  });

  describe('exportFlakinessData', () => {
    it('should export flakiness data structure', () => {
      initFlakinessDb();
      recordTestRun({
        runId: 'run-1',
        timestamp: '2026-03-30T10:00:00Z',
        tier: 1,
        total: 1,
        passed: 1,
        failed: 0,
        tests: [{ name: 'test-1', status: 'passed' }],
      });

      const exported = exportFlakinessData();
      expect(exported.flaky).toBe(false);
      expect(exported.detected).toBe(0);
      expect(exported.tests).toEqual([]);
      expect(exported.totalTestsTracked).toBe(1);
      expect(exported.totalRunsRecorded).toBe(1);
    });
  });

  describe('constants', () => {
    it('should have correct flaky threshold', () => {
      expect(FLAKY_THRESHOLD).toBe(0.3);
    });

    it('should have correct minimum sample size', () => {
      expect(MIN_SAMPLE_SIZE).toBe(3);
    });
  });
});