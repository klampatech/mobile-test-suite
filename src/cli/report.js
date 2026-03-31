/**
 * Report Command
 * Generate test reports from previous runs
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');
const path = require('path');
const { generateReport } = require('../reporting/report-generator');
const { loadConfig, getResultsDir } = require('../config/loader');

const reportCmd = new Command('report')
  .description('Generate test report from previous run')
  .option('-r, --run <id>', 'Run ID to report (default: last run)')
  .option('-f, --format <format>', 'Output format (json|markdown|html)', 'json')
  .option('-o, --output <path>', 'Write to file instead of stdout')
  .action(async (options) => {
    const spinner = ora('Loading test results...').start();

    try {
      const resultsDir = getResultsDir();
      let runId = options.run;

      if (!runId) {
        const runs = fs.readdirSync(resultsDir)
          .filter((f) => f.startsWith('run-'))
          .sort()
          .reverse();

        if (runs.length === 0) {
          spinner.fail('No test runs found');
          process.exit(1);
        }

        runId = runs[0];
      }

      const runPath = path.join(resultsDir, runId);
      const summaryPath = path.join(runPath, 'summary.json');

      if (!fs.existsSync(summaryPath)) {
        spinner.fail(`Run ${runId} not found or incomplete`);
        process.exit(1);
      }

      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      spinner.succeed(`Loaded results for ${runId}`);

      const report = await generateReport(summary, options.format);

      if (options.output) {
        const outputPath = path.resolve(options.output);
        fs.writeFileSync(outputPath, report);
        console.log(chalk.green(`Report written to: ${outputPath}`));
      } else {
        console.log(report);
      }

      process.exit(0);
    } catch (error) {
      spinner.fail(error.message);
      if (options.verbose || process.argv.includes('-v')) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

module.exports = { reportCmd };