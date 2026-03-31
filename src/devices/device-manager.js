/**
 * Device Manager
 * Manages device discovery, pairing, and state
 */

const fs = require('fs');
const { getDeviceRegistryPath, ensureHomeDir } = require('../config/loader');

const DeviceState = {
  UNKNOWN: 'unknown',
  PAIRED: 'paired',
  AVAILABLE: 'available',
  ALLOCATED: 'allocated',
  IN_USE: 'in-use',
  PASSED: 'passed',
  FAILED: 'failed',
  ERROR: 'error',
};

function loadRegistry() {
  const registryPath = getDeviceRegistryPath();

  if (!fs.existsSync(registryPath)) {
    return { devices: {}, lastUpdated: new Date().toISOString() };
  }

  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  } catch (e) {
    return { devices: {}, lastUpdated: new Date().toISOString() };
  }
}

function saveRegistry(registry) {
  ensureHomeDir();
  const registryPath = getDeviceRegistryPath();
  registry.lastUpdated = new Date().toISOString();
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

async function listDevices(platform = 'all') {
  const registry = loadRegistry();
  let devices = Object.values(registry.devices);

  if (platform !== 'all') {
    devices = devices.filter((d) => d.platform === platform);
  }

  return devices.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
}

async function pairDevice(platform, name, udid) {
  let deviceUdid = udid;
  let deviceName = name;

  if (!deviceUdid) {
    if (platform === 'ios') {
      const detected = await detectIosDevice();
      if (!detected) {
        throw new Error('No iOS devices found. Connect a device via USB and trust this computer.');
      }
      deviceUdid = detected.udid;
      deviceName = detected.name;
    } else {
      const detected = await detectAndroidDevice();
      if (!detected) {
        throw new Error('No Android devices found. Enable USB debugging and connect device.');
      }
      deviceUdid = detected.udid;
      deviceName = detected.name;
    }
  }

  if (!deviceName) {
    deviceName = platform === 'ios' ? 'iOS Device' : 'Android Device';
  }

  const registry = loadRegistry();
  const existing = Object.values(registry.devices).find((d) => d.udid === deviceUdid);

  if (existing) {
    existing.status = DeviceState.AVAILABLE;
    existing.lastSeen = new Date().toISOString();
    saveRegistry(registry);
    return existing;
  }

  let osVersion = 'unknown';
  let capabilities = [];

  try {
    if (platform === 'ios') {
      const info = await getIosDeviceInfo(deviceUdid);
      osVersion = info.osVersion;
      capabilities = info.capabilities || [];
    } else {
      const info = await getAndroidDeviceInfo(deviceUdid);
      osVersion = info.osVersion;
      capabilities = info.capabilities || [];
    }
  } catch (e) {
    // OS version detection failed, using default
  }

  const deviceId = `device-${Date.now()}`;
  const device = {
    id: deviceId,
    platform,
    name: deviceName,
    udid: deviceUdid,
    status: DeviceState.AVAILABLE,
    lastSeen: new Date().toISOString(),
    lastRun: null,
    lastResult: null,
    osVersion,
    capabilities,
    notes: '',
  };

  registry.devices[deviceId] = device;
  saveRegistry(registry);

  return device;
}

async function detectIosDevice() {
  try {
    const { execSync } = require('child_process');
    const output = execSync('idevice_id -l', { encoding: 'utf-8' });
    const udid = output.trim().split('\n')[0];

    if (!udid) return null;

    const nameOutput = execSync(`ideviceinfo -u ${udid} -k DeviceName`, { encoding: 'utf-8' });
    return { udid, name: nameOutput.trim() };
  } catch (e) {
    return null;
  }
}

async function detectAndroidDevice() {
  try {
    const { execSync } = require('child_process');
    const output = execSync('adb devices', { encoding: 'utf-8' });
    const lines = output.split('\n').filter((l) => l.includes('\tdevice'));

    if (lines.length === 0) return null;

    const udid = lines[0].split('\t')[0];
    const nameOutput = execSync(`adb -s ${udid} shell getprop ro.product.model`, { encoding: 'utf-8' });

    return { udid, name: nameOutput.trim() };
  } catch (e) {
    return null;
  }
}

async function getIosDeviceInfo(udid) {
  try {
    const { execSync } = require('child_process');

    const modelOutput = execSync(`ideviceinfo -u ${udid} -k ModelNumber`, { encoding: 'utf-8' });
    const versionOutput = execSync(`ideviceinfo -u ${udid} -k SoftwareVersion`, { encoding: 'utf-8' });

    return {
      name: modelOutput.trim(),
      osVersion: versionOutput.trim(),
      capabilities: ['camera', 'faceId'],
    };
  } catch (e) {
    return { osVersion: 'unknown', capabilities: [] };
  }
}

async function getAndroidDeviceInfo(udid) {
  try {
    const { execSync } = require('child_process');

    const versionOutput = execSync(`adb -s ${udid} shell getprop ro.build.version.release`, { encoding: 'utf-8' });
    const modelOutput = execSync(`adb -s ${udid} shell getprop ro.product.model`, { encoding: 'utf-8' });

    return {
      name: modelOutput.trim(),
      osVersion: versionOutput.trim(),
      capabilities: ['camera', 'fingerprint'],
    };
  } catch (e) {
    return { osVersion: 'unknown', capabilities: [] };
  }
}

async function resetDevice(deviceId, force = false) {
  const registry = loadRegistry();
  const device = registry.devices[deviceId];

  if (!device) {
    throw new Error(`Device not found: ${deviceId}`);
  }

  if (!force && device.status === DeviceState.IN_USE) {
    throw new Error('Device is in use. Use --force to override.');
  }

  if (device.platform === 'ios') {
    await resetIosDevice(device.udid);
  } else {
    await resetAndroidDevice(device.udid);
  }

  device.status = DeviceState.AVAILABLE;
  device.lastSeen = new Date().toISOString();
  saveRegistry(registry);

  return device;
}

async function resetIosDevice(udid) {
  try {
    const { execSync } = require('child_process');
    execSync(`ideviceinstaller -u ${udid} -U com.myapp 2>/dev/null || true`, { stdio: 'ignore' });
  } catch (e) {
    // OS version detection failed, using default
  }
}

async function resetAndroidDevice(udid) {
  try {
    const { execSync } = require('child_process');
    execSync(`adb -s ${udid} shell pm clear com.myapp 2>/dev/null || true`, { stdio: 'ignore' });
    execSync(`adb -s ${udid} shell am kill-all 2>/dev/null || true`, { stdio: 'ignore' });
  } catch (e) {
    // OS version detection failed, using default
  }
}

async function healthCheck(deviceId) {
  const registry = loadRegistry();
  const device = registry.devices[deviceId];

  if (!device) {
    throw new Error(`Device not found: ${deviceId}`);
  }

  let health;

  if (device.platform === 'ios') {
    health = await getIosHealth(device.udid);
  } else {
    health = await getAndroidHealth(device.udid);
  }

  const issues = [];
  if (health.battery < 20) issues.push(`Low battery: ${health.battery}%`);
  if (health.storageFree < 500 * 1024 * 1024) issues.push(`Low storage: ${(health.storageFree / 1024 / 1024).toFixed(1)}MB free`);
  if (!health.screenOn) issues.push('Screen is off');
  if (!health.networkConnected) issues.push('Network disconnected');

  return {
    device,
    healthy: issues.length === 0,
    timestamp: new Date().toISOString(),
    ...health,
    issues,
  };
}

async function getIosHealth(udid) {
  try {
    const { execSync } = require('child_process');

    let battery = 100;
    try {
      const batteryOutput = execSync(`ideviceinfo -u ${udid} -k com.apple.deviceinfo.BatteryCurrentCapacity`, { encoding: 'utf-8' });
      battery = parseInt(batteryOutput.trim()) || 100;
    } catch (e) {
    // OS version detection failed, using default
  }

    const storageFree = 10 * 1024 * 1024 * 1024;
    const screenOn = true;
    const networkConnected = true;

    return { battery, storageFree, screenOn, locked: false, networkConnected };
  } catch (e) {
    return { battery: 100, storageFree: 10 * 1024 * 1024 * 1024, screenOn: true, locked: false, networkConnected: true };
  }
}

async function getAndroidHealth(udid) {
  try {
    const { execSync } = require('child_process');

    let battery = 100;
    try {
      const batteryOutput = execSync(`adb -s ${udid} shell dumpsys battery | grep level`, { encoding: 'utf-8' });
      const match = batteryOutput.match(/level:\s*(\d+)/);
      battery = match ? parseInt(match[1]) : 100;
    } catch (e) {
    // OS version detection failed, using default
  }

    const storageFree = 10 * 1024 * 1024 * 1024;

    let screenOn = true;
    try {
      const screenOutput = execSync(`adb -s ${udid} shell dumpsys window | grep mScreenOn`, { encoding: 'utf-8' });
      screenOn = screenOutput.includes('mScreenOn=true');
    } catch (e) {
    // OS version detection failed, using default
  }

    let networkConnected = true;
    try {
      execSync(`adb -s ${udid} shell ping -c 1 8.8.8.8`, { stdio: 'ignore' });
    } catch (e) {
      networkConnected = false;
    }

    return { battery, storageFree, screenOn, locked: false, networkConnected };
  } catch (e) {
    return { battery: 100, storageFree: 10 * 1024 * 1024 * 1024, screenOn: true, locked: false, networkConnected: true };
  }
}

async function removeDevice(deviceId, force = false) {
  const registry = loadRegistry();
  const device = registry.devices[deviceId];

  if (!device) {
    throw new Error(`Device not found: ${deviceId}`);
  }

  if (!force && device.status === DeviceState.IN_USE) {
    throw new Error('Device is in use. Use --force to override.');
  }

  delete registry.devices[deviceId];
  saveRegistry(registry);

  return true;
}

async function allocateDevice(requirements = {}) {
  const registry = loadRegistry();

  let candidates = Object.values(registry.devices).filter(
    (d) => d.status === DeviceState.AVAILABLE
  );

  if (requirements.platform) {
    candidates = candidates.filter((d) => d.platform === requirements.platform);
  }

  if (candidates.length === 0) {
    await discoverDevices();

    const newRegistry = loadRegistry();
    candidates = Object.values(newRegistry.devices).filter(
      (d) => d.status === DeviceState.AVAILABLE
    );

    if (requirements.platform) {
      candidates = candidates.filter((d) => d.platform === requirements.platform);
    }
  }

  if (candidates.length === 0) {
    throw new Error('No devices available. Pair a device first with: mobile-test-suite device pair');
  }

  const device = candidates[0];
  device.status = DeviceState.IN_USE;
  device.lastSeen = new Date().toISOString();

  saveRegistry(registry);

  return device;
}

async function releaseDevice(deviceId, result = 'passed') {
  const registry = loadRegistry();
  const device = registry.devices[deviceId];

  if (!device) {
    throw new Error(`Device not found: ${deviceId}`);
  }

  if (device.status !== DeviceState.IN_USE) {
    throw new Error(`Device ${deviceId} is not in use`);
  }

  device.status = result === 'passed' ? DeviceState.PASSED : DeviceState.FAILED;
  device.lastRun = new Date().toISOString();
  device.lastResult = result;
  device.lastSeen = new Date().toISOString();

  setTimeout(() => {
    const currentRegistry = loadRegistry();
    if (currentRegistry.devices[deviceId]) {
      currentRegistry.devices[deviceId].status = DeviceState.AVAILABLE;
      saveRegistry(currentRegistry);
    }
  }, 5000);

  saveRegistry(registry);

  return device;
}

async function discoverDevices() {
  try {
    const iosDevice = await detectIosDevice();
    if (iosDevice) {
      console.log(`Discovered iOS device: ${iosDevice.name}. Run 'device pair' to add to pool.`);
    }
  } catch (e) {
    // OS version detection failed, using default
  }

  try {
    const androidDevice = await detectAndroidDevice();
    if (androidDevice) {
      console.log(`Discovered Android device: ${androidDevice.name}. Run 'device pair' to add to pool.`);
    }
  } catch (e) {
    // OS version detection failed, using default
  }
}

module.exports = {
  DeviceState,
  listDevices,
  pairDevice,
  resetDevice,
  healthCheck,
  removeDevice,
  allocateDevice,
  releaseDevice,
  discoverDevices,
};