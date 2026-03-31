/**
 * Test Command
 * Runs tests across all tiers or specific tiers
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const { runTier1 } = require('../runners/tier1');
const { runTier2 } = require('../runners/tier2');
const { runTier3 } = require('../runners/tier3');
const { loadConfig } = require('../config/loader');
const { sendNotifications } = require('../services/notification-service');

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

      console.log(chalk.bold('\n=== Test Results ==='));
      console.log(`Run ID: ${runId}`);
      console.log(`Duration: ${(results.duration / 1000).toFixed(2)}s`);
      console.log(`Status: ${results.overall === 'passed' ? chalk.green('PASSED') : chalk.red('FAILED')}`);

      Object.entries(results.tiers).forEach(([tier, result]) => {
        const status = result.failed === 0 ? chalk.green('PASS') : chalk.red('FAIL');
        console.log(`Tier ${tier}: ${status} (${result.passed || 0} passed, ${result.failed || 0} failed)`);
      });

      // Send notifications if configured (only on failure)
      const summary = {
        runId,
        ...results,
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