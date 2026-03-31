#!/usr/bin/env node

/**
 * Mobile Test Suite CLI
 * AI-native mobile testing suite for React Native apps
 */

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

const generateCmd = require('../src/cli/generate').generateCmd;
const testCmd = require('../src/cli/test').testCmd;
const deviceCmd = require('../src/cli/device').deviceCmd;
const initCmd = require('../src/cli/init').initCmd;
const reportCmd = require('../src/cli/report').reportCmd;
const { loadConfig } = require('../src/config/loader');

const program = new Command();

program
  .name('mobile-test-suite')
  .description('AI-native mobile testing suite for React Native apps')
  .version('0.1.0');

// Register commands
program.addCommand(generateCmd);
program.addCommand(testCmd);
program.addCommand(deviceCmd);
program.addCommand(initCmd);
program.addCommand(reportCmd);

// Global options
program.option('-v, --verbose', 'Enable verbose logging');
program.option('-c, --config <path>', 'Path to config file');

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Error:'), error.message);
  if (program.opts().verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Fatal error:'), error.message);
  if (program.opts().verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});

// Execute
program.parse(process.argv);