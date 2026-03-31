/**
 * Device Command
 * Manage real devices for testing
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora').default;
const deviceManager = require('../devices/device-manager');

const deviceCmd = new Command('device')
  .description('Manage real devices')
  .addCommand(
    new Command('list')
      .description('List available devices')
      .option('-p, --platform <platform>', 'Filter by platform (ios|android|all)', 'all')
      .action(async (options) => {
        try {
          const devices = await deviceManager.listDevices(options.platform);

          if (devices.length === 0) {
            console.log(chalk.yellow('No devices found'));
            return;
          }

          console.log(chalk.bold('\nID         PLATFORM  STATUS     NAME           OS     LAST RUN         RESULT'));
          console.log(chalk.gray('─'.repeat(80)));

          devices.forEach((device) => {
            const statusColor = device.status === 'available' ? chalk.green : device.status === 'in-use' ? chalk.yellow : chalk.gray;
            console.log(
              `${device.id.padEnd(10)} ${device.platform.padEnd(8)} ${statusColor(device.status.padEnd(10))} ${device.name.padEnd(12)} ${device.osVersion.padEnd(6)} ${device.lastRun || 'never'.padEnd(14)} ${device.lastResult || 'N/A'}`
            );
          });

          console.log(chalk.gray(`\nTotal: ${devices.length} device(s)`));
        } catch (error) {
          console.error(chalk.red('Error:'), error.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('pair')
      .description('Pair a new device')
      .option('-n, --name <label>', 'Device label')
      .option('-p, --platform <platform>', 'Platform (ios|android)', 'ios')
      .option('-u, --udid <udid>', 'Device UDID (optional, auto-detect if not provided)')
      .action(async (options) => {
        const spinner = ora('Pairing device...').start();
        try {
          const device = await deviceManager.pairDevice(options.platform, options.name, options.udid);
          spinner.succeed(`Paired ${device.name} (${device.id})`);
        } catch (error) {
          spinner.fail(error.message);
          process.exit(2);
        }
      })
  )
  .addCommand(
    new Command('reset')
      .description('Reset a device to clean state')
      .argument('<device-id>', 'Device ID to reset')
      .option('-f, --force', 'Force reset even if in use', false)
      .action(async (deviceId, options) => {
        const spinner = ora(`Resetting device ${deviceId}...`).start();
        try {
          await deviceManager.resetDevice(deviceId, options.force);
          spinner.succeed(`Device ${deviceId} reset complete`);
        } catch (error) {
          spinner.fail(error.message);
          process.exit(2);
        }
      })
  )
  .addCommand(
    new Command('health')
      .description('Check device health')
      .argument('<device-id>', 'Device ID to check')
      .action(async (deviceId, _options) => {
        const spinner = ora(`Checking health...`).start();
        try {
          const health = await deviceManager.healthCheck(deviceId);
          spinner.stop();

          console.log(chalk.bold(`\nDevice: ${health.device.name} (${health.device.id})`));
          console.log(`Status: ${health.healthy ? chalk.green('healthy') : chalk.red('unhealthy')}`);
          console.log(`Platform: ${health.device.platform}`);
          console.log(`OS Version: ${health.device.osVersion}`);
          console.log(`Battery: ${health.battery}%`);
          console.log(`Storage: ${health.storageFree} bytes free`);
          console.log(`Screen: ${health.screenOn ? 'ON' : 'OFF'}${health.locked ? ', locked' : ''}`);
          console.log(`Network: ${health.networkConnected ? 'Connected' : 'Disconnected'}`);
          console.log(`Last Check: ${health.timestamp}`);

          if (health.issues.length > 0) {
            console.log(chalk.yellow('\nIssues:'));
            health.issues.forEach((issue) => console.log(`  - ${issue}`));
          }

          process.exit(health.healthy ? 0 : 1);
        } catch (error) {
          spinner.fail(error.message);
          process.exit(2);
        }
      })
  )
  .addCommand(
    new Command('remove')
      .description('Remove device from pool')
      .argument('<device-id>', 'Device ID to remove')
      .option('-f, --force', 'Force removal even if in use', false)
      .action(async (deviceId, options) => {
        try {
          await deviceManager.removeDevice(deviceId, options.force);
          console.log(chalk.green(`Device ${deviceId} removed`));
        } catch (error) {
          console.error(chalk.red('Error:'), error.message);
          process.exit(2);
        }
      })
  )
  .addCommand(
    new Command('allocate')
      .description('Allocate a device for testing')
      .option('-p, --platform <platform>', 'Platform preference (ios|android)')
      .option('-r, --requirements <json>', 'Device requirements as JSON')
      .action(async (options) => {
        const spinner = ora('Allocating device...').start();
        try {
          let requirements = {};
          if (options.requirements) {
            requirements = JSON.parse(options.requirements);
          }
          if (options.platform) {
            requirements.platform = options.platform;
          }

          const device = await deviceManager.allocateDevice(requirements);
          spinner.succeed(`Allocated ${device.name} (${device.id})`);
          console.log(`Platform: ${device.platform}`);
          console.log(`UDID: ${device.udid}`);
        } catch (error) {
          spinner.fail(error.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('release')
      .description('Release device back to pool')
      .argument('<device-id>', 'Device ID to release')
      .option('-r, --result <result>', 'Test result (passed|failed)', 'passed')
      .action(async (deviceId, options) => {
        try {
          await deviceManager.releaseDevice(deviceId, options.result);
          console.log(chalk.green(`Device ${deviceId} released (${options.result})`));
        } catch (error) {
          console.error(chalk.red('Error:'), error.message);
          process.exit(2);
        }
      })
  );

module.exports = { deviceCmd };