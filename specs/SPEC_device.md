# Real Device Management Specification

**Version:** 0.1.0
**TDD Phase:** Device pool management for real device testing
**Status:** Draft

---

## Overview

The device layer manages physical iOS and Android devices for Tier 3 E2E testing. It handles device discovery, pairing, state management, health checks, and cleanup between test runs.

**Core principle:** Tests must run on clean slate devices. A device with leftover app state from a previous test produces unreliable results. Every test run gets a factory-reset device.

---

## Device Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Device Pool Manager                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │  iPhone 14  │  │  Pixel 7    │  │  iPhone 15  │           │
│  │  phone-a    │  │  phone-b    │  │  phone-c    │           │
│  │  available  │  │  in-use     │  │  available  │           │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘           │
│         │                │                │                   │
│         ▼                ▼                ▼                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ device-a    │  │ device-b    │  │ device-c    │           │
│  │ _driver.js  │  │ _driver.js  │  │ _driver.js  │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Device States

```
┌─────────────────────────────────────────────────────────────┐
│                        STATES                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  unknown ──► paired ──► available ──► allocated ──► in-use  │
│    │          │           │             │              │      │
│    │          │           │             │              ▼      │
│    │          │           │             │           running    │
│    │          │           │             │              │      │
│    │          │           │             │              ▼      │
│    │          │           │             └──────────► passed    │
│    │          │           │                              │    │
│    │          │           │              ┌──────────► failed   │
│    │          │           │              │                   │
│    │          │           ▼              │                   │
│    │          │       ┌────────┐        │                   │
│    │          └──────►│error   │◄────────┘                   │
│    │                  └────────┘                             │
│    │                                                       │
│    └────────────────► unknown (disconnected)                │
└─────────────────────────────────────────────────────────────┘
```

| State | Description |
|-------|-------------|
| `unknown` | Device not connected or not detected |
| `paired` | Device connected but not ready for testing |
| `available` | Ready to allocate |
| `allocated` | Assigned to a test run, about to be reset |
| `in-use` | Test run in progress |
| `passed` | Last run passed |
| `failed` | Last run failed |
| `error` | Device had an error (needs attention) |

---

## Device Registry

Stores device info in `~/.mobile-test-suite/devices.json`:

```json
{
  "devices": {
    "phone-a": {
      "id": "phone-a",
      "platform": "ios",
      "name": "iPhone 14 Pro",
      "udid": "00001234-0001234A0001234A",
      "status": "available",
      "lastSeen": "2026-03-30T14:00:00Z",
      "lastRun": "2026-03-30T13:45:00Z",
      "lastResult": "passed",
      "osVersion": "17.4",
      "capabilities": ["faceId", "camera", "gps"],
      "notes": ""
    },
    "phone-b": {
      "id": "phone-b",
      "platform": "android",
      "name": "Pixel 7",
      "udid": "1A2B3C4D5E6F",
      "status": "in-use",
      "lastSeen": "2026-03-30T14:00:00Z",
      "lastRun": "2026-03-30T14:00:00Z",
      "lastResult": "running",
      "osVersion": "14",
      "capabilities": ["fingerprint", "camera", "gps"],
      "notes": ""
    }
  },
  "lastUpdated": "2026-03-30T14:00:00Z"
}
```

---

## CLI Commands

### `mobile-test-suite device list`

List all known devices and their status.

```bash
mobile-test-suite device list [--platform=ios|android|all]
```

**Output:**
```
ID         PLATFORM  STATUS     NAME           OS     LAST RUN         RESULT
phone-a    ios       available  iPhone 14 Pro  17.4   2026-03-30 13:45  passed
phone-b    android   in-use      Pixel 7        14    2026-03-30 14:00  running
phone-c    ios       available  iPhone 15       17.3   2026-03-29 10:30  passed
phone-d    android   error       Galaxy S21      13    2026-03-29 09:00  failed
```

**Exit codes:** 0 always (empty list is not an error).

---

### `mobile-test-suite device pair`

Pair a new device for testing.

```bash
mobile-test-suite device pair --platform=ios --name="My iPhone" [--udid=<udid>]
```

**iOS pairing steps:**
1. Connect device via USB
2. Trust computer on device
3. Run `pair` → detects UDID automatically via `idevice_id -l`
4. Verify pairing with `ideviceinfo -u <udid>`
5. Add to registry with status `paired`

**Android pairing steps:**
1. Enable Developer Mode on device
2. Enable USB Debugging
3. Connect via USB
4. Run `pair` → detects via `adb devices`
5. Add to registry with status `paired`

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | Device paired successfully |
| 1 | Device not found or not connected |
| 2 | Pairing verification failed |
| 3 | Registry update failed |

---

### `mobile-test-suite device reset`

Reset a device to clean state before test run.

```bash
mobile-test-suite device reset <device-id> [--force]
```

**Reset steps:**

**iOS:**
```bash
# 1. Uninstall app
ideviceinstaller -u <udid> -U com.myapp 2>/dev/null || true

# 2. Clear keychain (test accounts)
# Requires: python-imobiledevice or similar
# idevicedebug start -u <udid> com.apple.Preferences  # open settings
# Then reset via Settings app automation

# 3. Disable/enable airplane mode to reset network state
# (via UIAutomation or idevice)

# 4. Confirm clean
ideviceinstaller -u <udid> -l | grep com.myapp && echo "STILL INSTALLED" || echo "CLEAN"
```

**Android:**
```bash
# 1. Uninstall app
adb -s <udid> uninstall com.myapp

# 2. Clear app data (alternative to uninstall)
adb -s <udid> shell pm clear com.myapp

# 3. Kill any background processes
adb -s <udid> shell am kill-all

# 4. Confirm clean
adb -s <udid> shell pm list packages | grep com.myapp && echo "STILL INSTALLED" || echo "CLEAN"
```

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | Reset successful |
| 1 | Device not found |
| 2 | Reset failed |
| 3 | Device not in valid state for reset |

---

### `mobile-test-suite device health`

Check device health and readiness.

```bash
mobile-test-suite device health <device-id>
```

**Health checks:**

| Check | iOS | Android | Threshold |
|-------|-----|---------|-----------|
| Battery | `ideviceinfo --domain com.apple.deviceinfo.BatteryCurrentCapacity` | `adb shell dumpsys battery` | > 20% |
| Storage | `ideviceinfo -u <udid> | grep AvailableStorage` | `adb shell df /data` | > 500MB |
| Screen | Manual or `idevicescreenshot` | `adb shell dumpsys window` | ON/Unlocked |
| Network | Ping test | Ping test | Connected |
| App installed | `ideviceinstaller -u <udid> -l` | `adb shell pm list packages` | Any state OK |

**Output:**
```
Device: phone-a (iPhone 14 Pro)
Status: healthy
Platform: ios
OS Version: 17.4
Battery: 85%
Storage: 12.3 GB free
Screen: ON, unlocked
Network: WiFi connected
Last Health Check: 2026-03-30T14:00:00Z

Issues: none
```

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | Device healthy |
| 1 | Device unhealthy |
| 2 | Device not found |

---

### `device allocate`

Allocate an available device for a test run.

```bash
mobile-test-suite device allocate [--platform=ios|android] [--requirements=<json>]
```

**Requirements format:**
```json
{
  "platform": "ios",
  "minOS": "17.0",
  "capabilities": ["faceId", "camera"]
}
```

**Flow:**
1. Query registry for `available` devices matching requirements
2. Select first match
3. Update status: `available` → `allocated`
4. Execute reset sequence
5. Update status: `allocated` → `in-use`
6. Return device info

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | Device allocated |
| 1 | No matching device available |
| 2 | Reset failed |

---

### `device release`

Release device back to available pool after test run.

```bash
mobile-test-suite device release <device-id> --result=passed|failed
```

**Flow:**
1. Update registry: `in-use` → `passed` or `failed`
2. Update `lastRun` timestamp
3. Run cleanup if needed
4. Update status: → `available`

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | Released successfully |
| 1 | Device not found |
| 2 | Device not in `in-use` state |

---

### `device remove`

Remove device from pool.

```bash
mobile-test-suite device remove <device-id> [--force]
```

**Flow:**
1. If device is `in-use`, reject unless `--force`
2. Remove from registry
3. Optionally: unpair device (future enhancement)

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | Removed successfully |
| 1 | Device not found |
| 2 | Device is in-use, use --force to override |

---

## Device Driver Interface

Each device has a platform-specific driver in `src/drivers/`:

```
src/drivers/
  ├── index.ts           # Unified interface
  ├── ios-driver.ts     # iOS implementation
  ├── android-driver.ts # Android implementation
  └── types.ts          # Driver interface definition
```

**Driver Interface:**
```typescript
interface DeviceDriver {
  // Identification
  getUdid(): Promise<string>;
  getName(): Promise<string>;
  getPlatform(): 'ios' | 'android';
  getOsVersion(): Promise<string>;
  
  // State
  getBatteryLevel(): Promise<number>; // 0-100
  getStorageFree(): Promise<number>;   // bytes
  isScreenOn(): Promise<boolean>;
  isLocked(): Promise<boolean>;
  isConnected(): Promise<boolean>;
  
  // App management
  installApp(appPath: string): Promise<void>;
  uninstallApp(bundleId: string): Promise<void>;
  isAppInstalled(bundleId: string): Promise<boolean>;
  launchApp(bundleId: string, launchArgs?: Record<string, string>): Promise<void>;
  terminateApp(bundleId: string): Promise<void>;
  
  // Device control
  resetDevice(): Promise<void>; // factory reset prep
  reboot(): Promise<void>;
  takeScreenshot(): Promise<Buffer>;
  
  // Cleanup
  clearAppData(bundleId: string): Promise<void>;
  clearKeychain?(): Promise<void>; // iOS only
}
```

---

## Health Monitoring Daemon

A background process monitors device health and marks unavailable devices accordingly.

**Implementation:** Runs as a cron job or systemd service.

```bash
# Check every 60 seconds
*/1 * * * * mobile-test-suite device health --watch --interval=60
```

**Watch mode:**
```bash
mobile-test-suite device health --watch [--interval=<seconds>]
```

**Behavior:**
1. Every `--interval`, check health of all registered devices
2. If device fails health check → mark `error`
3. If device was `error` and now passes → mark `available`
4. If device disconnects (not seen in 5 min) → mark `unknown`
5. Log all state transitions

---

## Automatic Device Discovery

On startup, scan for connected devices:

```bash
#!/bin/bash
# src/scripts/discover-devices.sh

echo "Scanning for connected devices..."

# iOS
for udid in $(idevice_id -l 2>/dev/null); do
  name=$(ideviceinfo -u $udid -k DeviceName 2>/dev/null || echo "Unknown iOS")
  echo "Found iOS device: $name ($udid)"
  # Auto-add to registry if not present
done

# Android
for serial in $(adb devices | grep 'device$' | cut -f1); do
  name=$(adb -s $serial shell getprop ro.product.model 2>/dev/null || echo "Unknown Android")
  echo "Found Android device: $name ($serial)"
  # Auto-add to registry if not present
done
```

---

## Test Execution Integration

The test executor calls device management as part of Tier 3:

```typescript
async function runTier3Tests(tier3Tests: string[], config: Config) {
  // 1. Allocate device
  const device = await deviceManager.allocate({
    platform: config.platform,
    requirements: config.requirements,
  });
  
  try {
    // 2. Build app (if needed)
    await buildApp(device);
    
    // 3. Install app
    await device.installApp(config.appPath);
    
    // 4. Run Detox
    await detox.run({ device, tests: tier3Tests });
    
    // 5. Report results
    return { success: true, device };
  } catch (error) {
    return { success: false, device, error };
  } finally {
    // 6. Always release
    const result = error ? 'failed' : 'passed';
    await deviceManager.release(device.id, result);
  }
}
```

---

## Error Handling

| Error | Detection | Recovery |
|-------|-----------|----------|
| Device disconnects mid-test | `device.isConnected()` returns false | Abort run, mark device `unknown` |
| App crash during test | Detox detects crash | Capture screenshot, mark run failed |
| Device out of battery | Health check < 20% | Mark `error`, don't allocate |
| Install fails | `installApp()` throws | Retry once, then fail run |
| Detox server dies | Health check | Restart server, retry test |

---

## Device Pool Sizing

For CI/CD, recommended pool size:

| Team Size | Concurrent Runs | Recommended Devices |
|-----------|----------------|---------------------|
| 1 developer | 1 | 1 iOS + 1 Android |
| 2-5 devs | 2-3 | 2 iOS + 2 Android |
| 5-10 devs | 3-5 | 3 iOS + 3 Android |

**Note:** Real devices are expensive and limited. Consider device farm services (BrowserStack, LambdaTest) for parallel runs beyond 3-4 devices.

---

## Remote Device Support (Future)

For remote device farms, the driver interface remains the same but implementations differ:

| Provider | Implementation |
|----------|----------------|
| BrowserStack | `drivers/browserstack-driver.ts` |
| LambdaTest | `drivers/lamdatest-driver.ts` |
| Sauce Labs | `drivers/saucelabs-driver.ts` |

**Interface remains:**
```typescript
interface RemoteDeviceDriver extends DeviceDriver {
  getDeviceFromCloud(): Promise<RemoteDeviceHandle>;
  releaseToCloud(handle: RemoteDeviceHandle): Promise<void>;
}
```
