/**
 * iOS Device Driver
 * Implements DeviceDriver interface for iOS devices
 */

const { execSync } = require('child_process');

function getIosDriver(udid) {
  return new IosDriver(udid);
}

class IosDriver {
  constructor(udid) {
    this.udid = udid;
  }

  async getUdid() {
    return this.udid;
  }

  async getName() {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`ideviceinfo -u ${this.udid} -k DeviceName`, { encoding: 'utf-8' });
      return stdout.trim();
    } catch (e) {
      return 'iOS Device';
    }
  }

  getPlatform() {
    return 'ios';
  }

  async getOsVersion() {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`ideviceinfo -u ${this.udid} -k SoftwareVersion`, { encoding: 'utf-8' });
      return stdout.trim();
    } catch (e) {
      return 'unknown';
    }
  }

  async getBatteryLevel() {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`ideviceinfo -u ${this.udid} -k com.apple.deviceinfo.BatteryCurrentCapacity`, { encoding: 'utf-8' });
      return parseInt(stdout.trim()) || 100;
    } catch (e) {
      return 100;
    }
  }

  async getStorageFree() {
    return 10 * 1024 * 1024 * 1024;
  }

  async isScreenOn() {
    return true;
  }

  async isLocked() {
    return false;
  }

  async isConnected() {
    try {
      execSync(`idevice_id -l | grep ${this.udid}`, { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }

  async installApp(appPath) {
    try {
      execSync(`ideviceinstaller -u ${this.udid} -i "${appPath}"`, { stdio: 'inherit' });
    } catch (error) {
      throw new Error(`Failed to install app: ${error.message}`);
    }
  }

  async uninstallApp(bundleId) {
    try {
      execSync(`ideviceinstaller -u ${this.udid} -U ${bundleId}`, { stdio: 'ignore' });
    } catch (e) {}
  }

  async isAppInstalled(bundleId) {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`ideviceinstaller -u ${this.udid} -l`, { encoding: 'utf-8' });
      return stdout.includes(bundleId);
    } catch (e) {
      return false;
    }
  }

  async launchApp(bundleId, launchArgs = {}) {
    throw new Error('Use Detox to launch apps on iOS');
  }

  async terminateApp(bundleId) {}

  async resetDevice() {
    await this.uninstallApp('com.myapp');
  }

  async reboot() {
    throw new Error('Reboot not supported on iOS');
  }

  async takeScreenshot() {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`idevicescreenshot -u ${this.udid}`, { encoding: 'utf-8' });
      return stdout;
    } catch (e) {
      throw new Error('Failed to take screenshot');
    }
  }

  async clearAppData(bundleId) {
    await this.uninstallApp(bundleId);
  }

  async clearKeychain() {}
}

module.exports = {
  getIosDriver,
  IosDriver,
};