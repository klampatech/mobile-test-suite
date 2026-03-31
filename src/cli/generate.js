/**
 * Generate Command
 * Generates tests from specification files
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora').default;
const path = require('path');
const { parseSpec } = require('../parser/spec-parser');
const { generateTests } = require('../generator/test-generator');
const { loadConfig } = require('../config/loader');

const generateCmd = new Command('generate')
  .description('Generate tests from specification files')
  .requiredOption('-s, --spec <path>', 'Path to spec file')
  .requiredOption('-o, --output <path>', 'Output directory for generated tests')
  .option('-t, --tier <tier>', 'Which tier(s) to generate (1|2|3|all)', 'all')
  .option('-f, --force', 'Overwrite existing test files', false)
  .option('-m, --model <model>', 'LLM model to use')
  .action(async (options) => {
    const spinner = ora('Loading spec...').start();

    try {
      const config = loadConfig();
      const model = options.model || config.llm?.model || 'claude-sonnet-4-20250514';

      spinner.text = 'Parsing specification...';

      const parsedSpec = await parseSpec(options.spec);
      spinner.succeed(`Parsed ${parsedSpec.feature} with ${parsedSpec.requirements.length} requirements`);

      spinner.start('Generating tests...');
      const results = await generateTests(parsedSpec, {
        outputDir: options.output,
        tiers: options.tier === 'all' ? [1, 2, 3] : [parseInt(options.tier)],
        force: options.force,
        model,
        apiKeyEnv: config.llm.apiKeyEnv,
        provider: config.llm.provider,
      });

      console.log(chalk.green(`\n✓ Generated ${results.length} test files`));
      results.forEach((result) => {
        console.log(`  ${chalk.gray(result.tier)}: ${result.file}`);
      });

      const runId = `gen-${Date.now()}`;

      console.log(chalk.cyan(`\nTests written to: ${path.resolve(options.output)}`));
      console.log(chalk.cyan(`Run ID: ${runId}`));

      process.exit(0);
    } catch (error) {
      spinner.fail(error.message);
      if (options.verbose || process.argv.includes('-v')) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

module.exports = { generateCmd };