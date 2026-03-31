/**
 * Test Command
 * Runs tests across all tiers or specific tiers
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora').default;
const path = require('path');
const fs = require('fs');
const { runTier1 } = require('../runners/tier1');
const { runTier2 } = require('../runners/tier2');
const { runTier3 } = require('../runners/tier3');
const { loadConfig, getResultsDir } = require('../config/loader');
const { sendNotifications } = require('../services/notification-service');
const { recordTestRun, exportFlakinessData, initFlakinessDb } = require('../services/flakiness-detector');

function saveRunResults(runId, results, config) {
  const resultsDir = getResultsDir();
  const runDir = path.join(resultsDir, runId);

  // Create run directory
  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
  }

  // Write run metadata
  const runMetadata = {
    runId,
    timestamp: results.timestamp,
    duration: results.duration,
    trigger: 'cli',
    config: {
      tiers: Object.keys(results.tiers),
      stopOnFail: config.stopOnFail,
    },
    environment: {
      platform: config.devices?.defaultPlatform || 'ios',
      nodeVersion: process.version,
    },
  };
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(runMetadata, null, 2));

  // Write tier results and create summary
  const summary = {
    runId,
    timestamp: results.timestamp,
    duration: results.duration,
    overall: {
      status: results.overall,
      passedTiers: Object.values(results.tiers).filter(t => t.failed === 0).length,
      failedTiers: Object.values(results.tiers).filter(t => t.failed > 0).length,
      totalTests: Object.values(results.tiers).reduce((sum, r) => sum + (r.passed || 0) + (r.failed || 0), 0),
      passed: Object.values(results.tiers).reduce((sum, r) => sum + (r.passed || 0), 0),
      failed: Object.values(results.tiers).reduce((sum, r) => sum + (r.failed || 0), 0),
    },
    tiers: {},
  };

  Object.entries(results.tiers).forEach(([tier, result]) => {
    // Copy tier results to run directory
    const tierResultFile = path.join(process.cwd(), 'test-results', `tier${tier}-results.json`);
    if (fs.existsSync(tierResultFile)) {
      const tierData = JSON.parse(fs.readFileSync(tierResultFile, 'utf-8'));
      fs.writeFileSync(path.join(runDir, `tier-${tier}-results.json`), JSON.stringify(tierData, null, 2));

      // Build summary tier data
      summary.tiers[tier] = {
        status: result.failed === 0 ? 'passed' : 'failed',
        tests: result.total || 0,
        passed: result.passed || 0,
        failed: result.failed || 0,
        duration: result.duration || 0,
        runner: result.runner || (tier === 3 ? 'detox' : 'jest'),
      };
    }
  });

  // Write summary.json
  fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));

  // Write human-readable summary.md
  const summaryMd = generateSummaryMd(runId, results, summary);
  fs.writeFileSync(path.join(runDir, 'summary.md'), summaryMd);

  // Generate HTML report
  const { generateHtmlReport, generateJUnitReport } = require('../reporting/report-generator');
  fs.writeFileSync(path.join(runDir, 'summary.html'), generateHtmlReport(summary));
  fs.writeFileSync(path.join(runDir, 'results.xml'), generateJUnitReport(summary));

  return runDir;
}

function generateSummaryMd(runId, results, summary) {
  let md = `# Test Run Summary\n\n`;
  md += `**Run ID:** ${runId}\n`;
  md += `**Status:** ${results.overall === 'passed' ? 'PASSED' : 'FAILED'}\n`;
  md += `**Duration:** ${formatDuration(results.duration)}\n`;
  md += `**Timestamp:** ${results.timestamp}\n\n`;

  md += `## Results by Tier\n\n`;
  md += `| Tier | Runner | Tests | Passed | Failed | Duration | Status |\n`;
  md += `|------|--------|-------|--------|--------|----------|--------|\n`;

  Object.entries(results.tiers).forEach(([tier, result]) => {
    const status = result.failed === 0 ? 'PASSED' : 'FAILED';
    const runner = result.runner || (tier === '3' ? 'detox' : 'jest');
    md += `| ${tier} | ${runner} | ${(result.passed || 0) + (result.failed || 0)} | ${result.passed || 0} | ${result.failed || 0} | ${formatDuration(result.duration || 0)} | ${status} |\n`;
  });

  md += `\n`;

  const failures = Object.entries(results.tiers)
    .filter(([, r]) => r.failed > 0)
    .flatMap(([, r]) => (r.tests || []).filter(t => t.status === 'failed'));

  if (failures.length > 0) {
    md += `## Failed Tests\n\n`;
    failures.forEach((test) => {
      md += `### ${test.name}\n`;
      md += `- Location: \`${test.location || 'unknown'}\`\n`;
      if (test.error) md += `- Error: ${test.error}\n`;
      md += '\n';
    });
  }

  return md;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

const testCmd = new Command('test')
  .description('Run tests (all tiers or specific)')
  .argument('[path]', 'Path to test files', './tests')
  .option('-t, --tier <tier>', 'Which tier(s) to run (1|2|3|all)', 'all')
  .option('-d, --device <id>', 'Specific device ID')
  .option('--stop-on-fail', 'Stop execution on first tier failure', false)
  .option('-r, --retry <n>', 'Retry flaky tests N times before failing', '2')
  .option('--format <format>', 'Output format (json|markdown|html)', 'json')
  .option('--output <path>', 'Output file for results')
  .action(async (testPath, options) => {
    const spinner = ora('Initializing test run...').start();

    try {
      const config = loadConfig();
      const tiers = options.tier === 'all' ? [1, 2, 3] : options.tier.split(',').map(Number);
      const runId = `run-${Date.now()}`;

      spinner.text = `Running tier(s): ${tiers.join(', ')}`;

      const results = {
        runId,
        timestamp: new Date().toISOString(),
        tiers: {},
        duration: 0,
        overall: 'passed',
      };

      const startTime = Date.now();

      for (const tier of tiers) {
        const tierSpinner = ora(`Running Tier ${tier}...`).start();

        try {
          let tierResult;

          switch (tier) {
            case 1:
              tierResult = await runTier1(testPath, config);
              break;
            case 2:
              tierResult = await runTier2(testPath, config);
              break;
            case 3:
              tierResult = await runTier3(testPath, { ...config, device: options.device });
              break;
            default:
              throw new Error(`Unknown tier: ${tier}`);
          }

          results.tiers[tier] = tierResult;

          if (tierResult.failed > 0 && options.stopOnFail) {
            tierSpinner.warn(`Tier ${tier} failed - stopping due to --stop-on-fail`);
            results.overall = 'failed';
            break;
          }

          tierSpinner.succeed(`Tier ${tier}: ${tierResult.passed} passed, ${tierResult.failed} failed`);
        } catch (error) {
          tierSpinner.fail(`Tier ${tier} error: ${error.message}`);
          results.tiers[tier] = { error: error.message, status: 'error' };
          results.overall = 'failed';

          if (options.stopOnFail) {
            break;
          }
        }
      }

      results.duration = Date.now() - startTime;

      // Record test runs for flakiness detection
      try {
        initFlakinessDb();
        Object.entries(results.tiers).forEach(([tier, result]) => {
          if (result.tests) {
            recordTestRun({
              runId,
              timestamp: results.timestamp,
              tier: parseInt(tier),
              total: result.total || 0,
              passed: result.passed || 0,
              failed: result.failed || 0,
              tests: result.tests,
            });
          }
        });
      } catch (flakinessError) {
        console.warn(chalk.yellow(`Flakiness tracking error: ${flakinessError.message}`));
      }

      // Get flakiness data for summary
      let flakyData = { detected: 0 };
      try {
        flakyData = exportFlakinessData();
      } catch (e) {
        // Flakiness tracking is optional
      }

      console.log(chalk.bold('\n=== Test Results ==='));
      console.log(`Run ID: ${runId}`);
      console.log(`Duration: ${(results.duration / 1000).toFixed(2)}s`);
      console.log(`Status: ${results.overall === 'passed' ? chalk.green('PASSED') : chalk.red('FAILED')}`);
      if (flakyData.detected > 0) {
        console.log(chalk.yellow(`Flaky tests detected: ${flakyData.detected}`));
      }

      Object.entries(results.tiers).forEach(([tier, result]) => {
        const status = result.failed === 0 ? chalk.green('PASS') : chalk.red('FAIL');
        console.log(`Tier ${tier}: ${status} (${result.passed || 0} passed, ${result.failed || 0} failed)`);
      });

      // Send notifications if configured (only on failure)
      const summary = {
        runId,
        ...results,
        flaky: flakyData,
        overall: {
          status: results.overall,
          passed: Object.values(results.tiers).reduce((sum, r) => sum + (r.passed || 0), 0),
          failed: Object.values(results.tiers).reduce((sum, r) => sum + (r.failed || 0), 0),
          totalTests: Object.values(results.tiers).reduce((sum, r) => sum + (r.total || 0), 0),
        },
      };

      if (results.overall === 'failed' && config.notifications?.onFailure) {
        try {
          await sendNotifications(config, summary);
        } catch (notifError) {
          console.warn(chalk.yellow(`Notification error: ${notifError.message}`));
        }
      }

      // Save run results to test-results/<run-id>/ directory
      try {
        const runDir = saveRunResults(runId, results, config);
        console.log(chalk.cyan(`Results saved to: ${runDir}`));
      } catch (saveError) {
        console.warn(chalk.yellow(`Failed to save results: ${saveError.message}`));
      }

      const exitCode = results.overall === 'passed' ? 0 : 1;
      process.exit(exitCode);
    } catch (error) {
      spinner.fail(error.message);
      if (options.verbose || process.argv.includes('-v')) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

module.exports = { testCmd };