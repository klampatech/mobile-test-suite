/**
 * Android Device Driver
 * Implements DeviceDriver interface for Android devices
 */

const { execSync } = require('child_process');

function getAndroidDriver(udid) {
  return new AndroidDriver(udid);
}

class AndroidDriver {
  constructor(udid) {
    this.udid = udid;
  }

  async getUdid() {
    return this.udid;
  }

  async getName() {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`adb -s ${this.udid} shell getprop ro.product.model`, { encoding: 'utf-8' });
      return stdout.trim();
    } catch (e) {
      return 'Android Device';
    }
  }

  getPlatform() {
    return 'android';
  }

  async getOsVersion() {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`adb -s ${this.udid} shell getprop ro.build.version.release`, { encoding: 'utf-8' });
      return stdout.trim();
    } catch (e) {
      return 'unknown';
    }
  }

  async getBatteryLevel() {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`adb -s ${this.udid} shell dumpsys battery | grep level`, { encoding: 'utf-8' });
      const match = stdout.match(/level:\s*(\d+)/);
      return match ? parseInt(match[1]) : 100;
    } catch (e) {
      return 100;
    }
  }

  async getStorageFree() {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`adb -s ${this.udid} shell df /data`);
      const lines = stdout.split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        const available = parseInt(parts[3]) * 1024;
        return available;
      }
      return 10 * 1024 * 1024 * 1024;
    } catch (e) {
      return 10 * 1024 * 1024 * 1024;
    }
  }

  async isScreenOn() {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`adb -s ${this.udid} shell dumpsys window | grep mScreenOn`, { encoding: 'utf-8' });
      return stdout.includes('mScreenOn=true');
    } catch (e) {
      return true;
    }
  }

  async isLocked() {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`adb -s ${this.udid} shell dumpsys window | grep mInputLocked`, { encoding: 'utf-8' });
      return stdout.includes('mInputLocked=true');
    } catch (e) {
      return false;
    }
  }

  async isConnected() {
    try {
      execSync(`adb -s ${this.udid} get-state`, { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }

  async installApp(appPath) {
    try {
      execSync(`adb -s ${this.udid} install -r "${appPath}"`, { stdio: 'inherit' });
    } catch (error) {
      throw new Error(`Failed to install app: ${error.message}`);
    }
  }

  async uninstallApp(bundleId) {
    try {
      execSync(`adb -s ${this.udid} uninstall ${bundleId}`, { stdio: 'ignore' });
    } catch (e) {}
  }

  async isAppInstalled(bundleId) {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync(`adb -s ${this.udid} shell pm list packages ${bundleId}`, { encoding: 'utf-8' });
      return stdout.includes(bundleId);
    } catch (e) {
      return false;
    }
  }

  async launchApp(bundleId, launchArgs = {}) {
    const args = Object.entries(launchArgs)
      .map(([k, v]) => `-e ${k} ${v}`)
      .join(' ');

    try {
      execSync(`adb -s ${this.udid} shell am start -n ${bundleId}/.MainActivity ${args}`, {
        stdio: 'ignore',
      });
    } catch (e) {
      throw new Error(`Failed to launch app: ${e.message}`);
    }
  }

  async terminateApp(bundleId) {
    try {
      execSync(`adb -s ${this.udid} shell am force-stop ${bundleId}`, { stdio: 'ignore' });
    } catch (e) {}
  }

  async resetDevice() {
    await this.clearAppData('com.myapp');
  }

  async reboot() {
    try {
      execSync(`adb -s ${this.udid} reboot`, { stdio: 'ignore' });
    } catch (e) {
      throw new Error(`Failed to reboot: ${e.message}`);
    }
  }

  async takeScreenshot() {
    try {
      const timestamp = Date.now();
      const remotePath = `/sdcard/screenshot-${timestamp}.png`;
      execSync(`adb -s ${this.udid} shell screencap -p ${remotePath}`, { stdio: 'ignore' });
      const { execSync } = require('child_process');
      execSync(`adb -s ${this.udid} pull ${remotePath} ./screenshot-${timestamp}.png`);
      return '';
    } catch (e) {
      throw new Error('Failed to take screenshot');
    }
  }

  async clearAppData(bundleId) {
    try {
      execSync(`adb -s ${this.udid} shell pm clear ${bundleId}`, { stdio: 'ignore' });
    } catch (e) {}
  }
}

module.exports = {
  getAndroidDriver,
  AndroidDriver,
};