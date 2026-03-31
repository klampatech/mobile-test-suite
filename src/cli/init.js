/**
 * Init Command
 * Initialize test suite in a React Native project
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora').default;
const fs = require('fs');
const path = require('path');

const initCmd = new Command('init')
  .description('Initialize test suite in a React Native project')
  .option('-p, --project <path>', 'Project root', process.cwd())
  .option('--expo', 'Initialize for Expo managed workflow')
  .option('--cli', 'Initialize for bare React Native CLI')
  .option('--install', 'Auto-install dependencies')
  .action(async (options) => {
    const spinner = ora('Initializing test suite...').start();

    try {
      const projectPath = path.resolve(options.project);
      const isExpo = options.expo || !options.cli;

      const packageJsonPath = path.join(projectPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        spinner.fail('Not a valid Node.js project (no package.json found)');
        process.exit(2);
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const hasRnDep = packageJson.dependencies?.react?.startsWith('18') || packageJson.dependencies?.expo;

      if (!hasRnDep && !packageJson.dependencies?.expo) {
        spinner.warn('This does not appear to be a React Native project');
      }

      spinner.text = 'Creating test directories...';

      const dirs = [
        'tests/tier1',
        'tests/tier2',
        'tests/tier3',
        'tests/__mocks__',
        'specs',
      ];

      dirs.forEach((dir) => {
        const fullPath = path.join(projectPath, dir);
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
        }
      });

      spinner.text = 'Creating config file...';
      const configContent = `module.exports = {
  projectType: '${isExpo ? 'expo' : 'cli'}',
  testDir: './tests',
  specDir: './specs',
  outputDir: './test-results',
  app: {
    name: '${packageJson.name || 'MyApp'}',
    bundleId: 'com.myapp',
    androidPackage: 'com.myapp',
  },
  llm: {
    provider: process.env.LLM_PROVIDER || 'anthropic',
    model: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  devices: {
    defaultPlatform: 'ios',
    defaultTimeout: 30000,
    retryAttempts: 2,
  },
  tiers: {
    1: { enabled: true, runner: 'jest', testMatch: ['**/tier1/**/*.test.ts'] },
    2: { enabled: true, runner: 'rntl', testMatch: ['**/tier2/**/*.test.tsx'] },
    3: { enabled: true, runner: 'detox', testMatch: ['**/tier3/**/*.spec.ts'], deviceType: 'real' },
  },
  notifications: {
    onFailure: {
      slack: { enabled: false, webhookUrl: process.env.SLACK_WEBHOOK_URL, channel: '#mobile-tests' },
    },
  },
  retention: {
    maxRuns: 100,
    maxAge: '30d',
    keepFlakyRuns: true,
    keepFailedRuns: true,
  },
};
`;

      fs.writeFileSync(path.join(projectPath, 'mobile-test-suite.config.js'), configContent);

      spinner.text = 'Creating Jest config...';
      const jestConfig = `module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  testMatch: [
    '**/tests/tier1/**/*.test.ts',
    '**/tests/tier2/**/*.test.tsx',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\\\.(ts|tsx)$': ['ts-jest', {
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
    '^@react-native-async-storage/async-storage$': '<rootDir>/tests/__mocks__/async-storage.js',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  clearMocks: true,
  resetMocks: true,
  testTimeout: 10000,
};
`;

      fs.writeFileSync(path.join(projectPath, 'jest.config.js'), jestConfig);

      spinner.text = 'Creating Jest setup...';
      const jestSetup = `// Jest setup file for all tiers

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({
  shouldUseNativeDriver: jest.fn(() => false),
  default: {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    reset: jest.fn(),
  }),
  NavigationContainer: ({ children }) => children,
}));

const originalWarn = console.warn;
console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Animated: \`useNativeDriver\`')
  ) {
    return;
  }
  originalWarn.apply(console, args);
};
`;

      fs.writeFileSync(path.join(projectPath, 'tests/setup.ts'), jestSetup);

      spinner.text = 'Creating Detox config...';
      const detoxConfig = `/** @type {Detox.DetoxConfig} */
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
      device: { type: 'physical' },
      apps: ['ios.debug'],
    },
    'android.attached': {
      device: { type: 'android.attached' },
      apps: ['android.debug'],
    },
  },
};
`;

      fs.writeFileSync(path.join(projectPath, 'detox.config.js'), detoxConfig);

      const e2eEnv = `const { Environment } = require('detox');

class E2EEnvironment extends Environment {
  constructor(config) {
    super(config);
    this.initTimeout = 120000;
  }

  async beforeEach() {
    await super.beforeEach();
    if (this.currentTest && this.currentTest.status === 'failed') {
      await device.takeScreenshot(\`failure-\${Date.now()}.png\`);
    }
  }

  async afterEach() {
    if (device.getPlatform() === 'ios') {
      await device.keychainReset();
    } else {
      await device.shell('pm clear com.myapp');
    }
    await super.afterEach();
  }
}

module.exports = { E2EEnvironment };
`;

      fs.writeFileSync(path.join(projectPath, 'tests/e2e-environment.js'), e2eEnv);

      spinner.text = 'Creating test mocks...';

      const reactNativeMock = `module.exports = {
  AsyncStorage: {
    setItem: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(() => Promise.resolve(null)),
    removeItem: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
  },
  Platform: {
    OS: 'ios',
    select: jest.fn((obj) => obj.ios || obj.default),
  },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  TextInput: 'TextInput',
  ScrollView: 'ScrollView',
  FlatList: 'FlatList',
  Image: 'Image',
  Vibration: { vibrate: jest.fn() },
  Alert: { alert: jest.fn() },
  Animated: {
    View: 'Animated.View',
    Text: 'Animated.Text',
    Value: jest.fn(),
    timing: jest.fn(() => ({ start: jest.fn() })),
    createAnimatedComponent: (c) => c,
  },
  NativeModules: {},
  NativeEventEmitter: jest.fn(),
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 812 })),
  },
  StyleSheet: {
    create: (styles) => styles,
  },
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
};
`;

      fs.writeFileSync(path.join(projectPath, 'tests/__mocks__/react-native.js'), reactNativeMock);

      const asyncStorageMock = `module.exports = {
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
};
`;

      fs.writeFileSync(path.join(projectPath, 'tests/__mocks__/async-storage.js'), asyncStorageMock);

      fs.writeFileSync(path.join(projectPath, 'specs/.gitkeep'), '');

      spinner.succeed('Test suite initialized successfully!');
      console.log(chalk.bold('\nCreated files:'));
      console.log('  mobile-test-suite.config.js');
      console.log('  jest.config.js');
      console.log('  tests/setup.ts');
      console.log('  tests/e2e-environment.js');
      console.log('  tests/__mocks__/react-native.js');
      console.log('  tests/__mocks__/async-storage.js');
      console.log('  detox.config.js');
      console.log(chalk.bold('\nDirectories:'));
      console.log('  tests/tier1/');
      console.log('  tests/tier2/');
      console.log('  tests/tier3/');
      console.log('  specs/');

      if (options.install) {
        console.log(chalk.yellow('\nNote: Dependencies were not auto-installed. Run manually:'));
        console.log('  npm install --save-dev jest @testing-library/react-native detox');
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

module.exports = { initCmd };