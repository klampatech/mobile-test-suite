# Project Integration Specification

**Version:** 0.1.0
**TDD Phase:** Project setup, integration, and usage
**Status:** Draft

---

## Overview

This spec covers how to integrate the mobile test suite into a new or existing React Native project (Expo or bare CLI). It defines the project structure, initialization process, and how the suite works within Ralph and GasTown orchestration.

---

## Quick Start

### 1. Initialize Project

```bash
# Create new Expo project
npx create-expo-app MyApp
cd MyApp

# Or use existing project
cd existing-app

# Initialize test suite
npx @mobile-test-suite/cli init --expo --install
```

### 2. Create First Spec

```bash
mkdir -p specs
cat > specs/login.md << 'EOF'
# Feature: User Login

## Requirements

### REQ-001: Email Password Authentication
**Priority:** must-have

**Given** the user is on the login screen  
**When** they enter valid email "user@example.com" and password "Password123"  
**Then** they are redirected to the home screen  

Edge Cases:
- Empty email → validation error
- Invalid email format → "Invalid email" message
- Wrong password → "Incorrect password" message

Test Scenarios:
- `TC-001` Happy path login
- `TC-002` Invalid email validation
- `TC-003` Wrong password
EOF
```

### 3. Generate Tests

```bash
mobile-test-suite generate --spec=specs/login.md --output=tests
```

### 4. Run Tests

```bash
# Fast feedback (Tier 1 + 2 only)
mobile-test-suite test --tier=1,2

# Full suite (requires device for Tier 3)
mobile-test-suite test --tier=all
```

---

## Project Structure

After `mobile-test-suite init`, your project looks like:

```
my-react-native-app/
├── specs/                          # Requirement specs (user-created)
│   ├── login.md
│   ├── checkout.md
│   └── profile.md
├── tests/                          # Generated + manual tests
│   ├── tier1/                     # Jest unit tests (~10s)
│   │   ├── login/
│   │   │   ├── auth-logic.test.ts
│   │   │   └── auth-logic.test.ts.snap
│   │   └── checkout/
│   ├── tier2/                     # RNTL component tests (~30s)
│   │   ├── login/
│   │   │   └── LoginScreen.test.tsx
│   │   └── checkout/
│   └── tier3/                     # Detox E2E on real device (~5min)
│       ├── login/
│       │   └── LoginFlow.spec.ts
│       └── detox/
│           ├── config.js
│           └── environment.js
├── src/                            # Your app source
│   ├── screens/
│   │   └── LoginScreen.tsx
│   ├── auth/
│   │   ├── login.ts
│   │   └── validation.ts
│   └── api/
│       └── client.ts
├── mobile-test-suite.config.js     # Suite configuration
├── jest.config.js                  # Jest config (all tiers)
├── jest.setup.js                   # Jest mocks
├── detox.config.js                 # Detox E2E config
└── package.json
```

---

## Expo vs Bare CLI Differences

### Expo Managed Workflow

| Aspect | Expo Behavior |
|--------|--------------|
| Prebuild required | Run `npx expo prebuild` before native builds |
| Native code access | Limited until prebuild |
| Detox setup | After prebuild: `npx expo run:ios --device` |
| TestID injection | Use `testID` prop directly in components |
| Navigation | Works with Expo Router or React Navigation |

**Expo init:**
```bash
npx @mobile-test-suite/cli init --expo --install
cd ios && npx expo prebuild
```

### Bare React Native CLI

| Aspect | Bare CLI Behavior |
|--------|------------------|
| Full native access | Yes, from day 1 |
| Native module install | Direct `npm install`, no prebuild |
| Detox setup | Direct `npx detox build` |
| CocoaPods | Run `pod install` after adding native deps |

**Bare CLI init:**
```bash
npx @mobile-test-suite/cli init --cli --install
```

---

## Configuration Files

### `mobile-test-suite.config.js`

```javascript
module.exports = {
  // Project type
  projectType: 'expo', // or 'cli'

  // Directories
  testDir: './tests',
  specDir: './specs',
  outputDir: './test-results',

  // App identification
  app: {
    name: 'MyApp',
    bundleId: 'com.myapp',
    androidPackage: 'com.myapp',
  },

  // LLM for test generation
  llm: {
    provider: process.env.LLM_PROVIDER || 'anthropic',
    model: process.env.LLM_MODEL || 'claude-sonnet-4',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },

  // Device pool
  devices: {
    defaultPlatform: 'ios',
    defaultTimeout: 30000,
    retryAttempts: 2,
  },

  // Tiers
  tiers: {
    1: {
      enabled: true,
      runner: 'jest',
      testMatch: ['**/tier1/**/*.test.ts'],
    },
    2: {
      enabled: true,
      runner: 'jest',
      testMatch: ['**/tier2/**/*.test.tsx'],
    },
    3: {
      enabled: true,
      runner: 'detox',
      testMatch: ['**/tier3/**/*.spec.ts'],
      buildBeforeTest: true,
    },
  },

  // Notifications
  notifications: {
    onFailure: {
      slack: {
        enabled: false,
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: '#mobile-tests',
      },
    },
  },

  // Retention
  retention: {
    maxRuns: 100,
    maxAge: '30d',
    keepFlakyRuns: true,
    keepFailedRuns: true,
  },
};
```

### `jest.config.js`

```javascript
module.exports = {
  // Single config for both Tier 1 and Tier 2
  preset: 'react-native',
  
  testEnvironment: 'node',
  
  testMatch: [
    '**/tests/tier1/**/*.test.ts',
    '**/tests/tier2/**/*.test.tsx',
  ],
  
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
      },
    }],
  },
  
  moduleNameMapper: {
    '^react-native$': '<rootDir>/tests/__mocks__/react-native.js',
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/tests/__mocks__/async-storage.js',
  },
  
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.ts',
  ],
  
  clearMocks: true,
  resetMocks: true,
  
  testTimeout: 10000,
};
```

### `tests/setup.ts`

```typescript
// Jest setup file for all tiers

// Mock NativeAnimatedHelper (Tier 2 pain point)
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({
  shouldUseNativeDriver: jest.fn(() => false),
  default: {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

// Mock AsyncStorage globally
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
}));

// Mock navigation (Tier 2)
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    reset: jest.fn(),
  }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
}));

// Silence console warnings during tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Animated: `useNativeDriver`')
  ) {
    return;
  }
  originalWarn.apply(console, args);
};
```

### `detox.config.js`

```javascript
/** @type {Detox.DetoxConfig} */
module.exports = {
  testEnvironment: './tests/e2e-environment.js',

  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/MyApp.app',
      build: 'xcodebuild -workspace ios/MyApp.xcworkspace -scheme MyApp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/MyApp.app',
      build: 'xcodebuild -workspace ios/MyApp.xcworkspace -scheme MyApp -configuration Release -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest && cd ..',
    },
  },

  configurations: {
    'ios.sim': {
      device: 'iPhone 15',
      apps: ['ios.debug'],
    },
    'ios.device': {
      device: {
        type: 'physical',
      },
      apps: ['ios.debug'],
    },
    'android.attached': {
      device: {
        type: 'android.attached',
      },
      apps: ['android.debug'],
    },
  },
};
```

---

## TestID Convention

Tests need `testID` props to locate elements. Document your convention:

### Required testIDs Per Screen

| Screen | testID | Description |
|--------|--------|-------------|
| LoginScreen | `login-screen` | Root container |
| LoginScreen | `input-email` | Email input field |
| LoginScreen | `input-password` | Password input field |
| LoginScreen | `btn-login` | Submit button |
| LoginScreen | `error-message` | Error display |
| LoginScreen | `loading-indicator` | Loading spinner |
| HomeScreen | `home-screen` | Root container |
| HomeScreen | `welcome-text` | Welcome message |

### Naming Convention

```
{screen}-{element}-{variant}

Examples:
- login-input-email
- login-btn-submit
- home-nav-profile
- checkout-btn-pay
```

---

## Ralph Loop Integration

### Setup in Ralph Rig

Add to `AGENTS.md`:

```markdown
## Mobile Test Commands

# Run fast tests (Tier 1 + 2)
mobile-test-suite test --tier=1,2

# Run full suite (requires paired device)
mobile-test-suite test --tier=all

# Generate tests from spec
mobile-test-suite generate --spec=specs/<feature>.md --output=tests

# List devices
mobile-test-suite device list

# Run report
mobile-test-suite report
```

### Modified `PROMPT_build.md` for Mobile

```markdown
0a. Study `specs/*` with up to 500 parallel Sonnet subagents to learn the application specifications.
0b. Study @IMPLEMENTATION_PLAN.md.
0c. For reference, the application source code is in `src/*`.

1. Your task is to implement functionality per the specifications using parallel subagents. Follow @IMPLEMENTATION_PLAN.md and choose the most important item to address. Before making changes, search the codebase (don't assume not implemented) using Sonnet subagents.

2. After implementing functionality or resolving problems, run the tests:
   - Tier 1+2: `mobile-test-suite test --tier=1,2 --stop-on-fail`
   - If Tier 1+2 pass, run Tier 3: `mobile-test-suite test --tier=3`
   - If functionality is missing then add tests via `mobile-test-suite generate --spec=specs/<feature>.md --output=tests`

3. When you discover issues, immediately update @IMPLEMENTATION_PLAN.md with your findings.

4. When tests pass, update @IMPLEMENTATION_PLAN.md, then `git add -A` then `git commit` with a message describing the changes.

9999999. As soon as there are no build or test errors create a git tag.
```

---

## GasTown Integration

### As a Polecat (Worker Agent)

Create a `mobile-test-rig` configuration in GasTown:

```bash
gt crew add mobile-test-rig --rig=<project>
```

The polecat can then:
```bash
# Get assigned a bead (test spec)
gt mail inbox
# "Write tests for login spec: specs/login.md"

# Generate tests
mobile-test-suite generate --spec=specs/login.md --output=tests

# Run tests
mobile-test-suite test --tier=all --stop-on-fail

# Report back via bead
bd update <bead-id> --status=resolved --result="$(cat test-results/last/summary.json)"
```

### As a Convoy (Test Suite)

```bash
# Create beads for each spec
bd create --title="Login flow tests" --type=feature
bd create --title="Checkout flow tests" --type=feature
bd create --title="Profile tests" --type=feature

# Create convoy
gt convoy create "Full regression" gt-abc1 gt-abc2 gt-abc3

# Assign to mobile-test polecat
gt sling gt-abc1 mobile-test-rig
gt sling gt-abc2 mobile-test-rig
```

### Device Pool via GasTown

GasTown's device pool could be a separate rig:

```bash
gt rig add device-pool ~/device-pool
cd ~/device-pool
mkdir -p devices
# Store device registry as files
echo '{"id":"phone-a","platform":"ios","status":"available"}' > devices/phone-a.json
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Mobile Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup iOS Device
        run: |
          # Connect to device farm or start simulator
          # For cloud: setup BrowserStack/LambdaTest credentials
          echo "DEVICE_ID=${{ secrets.IOS_DEVICE_ID }}" >> $GITHUB_ENV

      - name: Install Dependencies
        run: npm ci

      - name: Generate Tests
        run: mobile-test-suite generate --spec=specs/*.md --output=tests

      - name: Run Tier 1+2 Tests
        run: mobile-test-suite test --tier=1,2 --format=json --output=tier1-2-results.json

      - name: Run Tier 3 Tests
        run: mobile-test-suite test --tier=3 --format=json --output=tier3-results.json
        env:
          DEVICE_ID: ${{ secrets.IOS_DEVICE_ID }}

      - name: Upload Results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: test-results/

      - name: Upload Screenshots on Failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: failure-screenshots
          path: test-results/**/screenshots/*.png
```

### Local Development

```bash
# Watch mode for rapid iteration
npx jest --watch --testPathPattern=tier1

# Single spec
mobile-test-suite generate --spec=specs/login.md --output=tests
mobile-test-suite test --tier=1 --watch

# Debug specific test
npx jest --testPathPattern=login --verbose

# Debug Tier 3 on specific device
npx detox test --configuration ios.device --device-id phone-a --loglevel trace
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `AsyncStorage not mocked` | Missing jest mock | Add to `tests/setup.ts` |
| `NativeAnimatedHelper` warnings | Mock in setup | Already mocked |
| Detox can't find app | Wrong binaryPath | Update `detox.config.js` |
| Device not paired | USB debugging off | Enable in developer settings |
| `idevice_id: no devices found` | iOS tools not installed | `brew install ideviceinstaller` |
| `adb: no devices found` | USB debugging off | Enable in developer settings |
| Jest can't find modules | ts-jest config | Check `tsconfig.test.json` |

### Device Not Detected (iOS)

```bash
# Install tools
brew install ideviceinstaller ios-deploy

# List devices
idevice_id -l

# Get device info
ideviceinfo -u <udid>
```

### Device Not Detected (Android)

```bash
# Enable USB debugging on device
# Check connection
adb devices

# Restart ADB if needed
adb kill-server && adb start-server
```

---

## Maintenance

### Updating Dependencies

```bash
# Update test suite
npm install @mobile-test-suite/cli@latest

# Update Jest
npm install --save-dev jest@latest @testing-library/react-native@latest

# Update Detox
npm install --save-dev detox@latest
```

### Cleaning Up Test Artifacts

```bash
# Remove old test results
mobile-test-suite clean --results --older-than=30d

# Reset device state
mobile-test-suite device reset --all

# Full cleanup (⚠️ removes everything)
mobile-test-suite clean --all
```

---

## File Tree (Complete)

```
my-react-native-app/
├── SPEC.md                        # This suite's specs
│
├── specs/                         # Your requirement specs
│   ├── login.md
│   ├── checkout.md
│   └── profile.md
│
├── tests/                         # Generated + manual tests
│   ├── __mocks__/
│   │   ├── react-native.js
│   │   └── async-storage.js
│   ├── setup.ts                   # Jest setup
│   ├── e2e-environment.js          # Detox environment
│   ├── tier1/
│   │   └── <feature>/
│   │       └── *.test.ts
│   ├── tier2/
│   │   └── <feature>/
│   │       └── *.test.tsx
│   └── tier3/
│       └── <feature>/
│           └── *.spec.ts
│
├── src/                           # Your app
│
├── test-results/                  # Generated test results
│   └── <run-id>/
│
├── mobile-test-suite.config.js    # Suite configuration
├── jest.config.js
├── tsconfig.test.json
└── detox.config.js
```
