/**
 * Tier 3 Test Runner
 * Runs Detox E2E tests on real devices
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const deviceManager = require('../devices/device-manager');

async function runTier3(testPath, config) {
  const startTime = Date.now();
  const deviceConfig = config.device;

  const tier3Path = path.join(testPath, 'tier3');
  if (!fs.existsSync(tier3Path)) {
    return {
      tier: 3,
      runner: 'detox',
      duration: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      tests: [],
      errors: ['No Tier 3 tests found'],
    };
  }

  let device = null;
  let allocated = false;

  try {
    if (!deviceConfig) {
      console.log('\nAllocating device for Tier 3 tests...');
      device = await deviceManager.allocateDevice({
        platform: config.devices?.defaultPlatform || 'ios',
      });
      allocated = true;
      console.log(`Using device: ${device.name} (${device.id})`);
    } else {
      device = { id: deviceConfig };
    }

    const needsBuild = await checkBuildNeeded();
    if (needsBuild) {
      console.log('Building app for Detox...');
      await buildApp(config);
    }

    console.log('Running Tier 3 tests...');
    const results = await runDetoxTests(device.id, config);

    if (allocated) {
      await deviceManager.releaseDevice(device.id, results.failed === 0 ? 'passed' : 'failed');
    }

    return {
      ...results,
      tier: 3,
      runner: 'detox',
      duration: Date.now() - startTime,
      device: device.id,
    };
  } catch (error) {
    if (allocated && device) {
      await deviceManager.releaseDevice(device.id, 'failed').catch(() => {});
    }

    return {
      tier: 3,
      runner: 'detox',
      duration: Date.now() - startTime,
      passed: 0,
      failed: 1,
      skipped: 0,
      tests: [],
      errors: [error.message],
    };
  }
}

async function checkBuildNeeded() {
  const buildHashPath = path.join(process.cwd(), '.build-hash');
  const sourceHash = await getSourceHash();

  if (fs.existsSync(buildHashPath)) {
    const lastHash = fs.readFileSync(buildHashPath, 'utf-8').trim();
    if (lastHash === sourceHash) {
      return false;
    }
  }

  return true;
}

async function getSourceHash() {
  try {
    const output = execSync('find src -name "*.ts" -o -name "*.tsx" | sort | xargs md5sum | md5sum | cut -d" " -f1', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    return output.trim();
  } catch (e) {
    return Date.now().toString();
  }
}

async function buildApp(config) {
  const platform = config.devices?.defaultPlatform || 'ios';

  try {
    if (platform === 'ios') {
      execSync('npx detox build --configuration ios', {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
    } else {
      execSync('npx detox build --configuration android', {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
    }

    const sourceHash = await getSourceHash();
    fs.writeFileSync(path.join(process.cwd(), '.build-hash'), sourceHash);
  } catch (error) {
    throw new Error(`Build failed: ${error.message}`);
  }
}

async function runDetoxTests(deviceId, config) {
  const platform = config.devices?.defaultPlatform || 'ios';
  const configName = platform === 'ios' ? 'ios' : 'android';

  const args = [
    'npx', 'detox', 'test',
    '--configuration', configName,
    '--json',
    '--outputFile', 'test-results/tier3-results.json',
  ];

  if (deviceId) {
    args.push('--device-id', deviceId);
  }

  try {
    execSync(args.join(' '), {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    return parseDetoxResults();
  } catch (error) {
    return parseDetoxError(error.stdout || error.message);
  }
}

function parseDetoxResults() {
  const resultsFile = path.join(process.cwd(), 'test-results/tier3-results.json');

  if (fs.existsSync(resultsFile)) {
    const results = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));

    let passed = 0;
    let failed = 0;
    const tests = [];

    results.forEach((suite) => {
      (suite.tests || []).forEach((test) => {
        if (test.status === 'passed') passed++;
        else if (test.status === 'failed') failed++;

        tests.push({
          name: test.title,
          status: test.status,
          duration: test.duration || 0,
          error: test.failure?.message,
        });
      });
    });

    return { passed, failed, skipped: 0, tests };
  }

  return {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: [],
  };
}

function parseDetoxError(output) {
  const failedMatch = output.match(/(\d+)\s+fails?/);

  return {
    passed: 0,
    failed: failedMatch ? parseInt(failedMatch[1]) : 1,
    skipped: 0,
    tests: [],
    errors: [output.substring(0, 1000)],
  };
}

module.exports = {
  runTier3,
};