/**
 * Flakiness Detector
 * Tracks test flakiness history using JSON file storage
 * (avoiding native SQLite dependencies)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const FLAKY_THRESHOLD = 0.3; // 30% failure rate on retry = flaky
const MIN_SAMPLE_SIZE = 3; // Need at least 3 runs to determine flakiness

/**
 * Get the home directory for storing flakiness data
 */
function getFlakinessHomeDir() {
  return path.join(os.homedir(), '.mobile-test-suite');
}

/**
 * Ensure the flakiness home directory exists
 */
function ensureFlakinessHomeDir() {
  const homeDir = getFlakinessHomeDir();
  if (!fs.existsSync(homeDir)) {
    fs.mkdirSync(homeDir, { recursive: true });
  }
  return homeDir;
}

/**
 * Get the path to the flakiness JSON file
 */
function getFlakinessDbPath() {
  return path.join(getFlakinessHomeDir(), 'flakiness.json');
}

/**
 * Initialize the flakiness database
 */
function initFlakinessDb() {
  const dbPath = getFlakinessDbPath();
  ensureFlakinessHomeDir();
  if (!fs.existsSync(dbPath)) {
    const initialDb = {
      testRuns: [],
      testHistory: {},
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(dbPath, JSON.stringify(initialDb, null, 2));
    return initialDb;
  }
  return readFlakinessDb();
}

/**
 * Read the flakiness database
 */
function readFlakinessDb() {
  const dbPath = getFlakinessDbPath();
  ensureFlakinessHomeDir();
  if (!fs.existsSync(dbPath)) {
    // If DB doesn't exist, initialize it
    return initFlakinessDb();
  }
  const content = fs.readFileSync(dbPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Write to the flakiness database
 */
function writeFlakinessDb(db) {
  const dbPath = getFlakinessDbPath();
  db.lastUpdated = new Date().toISOString();
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

/**
 * Record a test run result
 * @param {Object} runResult - Test run result with test details
 */
function recordTestRun(runResult) {
  const db = readFlakinessDb();

  // Add to test runs
  db.testRuns.push({
    runId: runResult.runId,
    timestamp: runResult.timestamp,
    tier: runResult.tier,
    total: runResult.total,
    passed: runResult.passed,
    failed: runResult.failed,
  });

  // Record individual test results
  if (runResult.tests) {
    runResult.tests.forEach((test) => {
      if (!db.testHistory[test.name]) {
        db.testHistory[test.name] = {
          history: [],
          lastRun: null,
        };
      }

      const testHistory = db.testHistory[test.name];
      const runEntry = {
        runId: runResult.runId,
        timestamp: runResult.timestamp,
        status: test.status,
        error: test.error || null,
        duration: test.duration || null,
      };

      testHistory.history.push(runEntry);
      testHistory.lastRun = runEntry;

      // Keep only last 20 runs per test to prevent unbounded growth
      if (testHistory.history.length > 20) {
        testHistory.history = testHistory.history.slice(-20);
      }
    });
  }

  // Keep only last 100 run summaries
  if (db.testRuns.length > 100) {
    db.testRuns = db.testRuns.slice(-100);
  }

  writeFlakinessDb(db);
}

/**
 * Detect flaky tests based on history
 * @returns {Object} Flakiness analysis result
 */
function detectFlakyTests() {
  const db = readFlakinessDb();
  const flakyTests = [];
  const allTests = Object.keys(db.testHistory);

  allTests.forEach((testName) => {
    const history = db.testHistory[testName].history;

    if (history.length < MIN_SAMPLE_SIZE) {
      return; // Not enough data to determine flakiness
    }

    // Calculate flakiness: how often does the test fail on retry?
    // A test is flaky if it passes sometimes and fails sometimes
    const passes = history.filter((h) => h.status === 'passed').length;
    const failures = history.filter((h) => h.status === 'failed').length;
    const total = history.length;

    const failureRate = failures / total;

    // Check if test has both passes and failures (inconsistent)
    const hasInconsistentResults = passes > 0 && failures > 0;

    if (hasInconsistentResults && failureRate >= FLAKY_THRESHOLD) {
      flakyTests.push({
        name: testName,
        flakinessRate: failureRate,
        passCount: passes,
        failCount: failures,
        totalRuns: total,
        confidence: total >= 10 ? 'high' : total >= 5 ? 'medium' : 'low',
        sampleSize: total,
      });
    }
  });

  return {
    detected: flakyTests.length,
    tests: flakyTests,
    totalTestsAnalyzed: allTests.length,
    sampleSizeThreshold: MIN_SAMPLE_SIZE,
  };
}

/**
 * Get test history for a specific test
 * @param {string} testName - Name of the test
 * @returns {Object|null} Test history or null if not found
 */
function getTestHistory(testName) {
  const db = readFlakinessDb();
  return db.testHistory[testName] || null;
}

/**
 * Get all test history
 * @returns {Object} All test history
 */
function getAllTestHistory() {
  const db = readFlakinessDb();
  return db.testHistory;
}

/**
 * Get run history
 * @param {number} limit - Number of recent runs to return
 * @returns {Array} Recent run history
 */
function getRunHistory(limit = 10) {
  const db = readFlakinessDb();
  return db.testRuns.slice(-limit);
}

/**
 * Clear flakiness history
 * @param {string|null} testName - Specific test to clear, or null for all
 */
function clearHistory(testName = null) {
  const db = readFlakinessDb();

  if (testName) {
    delete db.testHistory[testName];
  } else {
    db.testHistory = {};
    db.testRuns = [];
  }

  writeFlakinessDb(db);
}

/**
 * Export flakiness data for reporting
 */
function exportFlakinessData() {
  const db = readFlakinessDb();
  const flakiness = detectFlakyTests();

  return {
    flaky: flakiness.detected > 0,
    detected: flakiness.detected,
    tests: flakiness.tests.map((t) => t.name),
    details: flakiness,
    totalTestsTracked: Object.keys(db.testHistory).length,
    totalRunsRecorded: db.testRuns.length,
  };
}

module.exports = {
  initFlakinessDb,
  recordTestRun,
  detectFlakyTests,
  getTestHistory,
  getAllTestHistory,
  getRunHistory,
  clearHistory,
  exportFlakinessData,
  getFlakinessHomeDir,
  getFlakinessDbPath,
  FLAKY_THRESHOLD,
  MIN_SAMPLE_SIZE,
};