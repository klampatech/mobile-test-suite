/**
 * Tier 1 Test Runner
 * Runs Jest unit/logic tests
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function runTier1(testPath, config) {
  const startTime = Date.now();

  const tier1Path = path.join(testPath, 'tier1');
  if (!fs.existsSync(tier1Path)) {
    return {
      tier: 1,
      runner: 'jest',
      duration: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      tests: [],
      errors: ['No Tier 1 tests found'],
    };
  }

  const jestBin = findJestBinary();
  const testPattern = 'tier1';

  let jestArgs = [
    jestBin,
    '--testPathPattern', testPattern,
    '--config', 'jest.config.js',
    '--json',
    '--outputFile', 'test-results/tier1-results.json',
  ];

  if (config.tiers?.[1]?.coverage) {
    jestArgs.push('--coverage');
  }

  try {
    console.log(`\nRunning Tier 1 tests...`);
    execSync(jestArgs.join(' '), {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    const resultsFile = path.join(process.cwd(), 'test-results/tier1-results.json');
    if (fs.existsSync(resultsFile)) {
      const results = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
      return formatResults(1, results, Date.now() - startTime);
    }

    return formatFromStdout('', 1, Date.now() - startTime);
  } catch (error) {
    if (error.status !== 0) {
      return parseErrorOutput(error.stdout || error.message, 1, Date.now() - startTime);
    }
    throw error;
  }
}

function findJestBinary() {
  const localJest = path.join(process.cwd(), 'node_modules', '.bin', 'jest');
  if (fs.existsSync(localJest)) {
    return localJest;
  }
  return 'npx jest';
}

function formatResults(tier, results, duration) {
  const tests = results.testResults || [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  const testDetails = [];
  tests.forEach((testFile) => {
    testFile.assertionResults.forEach((test) => {
      if (test.status === 'passed') passed++;
      else if (test.status === 'failed') failed++;
      else if (test.status === 'skipped') skipped++;

      testDetails.push({
        name: test.name,
        status: test.status,
        duration: test.duration || 0,
        error: test.failureMessages?.[0],
      });
    });
  });

  return {
    tier,
    runner: 'jest',
    duration,
    passed,
    failed,
    skipped,
    tests: testDetails,
    errors: failed > 0 ? testDetails.filter(t => t.status === 'failed').map(t => t.error) : [],
  };
}

function formatFromStdout(output, tier, duration) {
  const passedMatch = output.match(/Tests:\s+(\d+)\s+passed/);
  const failedMatch = output.match(/(\d+)\s+failed/);

  const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1]) : 0;

  return {
    tier,
    runner: 'jest',
    duration,
    passed,
    failed,
    skipped: 0,
    tests: [],
    errors: [],
  };
}

function parseErrorOutput(output, tier, duration) {
  const failedMatch = output.match(/(\d+)\s+fails?/);
  const passedMatch = output.match(/(\d+)\s+passes?/);

  const failed = failedMatch ? parseInt(failedMatch[1]) : 1;
  const passed = passedMatch ? parseInt(passedMatch[1]) : 0;

  return {
    tier,
    runner: 'jest',
    duration,
    passed,
    failed,
    skipped: 0,
    tests: [],
    errors: [output.substring(0, 500)],
  };
}

async function runTier1File(filePath, _config) {
  const startTime = Date.now();

  try {
    const output = execSync(`npx jest "${filePath}" --json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const results = JSON.parse(output);
    return formatResults(1, results, Date.now() - startTime);
  } catch (error) {
    return parseErrorOutput(error.stdout || error.message, 1, Date.now() - startTime);
  }
}

module.exports = {
  runTier1,
  runTier1File,
};