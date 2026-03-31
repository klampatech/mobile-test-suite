# Mobile Test Suite — Architecture & CLI Specification

**Version:** 0.1.0
**TDD Phase:** Core architecture
**Status:** Draft

---

## Overview

AI-native mobile testing suite for React Native apps (Expo + CLI). Generates, executes, and verifies tests autonomously with real device feedback. Designed for TDD workflows and standalone use or orchestration via GasTown/Ralph.

**Core principle:** The suite is a CLI tool. Ralph or GasTown invoke it as a black box — feed it specs, get back test results.

---

## CLI Interface

```bash
mobile-test-suite <command> [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `generate` | Generate tests from spec files |
| `test` | Run tests (all tiers or specific) |
| `device` | Manage real devices |
| `init` | Initialize test suite in a project |
| `report` | Generate test report from previous run |

---

### `mobile-test-suite generate`

Generate test files from requirement specs.

```bash
mobile-test-suite generate --spec=<path> --output=<path> [--tier=1|2|3|all]
```

**Arguments:**
| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--spec` | path | Yes | Path to spec file (e.g., `specs/login.md`) |
| `--output` | path | Yes | Output directory for generated tests |
| `--tier` | 1\|2\|3\|all | No | Which tier(s) to generate (default: all) |
| `--force` | bool | No | Overwrite existing test files |

**Behavior:**
1. Read spec file at `--spec`
2. Parse spec into structured requirements (see Spec Format below)
3. For each requirement, generate appropriate test code
4. Write test files to `--output` directory
5. Exit 0 on success, exit 1 if spec is invalid

**Generated File Structure:**
```
<output>/
  ├── specs/
  │   └── <spec-name>/
  │       ├── tier1/
  │       │   ├── <requirement>-logic.test.ts
  │       │   └── <requirement>-logic.test.ts.snap
  │       ├── tier2/
  │       │   └── <requirement>-component.test.tsx
  │       └── tier3/
  │           └── <requirement>-e2e.spec.ts
```

**Exit Codes:**
| Code | Meaning |
|------|---------|
| 0 | Tests generated successfully |
| 1 | Spec invalid or parse error |
| 2 | Output directory not writable |
| 3 | LLM generation failed |

---

### `mobile-test-suite test`

Execute generated tests against the app.

```bash
mobile-test-suite test [path] [--tier=1|2|3|all] [--device=<id>] [--stop-on-fail] [--retry=<n>]
```

**Arguments:**
| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `path` | path | No | Path to test files (default: `./tests`) |
| `--tier` | 1\|2\|3\|all | No | Which tier(s) to run (default: all) |
| `--device` | string | No | Specific device ID (default: first available) |
| `--stop-on-fail` | bool | No | Stop execution on first tier failure (default: false) |
| `--retry` | number | No | Retry flaky tests N times before failing (default: 2) |

**Execution Order:**
1. Tier 1 (Jest) — unit/logic tests
2. Tier 2 (RNTL) — component integration tests
3. Tier 3 (Detox) — E2E on real device

**Fail Fast Behavior:**
- If `--stop-on-fail` and any Tier 1 test fails → stop, report
- If any Tier 2 test fails → continue to Tier 3 (full picture)
- Tier 3 failure → full failure report

**Exit Codes:**
| Code | Meaning |
|------|---------|
| 0 | All tiers passed |
| 1 | One or more tiers failed |
| 2 | No tests found at path |
| 3 | Device connection failed |
| 4 | Build failed |

---

### `mobile-test-suite device`

Manage real device pool.

```bash
mobile-test-suite device <subcommand>
```

**Subcommands:**

```bash
# List available devices
mobile-test-suite device list

# Pair a new device
mobile-test-suite device pair [--name=<label>] [--platform=ios|android]

# Reset a device (factory reset to clean state)
mobile-test-suite device reset <device-id>

# Check device health
mobile-test-suite device health <device-id>

# Remove device from pool
mobile-test-suite device remove <device-id>
```

**Device List Output Format:**
```
ID       PLATFORM  STATUS    NAME          LAST SEEN
phone-a  ios       available iPhone 14 Pro  2026-03-30T14:00:00Z
phone-b  android   available Pixel 7        2026-03-30T14:00:00Z
phone-c  ios       in-use     iPhone 15      2026-03-30T13:45:00Z
```

**Exit Codes:**
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Device not found or unavailable |
| 2 | Pairing failed |
| 3 | Reset failed |

---

### `mobile-test-suite init`

Initialize test infrastructure in a React Native project.

```bash
mobile-test-suite init [--project=<path>] [--expo | --cli] [--install]
```

**Arguments:**
| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project` | path | No | Project root (default: current directory) |
| `--expo` | bool | No | Initialize for Expo managed workflow |
| `--cli` | bool | No | Initialize for bare React Native CLI |
| `--install` | bool | No | Auto-install dependencies (jest, rntl, detox) |

**Creates:**
```
<project>/
  ├── tests/                    # Generated tests live here
  │   ├── tier1/
  │   ├── tier2/
  │   └── tier3/
  ├── specs/                    # Requirement specs (user-created)
  │   └── .gitkeep
  ├── mobile-test-suite.config.js  # Suite configuration
  ├── jest.config.js           # Tier 1 config
  ├── detox.config.js          # Tier 3 config
  └── .detoxrc.js              # Legacy Detox config (backward compat)
```

**Exit Codes:**
| Code | Meaning |
|------|---------|
| 0 | Initialized successfully |
| 1 | Project already initialized |
| 2 | Not a valid RN project |
| 3 | Dependency installation failed |

---

### `mobile-test-suite report`

Generate human/machine readable test report.

```bash
mobile-test-suite report [--run=<id>] [--format=json|markdown|html] [--output=<path>]
```

**Arguments:**
| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--run` | string | No | Run ID to report (default: last run) |
| `--format` | json\|markdown\|html | No | Output format (default: json) |
| `--output` | path | No | Write to file instead of stdout |

---

## Spec Format

Specs are Markdown files with structured sections. Agents read this format to generate tests.

```markdown
# Feature: User Login

## Requirements

### REQ-001: Email Password Authentication
**Priority:** must-have

**Given** the user is on the login screen  
**When** they enter valid email "user@example.com" and password "Password123"  
**Then** they are redirected to the home screen  
**And** a session token is stored securely  

**Edge Cases:**
- Empty email field → show validation error
- Invalid email format → show "Invalid email" message
- Wrong password → show "Incorrect password" (max 5 attempts)
- Account locked after 5 failures → show "Account temporarily locked"

**Test Scenarios:**
- `TC-001` Happy path login
- `TC-002` Invalid email validation
- `TC-003` Wrong password (verify no token stored)
- `TC-004` Account lockout after 5 failures
- `TC-005` Session persists across app restart

---

### REQ-002: Biometric Authentication
**Priority:** should-have

**Given** the user has enabled biometric login  
**When** they tap "Use Face ID" on the login screen  
**Then** biometric prompt appears  
**And** on success, they are redirected to home screen  

**Platform:** iOS, Android (fingerprint/face)

**Test Scenarios:**
- `TC-006` Biometric success → home screen
- `TC-007` Biometric failure → fallback to password
- `TC-008` Biometric not enrolled → show setup prompt
```

### Spec Parsing Rules

| Element | Pattern | Captures |
|---------|---------|----------|
| Feature Title | `# Feature: <name>` | Feature name |
| Requirement | `### REQ-<id>: <name>` | ID, name, priority |
| Priority | `**Priority:** must-have\|should-have\|could-have` | Priority tier |
| Given/When/Then | Gherkin-style | Test steps |
| Edge Cases | `**Edge Cases:**` block | Negative test cases |
| Platform | `**Platform:**` | Platform-specific tests |
| Test Scenario | `- \`TC-<id>\` <name>` | Test case ID + name |

---

## Configuration

`mobile-test-suite.config.js`:

```javascript
module.exports = {
  // Project type
  projectType: 'expo' | 'cli',

  // Test output directory
  testDir: './tests',

  // Spec directory
  specDir: './specs',

  // LLM provider for test generation
  llm: {
    provider: 'anthropic' | 'openai' | 'minimax',
    model: 'claude-sonnet-4' | 'gpt-4o' | 'mini-max',
    apiKeyEnv: 'ANTHROPIC_API_KEY', // env var name
  },

  // Device pool settings
  devices: {
    defaultTimeout: 30000, // ms to wait for device
    retryAttempts: 2,
    healthCheckInterval: 60000, // ms
  },

  // Tier-specific settings
  tiers: {
    1: {
      runner: 'jest',
      testMatch: ['**/tier1/**/*.test.ts'],
      coverage: true,
    },
    2: {
      runner: 'rntl',
      testMatch: ['**/tier2/**/*.test.tsx'],
    },
    3: {
      runner: 'detox',
      testMatch: ['**/tier3/**/*.spec.ts'],
      deviceType: 'real', // real | emulator
    },
  },
};
```

---

## Test Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│ mobile-test-suite test --tier=all                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 1: Jest (Unit/Logic Tests)                            │
│ Run time: ~10-30s                                           │
│ Exit on failure: --stop-on-fail flag                        │
└─────────────────────┬───────────────────────────────────────┘
           │         │
           │         ▼
           │ ┌─────────────────────────────────────────────────┐
           │ │ Parse: How many tests passed/failed?            │
           │ │ If tests failing → write to IMPLEMENTATION_PLAN │
           │ └─────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 2: RNTL (Component Integration Tests)                  │
│ Run time: ~30-60s                                           │
│ Mocks external dependencies (API, sensors)                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 3: Detox (E2E on Real Device)                         │
│ Run time: ~2-5 minutes                                      │
│ 1. Build app (if needed)                                   │
│ 2. Install on device                                        │
│ 3. Launch Detox server                                      │
│ 4. Execute E2E scenarios                                   │
│ 5. Capture screenshots on failure                           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ REPORT: Aggregate results across all tiers                  │
│ Write: test-results/<run-id>/                               │
│   - results.json (machine-readable)                         │
│   - summary.md (human-readable)                            │
│   - coverage/ (if enabled)                                 │
│   - screenshots/ (Tier 3 failures)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Exit Strategy

Tests run autonomously until:
1. All tiers pass → exit 0, git tag (if in Ralph loop)
2. All tiers fail → exit 1, write failure report
3. Device disconnects → attempt reconnect 3x, then exit 3
4. Build fails → exit 4, capture build logs

Agent should NOT intervene until one of these terminal states.

---

## File Structure (Generated Project)

```
my-react-native-app/
├── specs/
│   └── login.md
├── tests/
│   ├── tier1/
│   │   └── login/
│   │       ├── auth-logic.test.ts
│   │       └── auth-logic.test.ts.snap
│   ├── tier2/
│   │   └── login/
│   │       └── LoginScreen.test.tsx
│   └── tier3/
│       └── login/
│           └── LoginFlow.spec.ts
├── mobile-test-suite.config.js
├── jest.config.js
└── detox.config.js
```

---

## Dependencies

| Package | Purpose | Install |
|---------|---------|---------|
| `jest` | Tier 1 test runner | `npm install --save-dev jest` |
| `@testing-library/react-native` | Tier 2 component testing | `npm install --save-dev @testing-library/react-native` |
| `detox` | Tier 3 E2E testing | `npm install --save-dev detox` |
| `@anthropic-ai/sdk` | LLM API for test generation | `npm install @anthropic-ai/sdk` |
| `@mobile-test-suite/core` | This package | (published or local path) |

---

## Implementation Notes for TDD

**Red phase:** Write a failing test for a spec requirement, run `mobile-test-suite test --tier=1` → test fails (not implemented yet).

**Green phase:** Implement the feature in the app code. Run `mobile-test-suite test --tier=1` → test passes.

**Refactor phase:** Clean up implementation. Run full tier suite → ensure nothing broke.

**The agent's job:** Generate tests that fail against current implementation, implement to make them pass, iterate until all tiers green.
