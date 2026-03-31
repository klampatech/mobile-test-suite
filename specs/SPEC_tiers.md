# Tiered Test Execution Specification

**Version:** 0.1.0
**TDD Phase:** Test execution across three tiers
**Status:** Draft

---

## Overview

Tests execute in three tiers, from fastest/cheapest to slowest/most-realistic. Each tier has a specific purpose and failure at any tier stops the flow (configurable).

**Core principle:** Fast feedback first. Tier 1 runs in seconds. Tier 3 runs on real devices and takes minutes. Fail fast at cheap tiers to avoid wasting device time.

---

## Tier Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ TIER 1: Jest (Unit/Logic)              Runtime: ~10-30s    │
├─────────────────────────────────────────────────────────────┤
│ What: Business logic, pure functions, state machines        │
│ Mocks: Everything external (API, storage, native modules)   │
│ Location: tests/tier1/<feature>/*.test.ts                  │
│ Run: npx jest --config=jest.config.js --testPathPattern=tier1 │
├─────────────────────────────────────────────────────────────┤
│ TIER 2: React Native Testing Library (Component)  ~30-60s  │
├─────────────────────────────────────────────────────────────┤
│ What: Component behavior, user interactions, state updates │
│ Mocks: Native modules (animated, vibration, etc.)          │
│ Location: tests/tier2/<feature>/*.test.tsx                 │
│ Run: npx jest --config=jest.config.js --testPathPattern=tier2 │
├─────────────────────────────────────────────────────────────┤
│ TIER 3: Detox (E2E Real Device)                 ~2-5 min   │
├─────────────────────────────────────────────────────────────┤
│ What: Full user flows, gestures, real API calls            │
│ Mocks: NOTHING - real device, real app                     │
│ Location: tests/tier3/<feature>/*.spec.ts                   │
│ Run: npx detox test --config=detox.config.js               │
└─────────────────────────────────────────────────────────────┘
```

---

## Tier 1: Jest Unit Tests

### Purpose
- Validate business logic in isolation
- No React Native components
- No device required
- Runs on CI and developer machines

### What to Test
- Pure functions (validation, formatting, transformation)
- State machines (auth state, form state, navigation state)
- API client logic (request formatting, error handling)
- Storage read/write logic (without actual storage)
- Error handling branches

### What NOT to Test
- React components (→ Tier 2)
- UI rendering (→ Tier 2)
- Native module behavior (→ Tier 2)
- Real network calls (→ Tier 3)
- Device-specific behavior (→ Tier 3)

### Jest Configuration

`jest.config.js`:
```javascript
module.exports = {
  preset: 'react-native',
  testEnvironment: 'node', // No JSDOM - pure logic only
  
  testMatch: ['**/tests/tier1/**/*.test.ts'],
  
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Transform ignore - no babel for simple TS files
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  
  // Mock all React Native
  moduleNameMapper: {
    '^react-native$': '<rootDir>/tests/__mocks__/react-native.js',
  },
  
  // Coverage
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  
  // Timeout
  testTimeout: 10000,
};
```

### Mock: React Native (`tests/__mocks__/react-native.js`)

```javascript
module.exports = {
  // Storage
  AsyncStorage: {
    setItem: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(() => Promise.resolve(null)),
    removeItem: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
  },
  
  // Platform
  Platform: {
    OS: 'ios',
    select: jest.fn((obj) => obj.ios || obj.default),
  },
  
  // No-op for components we don't use
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  TextInput: 'TextInput',
  
  // Vibration
  Vibration: { vibrate: jest.fn() },
  
  // Alert
  Alert: { alert: jest.fn() },
  
  // Animated
  Animated: {
    View: 'Animated.View',
    Text: 'Animated.Text',
    Value: jest.fn(),
    timing: jest.fn(() => ({ start: jest.fn() })),
  },
  
  // Native helpers
  NativeModules: {},
  NativeEventEmitter: jest.fn(),
};
```

### Example Tier 1 Test

`tests/tier1/auth/login-logic.test.ts`:
```typescript
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock react-native
jest.mock('react-native', () => require('./__mocks__/react-native'));

// Import pure functions under test
import { 
  validateEmail, 
  validatePassword,
  sanitizeInput,
  AuthError 
} from '../../../src/auth/validation';

describe('Email Validation', () => {
  test('should return false for empty string', () => {
    expect(validateEmail('')).toBe(false);
  });

  test('should return false for invalid email formats', () => {
    expect(validateEmail('notanemail')).toBe(false);
    expect(validateEmail('missing@domain')).toBe(false);
    expect(validateEmail('@noname.com')).toBe(false);
    expect(validateEmail('spaces in@email.com')).toBe(false);
  });

  test('should return true for valid emails', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('test.user+tag@domain.co.uk')).toBe(true);
  });
});

describe('Password Validation', () => {
  test('should return false for passwords shorter than 8 chars', () => {
    expect(validatePassword('Short1!')).toBe(false);
    expect(validatePassword('')).toBe(false);
  });

  test('should return false for passwords without numbers', () => {
    expect(validatePassword('NoNumbers!')).toBe(false);
  });

  test('should return false for passwords without uppercase', () => {
    expect(validatePassword('nouppper1!')).toBe(false);
  });

  test('should return true for valid passwords', () => {
    expect(validatePassword('ValidPass1!')).toBe(true);
  });
});

describe('AuthError', () => {
  test('should categorize INVALID_EMAIL', () => {
    const error = new AuthError('INVALID_EMAIL');
    expect(error.code).toBe('INVALID_EMAIL');
    expect(error.userMessage).toBe('Please enter a valid email address');
  });

  test('should categorize WRONG_PASSWORD', () => {
    const error = new AuthError('WRONG_PASSWORD');
    expect(error.code).toBe('WRONG_PASSWORD');
    expect(error.userMessage).toBe('Incorrect password');
  });

  test('should categorize ACCOUNT_LOCKED', () => {
    const error = new AuthError('ACCOUNT_LOCKED');
    expect(error.code).toBe('ACCOUNT_LOCKED');
    expect(error.userMessage).toBe('Account temporarily locked. Try again later.');
  });
});
```

### Running Tier 1

```bash
# Run all tier 1 tests
npx jest --testPathPattern=tier1

# Run specific feature
npx jest --testPathPattern=tier1/auth

# With coverage
npx jest --testPathPattern=tier1 --coverage

# Watch mode (dev)
npx jest --testPathPattern=tier1 --watch
```

---

## Tier 2: React Native Testing Library

### Purpose
- Validate component behavior
- Test interactions (press, type, swipe)
- Verify state updates on user actions
- Mock native modules but render real components

### What to Test
- Component renders correctly given props
- User interactions trigger correct callbacks
- Navigation calls with correct params
- Form validation and submission
- Loading/error states
- Conditional rendering

### What NOT to Test
- Pure logic (→ Tier 1)
- Real device gestures (→ Tier 3)
- Real network calls (→ Tier 3)
- Native module behavior (→ Tier 3)

### RNTL Configuration

`jest.config.js` (additions for Tier 2):
```javascript
module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  
  testMatch: ['**/tests/tier2/**/*.test.tsx'],
  
  // RNTL needs JSX transform
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { 
      tsconfig: 'tsconfig.test.json',
      babelConfig: true,
    }],
  },
  
  // Mock native animated (common pain point)
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};
```

`tests/setup.ts`:
```typescript
import '@testing-library/react-native/extend-expect';

// Mock NativeAnimatedHelper
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({
  shouldUseNativeDriver: jest.fn(() => false),
  default: {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

// Mock navigation
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
  createNavigationContainer: jest.fn((c) => c),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));
```

### Example Tier 2 Test

`tests/tier2/auth/LoginScreen.test.tsx`:
```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginScreen } from '../../../src/screens/LoginScreen';
import { NavigationContainer } from '@react-navigation/native';

const renderWithNavigation = (component: React.ReactElement) => {
  return render(
    <NavigationContainer>
      {component}
    </NavigationContainer>
  );
};

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    test('should render email and password inputs', () => {
      const { getByTestId } = renderWithNavigation(<LoginScreen />);
      
      expect(getByTestId('input-email')).toBeTruthy();
      expect(getByTestId('input-password')).toBeTruthy();
      expect(getByTestId('btn-login')).toBeTruthy();
    });

    test('should render error message container (hidden)', () => {
      const { queryByTestId } = renderWithNavigation(<LoginScreen />);
      
      // Error container exists but is hidden
      expect(queryByTestId('error-message')).toBeTruthy();
    });
  });

  describe('User Interactions', () => {
    test('TC-002: should show error for invalid email on blur', async () => {
      const { getByTestId, findByTestId } = renderWithNavigation(<LoginScreen />);
      
      const emailInput = getByTestId('input-email');
      
      fireEvent.changeText(emailInput, 'invalid-email');
      fireEvent(emailInput, 'blur');
      
      const errorMessage = await findByTestId('error-message');
      expect(errorMessage.props.children).toContain('valid email');
    });

    test('TC-001: should enable login button when form is valid', async () => {
      const { getByTestId } = renderWithNavigation(<LoginScreen />);
      
      const emailInput = getByTestId('input-email');
      const passwordInput = getByTestId('input-password');
      const loginButton = getByTestId('btn-login');
      
      // Initially disabled
      expect(loginButton.props.accessibilityState.disabled).toBe(true);
      
      // Fill valid form
      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.changeText(passwordInput, 'Password123');
      
      // Should be enabled now
      await waitFor(() => {
        expect(loginButton.props.accessibilityState.disabled).toBe(false);
      });
    });

    test('should call navigation.navigate on successful login', async () => {
      const mockNavigate = jest.fn();
      jest.spyOn(require('@react-navigation/native'), 'useNavigation')
        .mockReturnValue({ navigate: mockNavigate });
      
      const { getByTestId } = renderWithNavigation(<LoginScreen />);
      
      fireEvent.changeText(getByTestId('input-email'), 'user@example.com');
      fireEvent.changeText(getByTestId('input-password'), 'Password123');
      fireEvent.press(getByTestId('btn-login'));
      
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('Home');
      }, { timeout: 3000 });
    });
  });

  describe('Loading State', () => {
    test('should show activity indicator while submitting', async () => {
      // Mock slow API
      jest.spyOn(require('../../../src/api/auth'), 'login')
        .mockImplementation(() => new Promise(r => setTimeout(r, 1000)));
      
      const { getByTestId, queryByTestId } = renderWithNavigation(<LoginScreen />);
      
      fireEvent.changeText(getByTestId('input-email'), 'user@example.com');
      fireEvent.changeText(getByTestId('input-password'), 'Password123');
      fireEvent.press(getByTestId('btn-login'));
      
      // Loading should appear immediately
      await waitFor(() => {
        expect(getByTestId('loading-indicator')).toBeTruthy();
      });
    });
  });
});
```

### Running Tier 2

```bash
# Run all tier 2 tests
npx jest --testPathPattern=tier2

# Run specific feature
npx jest --testPathPattern=tier2/auth

# With verbose output
npx jest --testPathPattern=tier2 --verbose
```

---

## Tier 3: Detox E2E on Real Devices

### Purpose
- Validate full user flows on actual hardware
- Test real gestures (swipe, pinch, long press)
- Verify real API calls end-to-end
- Catch native module failures
- Test navigation across the full stack

### What to Test
- Complete user journeys (login → home → profile → logout)
- Gesture-based navigation
- Real network conditions
- Deep linking
- Background/foreground transitions
- Push notifications
- Device rotation
- Offline behavior

### What NOT to Test
- Component logic in isolation (→ Tier 1/2)
- Edge cases that don't involve the full stack
- Performance (separate benchmark suite)

### Detox Configuration

`detox.config.js`:
```javascript
module.exports = {
  testEnvironment: './tests/e2e-environment.js',
  
  //apps: defined in project-specific config
  
  configurations: {
    ios: {
      type: 'ios.device',
      device: {
        // For real device: use device name from xcrav simctl list
        // Or device ID from: idevice_id -l
        type: 'physical',
      },
      build: 'xcodebuild -workspace ios/MyApp.xcworkspace -scheme MyApp -configuration Debug -destination "platform=iOS,id=<device-id>" -derivedDataPath ios/build',
      test: 'xcodebuild -workspace ios/MyApp.xcworkspace -scheme MyAppTests -configuration Debug -destination "platform=iOS,id=<device-id>"',
    },
    android: {
      type: 'android.attached',
      device: {
        // ADB device ID
        adbApiLevel: 31,
      },
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug && cd ..',
      test: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug && cd ..',
    },
  },
};
```

`tests/e2e-environment.js`:
```javascript
const { Environment } = require('detox');

class E2EEnvironment extends Environment {
  constructor(config) {
    super(config);
    this.initTimeout = 120000; // 2 min for first launch
  }

  async beforeEach() {
    await super.beforeEach();
    
    // Take screenshot on failure
    if (this.currentTest && this.currentTest.status === 'failed') {
      await device.takeScreenshot(`failure-${Date.now()}.png`);
    }
  }

  async afterEach() {
    // Clear keychain/keystore between tests for clean state
    if (device.getPlatform() === 'ios') {
      await device.keychainReset();
    } else {
      await device.shell('pm clear com.myapp');
    }
    
    await super.afterEach();
  }
}

module.exports = { E2EEnvironment };
```

### Device Management (Real Devices)

**Pairing a device:**
```bash
# iOS (via USB)
xcrun simctl list devices available
# Physical: pair via Xcode → Devices

# Android
adb devices
# Physical: enable developer mode + USB debugging
```

**Device preparation script** (run before test suite):
```bash
#!/bin/bash
set -e

DEVICE_ID=$1
PLATFORM=$2

if [ "$PLATFORM" == "ios" ]; then
  # Uninstall existing app
  ideviceinstaller -u $DEVICE_ID -U com.myapp 2>/dev/null || true
  
  # Install fresh
  ideviceinstaller -u $DEVICE_ID -i ios/build/Build/Products/Debug-iphoneos/MyApp.app
  
  # Launch
  idevicewebkitdebugproxy -u $DEVICE_ID 2>/dev/null || true
else
  # Android
  adb -s $DEVICE_ID uninstall com.myapp || true
  adb -s $DEVICE_ID install android/app/build/outputs/apk/debug/app-debug.apk
fi
```

### Example Tier 3 Test

`tests/tier3/auth/LoginFlow.spec.ts`:
```typescript
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'detox';
import { by, device, expect as detoxExpect } from 'detox';

describe('Login Flow E2E', () => {
  // Increase timeout for real device operations
  const jwt = require('jsonwebtoken');

  beforeAll(async () => {
    // Launch app
    await device.launchApp({
      newInstance: true,
      launchArgs: { detox: true },
    });
  });

  afterAll(async () => {
    // Cleanup
    await device.terminateApp();
  });

  beforeEach(async () => {
    // Sign out if logged in (clean slate)
    try {
      await device.closeApp();
      await device.launchApp({ newInstance: true });
    } catch (e) {
      // App not running, launch fresh
      await device.launchApp({ newInstance: true });
    }
  });

  describe('TC-001: Happy Path Login', () => {
    test('should login with valid credentials and show home screen', async () => {
      // Wait for login screen
      await expect(element(by.testId('login-screen'))).toBeVisible();
      
      // Enter email
      await element(by.testId('input-email')).typeText('user@example.com');
      
      // Enter password
      await element(by.testId('input-password')).typeText('Password123!');
      
      // Tap login
      await element(by.testId('btn-login')).tap();
      
      // Wait for home screen (network request + navigation)
      await expect(element(by.testId('home-screen'))).toBeVisible({ timeout: 10000 });
      
      // Verify welcome message
      await expect(element(by.testId('welcome-text'))).toContainText('Welcome');
    });
  });

  describe('TC-002: Invalid Email Validation', () => {
    test('should show error for invalid email', async () => {
      await expect(element(by.testId('login-screen'))).toBeVisible();
      
      // Enter invalid email
      await element(by.testId('input-email')).typeText('not-an-email');
      
      // Tab to next field to trigger validation
      await element(by.testId('input-password')).tap();
      
      // Error should appear
      await expect(element(by.testId('error-message'))).toBeVisible();
      await expect(element(by.testId('error-message'))).toContainText('valid email');
      
      // Login button should be disabled
      await expect(element(by.testId('btn-login'))).toHaveAttribute('accessible', true);
    });
  });

  describe('TC-003: Wrong Password', () => {
    test('should show error for wrong password', async () => {
      await expect(element(by.testId('login-screen'))).toBeVisible();
      
      await element(by.testId('input-email')).typeText('user@example.com');
      await element(by.testId('input-password')).typeText('WrongPassword!');
      await element(by.testId('btn-login')).tap();
      
      // Error should appear (from API)
      await expect(element(by.testId('error-message'))).toBeVisible({ timeout: 5000 });
      await expect(element(by.testId('error-message'))).toContainText('Incorrect password');
    });
  });

  describe('TC-004: Account Lockout', () => {
    test('should lock account after 5 failed attempts', async () => {
      await expect(element(by.testId('login-screen'))).toBeVisible();
      
      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await element(by.testId('input-email')).replaceText('user@example.com');
        await element(by.testId('input-password')).replaceText('WrongPass!');
        await element(by.testId('btn-login')).tap();
        
        // Wait for error
        await expect(element(by.testId('error-message'))).toBeVisible({ timeout: 5000 });
        
        // Clear for next attempt
        await element(by.testId('input-email')).replaceText('');
        await element(by.testId('input-password')).replaceText('');
        
        // Small delay
        await device.takeScreenshot(); // for debugging
      }
      
      // 6th attempt with correct password should still fail
      await element(by.testId('input-email')).replaceText('user@example.com');
      await element(by.testId('input-password')).replaceText('CorrectPass!');
      await element(by.testId('btn-login')).tap();
      
      // Should show lockout message
      await expect(element(by.testId('error-message'))).toBeVisible({ timeout: 5000 });
      await expect(element(by.testId('error-message'))).toContainText('locked');
    });
  });

  describe('TC-005: Session Persistence', () => {
    test('should persist session across app restart', async () => {
      // Login first
      await element(by.testId('input-email')).typeText('user@example.com');
      await element(by.testId('input-password')).typeText('Password123!');
      await element(by.testId('btn-login')).tap();
      
      await expect(element(by.testId('home-screen'))).toBeVisible({ timeout: 10000 });
      
      // Restart app (simulate background/foreground or force quit)
      await device.relaunchApp({ newInstance: false });
      
      // Should still be on home screen (logged in)
      await expect(element(by.testId('home-screen'))).toBeVisible({ timeout: 5000 });
    });
  });
});
```

### Running Tier 3

```bash
# Build first (must be done before running)
npx detox build --configuration ios

# Run tests
npx detox test --configuration ios --device-id <device-id>

# Or let Detox pick device
npx detox test --configuration ios

# With logging
npx detox test --configuration ios --loglevel trace

# Keep app running between tests (faster)
npx detox test --configuration ios --reuse
```

---

## Tier Execution Orchestration

### `mobile-test-suite test` Flow

```
1. Parse --tier flag (default: all)
2. If tier 1:
   a. Run Jest
   b. Collect results
   c. If --stop-on-fail and failures → exit 1
3. If tier 2:
   a. Run Jest (tier2 pattern)
   b. Collect results
   c. If failures and not tier 3 → continue
4. If tier 3:
   a. Check device availability
   b. Build app (if needed - check hash)
   c. Install on device
   d. Run Detox
   e. Collect results + screenshots
5. Generate report
6. Exit 0 if all passed, exit 1 if any failed
```

### Fail-Fast Logic

| Tier | Failure | Action |
|------|---------|--------|
| 1 | Fails | If --stop-on-fail → stop, else continue to tier 2 |
| 2 | Fails | Continue to tier 3 (full picture needed) |
| 3 | Fails | Full stop, report |

**Rationale:** Tier 1 is cheap, Tier 3 is expensive. Don't waste device time if unit tests are broken. But component test failures don't guarantee E2E failures, so always run E2E to get full picture.

### Build Caching

Before building (Tier 3), check if build is needed:
```bash
# Hash source + tests
SOURCE_HASH=$(find src -name '*.ts' -o -name '*.tsx' | sort | xargs md5sum | md5sum | cut -d' ' -f1)

# Compare with last build hash
if [ "$SOURCE_HASH" != "$(cat .build-hash 2>/dev/null)" ]; then
  echo "Source changed, rebuilding..."
  npx detox build
  echo "$SOURCE_HASH" > .build-hash
else
  echo "Using cached build"
fi
```

---

## Output Format

Each tier produces:

```typescript
interface TierResult {
  tier: 1 | 2 | 3;
  runner: 'jest' | 'detox';
  duration: number; // ms
  passed: number;
  failed: number;
  skipped: number;
  tests: TestResult[];
  errors: string[];
}

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  stack?: string;
}
```

Written to `test-results/<run-id>/tier-{1,2,3}-results.json`
