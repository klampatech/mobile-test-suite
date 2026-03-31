# Test Generation Specification

**Version:** 0.1.0
**TDD Phase:** Test generation from specs
**Status:** Draft

---

## Overview

The generation layer reads structured specs and produces test code using an LLM. It is intentionally dumb — it knows how to call the LLM, format the output, and validate the generated code compiles. The LLM does the creative work.

**Design principle:** The generator should never make decisions about test strategy. It translates spec → test code. Quality of tests depends on the prompt + LLM model, not the generator's logic.

---

## Generation Pipeline

```
spec.md → Parser → Structured Requirements → LLM → Generated Test Code → Validator → Output
```

### Step 1: Parse Spec

Input: Markdown spec file (see SPEC.md for format)

Output: Structured JSON

```typescript
interface ParsedSpec {
  feature: string;
  requirements: Requirement[];
}

interface Requirement {
  id: string;           // "REQ-001"
  name: string;         // "Email Password Authentication"
  priority: 'must-have' | 'should-have' | 'could-have';
  platform?: ('ios' | 'android')[];
  given: string[];      // Preconditions
  when: string;          // Action
  then: string[];       // Expected outcomes
  edgeCases: EdgeCase[];
  testScenarios: TestScenario[];
}

interface EdgeCase {
  condition: string;
  expected: string;
}

interface TestScenario {
  id: string;           // "TC-001"
  name: string;         // "Happy path login"
}
```

**Parser rules:**
- Extract `# Feature: <name>` as feature name
- Parse `### REQ-<id>: <name>` blocks
- Extract `**Priority:**` value
- Extract `**Platform:**` if present
- Parse Gherkin `Given/When/Then` into structured steps
- Extract `**Edge Cases:**` bullet list
- Extract `- \`TC-<id>\` <name>` into test scenarios

### Step 2: Generate Tests via LLM

**LLM Call:**
```bash
POST /v1/messages
Headers:
  x-api-key: $LLM_API_KEY
  anthropic-version: 2023-06-01

Body:
{
  "model": "<configured-model>",
  "max_tokens": 8192,
  "system": "<system-prompt>",
  "messages": [
    {"role": "user", "content": "<prompt-with-spec-and-context>"}
  ]
}
```

**System Prompt (loaded from `prompts/generation_system.md`):**

```
You are an expert React Native test engineer. Your task is to generate comprehensive, high-quality tests from requirement specifications.

For each requirement, generate tests at THREE tiers:

**TIER 1 - Unit/Logic Tests (Jest)**
- Test business logic in isolation
- Mock external dependencies (API calls, storage, sensors)
- Focus: pure functions, state machines, validation logic
- File: `<requirement>-logic.test.ts`

**TIER 2 - Component Integration Tests (RNTL)**
- Test that components interact correctly
- Mock React Native modules (Navigation, AsyncStorage, etc.)
- Use @testing-library/react-native
- Focus: component behavior, user interactions, state updates
- File: `<requirement>-component.test.tsx`

**TIER 3 - E2E Tests (Detox)**
- Test full user flows on real devices
- No mocking - real API calls, real navigation
- Use exact element matchers (accessibility labels, testIDs)
- Focus: user-visible behavior, screen transitions, gestures
- File: `<requirement>-e2e.spec.ts`

**CRITICAL - Test Quality Rules:**
1. Tests must verify BEHAVIOR, not implementation
2. Tier 1 tests: no React Native components, only logic
3. Tier 2 tests: mock native modules with jest.mock()
4. Tier 3 tests: use testID attributes for element matching
5. DO NOT test implementation details (internal state, private methods)
6. Each test scenario from the spec MUST have at least one test
7. Edge cases MUST have tests

**Output format:**
For each requirement, output three code blocks:
```typescript
// TIER1: <filename>
<code>

// TIER2: <filename>
<code>

// TIER3: <filename>
<code>
```

**App Context:**
<app-context>

**Requirement to test:**
<requirement-details>
```

**User Prompt:**
```
Generate tests for this requirement:

Feature: <feature-name>

Requirement: <requirement-id> - <requirement-name>
Priority: <priority>

**Given** <preconditions>
**When** <action>
**Then** <expected-outcomes>

Edge Cases:
<edge-cases-list>

Test Scenarios:
<test-scenarios-list>
```

### Step 3: Validate Generated Code

After generation, run validation:

```bash
# TypeScript compilation check
npx tsc --noEmit tests/tier1/*.test.ts 2>&1 || echo "TYPE_ERROR"

# ESLint check
npx eslint tests/tier1/*.test.ts --quiet 2>&1 || echo "LINT_ERROR"

# RNTL component syntax check
npx tsc --noEmit tests/tier2/*.test.tsx 2>&1 || echo "TYPE_ERROR"

# Detox config validation
npx detox config-validate 2>&1 || echo "CONFIG_ERROR"
```

**If validation fails:**
- Log the specific errors
- Retry generation once with error context appended to prompt
- If still failing, write partial output + error report

### Step 4: Write Output

**Success:** Write all three tier files to output directory.

**Partial success:** Write what compiled, log errors for what didn't.

---

## Test Generation Prompts

### System Prompt Template

Stored at `prompts/generation_system.md`:

```markdown
You are an expert React Native test engineer.

You generate tests in THREE tiers:

## TIER 1: Jest Unit Tests
- Pure business logic, no RN components
- Mock everything external (fetch, AsyncStorage, sensors)
- Pattern:
```typescript
import { describe, test, expect, jest } from '@jest/globals';

// Mock external dependencies
jest.mock('react-native', () => ({
  AsyncStorage: {
    setItem: jest.fn(),
    getItem: jest.fn(),
  },
}));

describe('<Requirement Name> Logic', () => {
  // Pure function tests
  test('should <expected behavior>', () => {
    // Arrange
    const input = <valid-input>;
    
    // Act
    const result = <function-under-test>(input);
    
    // Assert
    expect(result).toEqual(<expected>);
  });
});
```

## TIER 2: RNTL Component Tests
- React Native components with testing-library
- Mock native modules but render real components
- Pattern:
```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { <ComponentName> } from '../src/<path>';

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

describe('<ComponentName>', () => {
  test('should <behavior> when <action>', async () => {
    // Arrange
    const { getByTestId } = render(<ComponentName />);
    
    // Act
    fireEvent.changeText(getByTestId('input-email'), 'user@example.com');
    fireEvent.press(getByTestId('btn-submit'));
    
    // Assert
    await waitFor(() => {
      expect(getByTestId('home-screen')).toBeTruthy();
    });
  });
});
```

## TIER 3: Detox E2E Tests
- Real device, real app, no mocking
- Use testID for element matching
- Pattern:
```typescript
describe('<Feature> E2E', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  test('should <flow> successfully', async () => {
    // Navigate to screen
    await element(by.testId('nav-login')).tap();
    
    // Enter credentials
    await element(by.testId('input-email')).typeText('user@example.com');
    await element(by.testId('input-password')).typeText('Password123');
    
    // Submit
    await element(by.testId('btn-login')).tap();
    
    // Verify
    await expect(element(by.testId('home-screen'))).toBeVisible();
  });
});
```

## CRITICAL RULES
1. NO implementation details in tests (don't test internal state)
2. Every test must have a meaningful assertion
3. DO NOT copy production code into tests (use import)
4. All user-facing strings must be matched by testID
5. Each edge case from the spec must have a dedicated test
6. Tier 1: NO React imports, NO JSX
7. Tier 2: Mock react-native animated with jest.mock
8. Tier 3: MUST use testID, not text matching (fragile)
```

---

## LLM Context Injection

To generate high-quality tests, the LLM needs context about:

### 1. App Structure (from `src/` analysis)

```json
{
  "screens": ["LoginScreen", "HomeScreen", "ProfileScreen"],
  "components": ["Button", "Input", "Card"],
  "navigation": "react-navigation (stack)",
  "stateManagement": "zustand",
  "apiLayer": "axios + apiClient.ts",
  "storage": "AsyncStorage",
  "keyFiles": {
    "auth": "src/auth/login.ts",
    "api": "src/api/client.ts"
  }
}
```

**How to gather:** The generator reads `src/` and builds this manifest.

### 2. Existing Test Patterns (from `tests/` if populated)

If tests already exist, include snippets as examples:
```
// Example of existing test pattern:
<file:tests/tier1/auth/login-logic.test.ts>
<file:tests/tier2/auth/LoginScreen.test.tsx>
```

### 3. Component TestIDs (from source code)

Extract `testID` props from components:
```
// Components with testID:
LoginScreen: input-email, input-password, btn-login, error-message
HomeScreen: welcome-text, nav-profile, btn-logout
```

**How to gather:** Grep source for `testID=` patterns.

---

## Generation Output Structure

```json
{
  "runId": "gen-2026-03-30-001",
  "spec": "specs/login.md",
  "requirement": "REQ-001",
  "timestamp": "2026-03-30T14:00:00Z",
  "generated": {
    "tier1": {
      "file": "tests/tier1/login/auth-logic.test.ts",
      "tests": 5,
      "lines": 120,
      "validated": true
    },
    "tier2": {
      "file": "tests/tier2/login/LoginScreen.test.tsx",
      "tests": 3,
      "lines": 85,
      "validated": true
    },
    "tier3": {
      "file": "tests/tier3/login/LoginFlow.spec.ts",
      "tests": 4,
      "lines": 95,
      "validated": true
    }
  },
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4",
    "tokensUsed": 4200,
    "costEstimate": 0.05
  },
  "errors": []
}
```

---

## Error Handling

| Error | Recovery |
|-------|----------|
| LLM API timeout | Retry 2x with exponential backoff, then fail |
| LLM API error (429, 500) | Retry 2x after 5s, then fail |
| Invalid JSON response | Attempt to extract code blocks manually |
| TypeScript compile error | Retry with error in prompt |
| Empty response | Fail with "Generation produced no output" |
| Partial output (some tiers fail) | Write successful tiers, log failures |

---

## TDD Workflow with Generation

### Red Phase (Test Generation)

1. Write spec: `specs/login.md`
2. Run: `mobile-test-suite generate --spec=specs/login.md --output=tests`
3. Tests are generated but FAIL (app not implemented)
4. Agent reads failures → implements feature

### Green Phase (Implementation)

1. Agent implements login feature
2. Run: `mobile-test-suite test --tier=1 --stop-on-fail`
3. Tier 1 passes
4. Run: `mobile-test-suite test --tier=2`
5. Tier 2 passes
6. Run: `mobile-test-suite test --tier=3`
7. Tier 3 passes

### Refactor Phase

1. Agent refactors implementation
2. Run full suite: `mobile-test-suite test --tier=all`
3. All tiers green → commit

---

## Example Generation

**Input spec (`specs/login.md`):**

```markdown
# Feature: User Authentication

## Requirements

### REQ-001: Email Password Login
**Priority:** must-have

**Given** the user is on the login screen  
**When** they enter valid credentials  
**Then** they are redirected to home  

Edge Cases:
- Empty email → validation error
- Invalid email format → "Invalid email" message
- Wrong password → "Incorrect password" message
- 5 failed attempts → account locked

Test Scenarios:
- `TC-001` Happy path
- `TC-002` Invalid email
- `TC-003` Wrong password
- `TC-004` Account lockout
```

**Generated Tier 1 (`tests/tier1/login/auth-logic.test.ts`):**

```typescript
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock AsyncStorage
jest.mock('react-native', () => ({
  AsyncStorage: {
    setItem: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(() => Promise.resolve(null)),
  },
}));

// Import the auth functions being tested
import { validateEmail, validatePassword, attemptLogin } from '../../../src/auth/login';

describe('Login Logic', () => {
  describe('validateEmail', () => {
    test('TC-002: should return false for empty string', () => {
      expect(validateEmail('')).toBe(false);
    });

    test('should return false for invalid email format', () => {
      expect(validateEmail('notanemail')).toBe(false);
      expect(validateEmail('missing@domain')).toBe(false);
      expect(validateEmail('@nodomain.com')).toBe(false);
    });

    test('should return true for valid email', () => {
      expect(validateEmail('user@example.com')).toBe(true);
    });
  });

  describe('validatePassword', () => {
    test('should return false for empty password', () => {
      expect(validatePassword('')).toBe(false);
    });

    test('should return true for password > 6 chars', () => {
      expect(validatePassword('Password123')).toBe(true);
    });
  });

  describe('attemptLogin', () => {
    const mockApi = {
      login: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('TC-001: should return success for valid credentials', async () => {
      mockApi.login.mockResolvedValue({ token: 'abc123' });
      const result = await attemptLogin('user@example.com', 'Password123', mockApi);
      expect(result.success).toBe(true);
      expect(result.token).toBe('abc123');
    });

    test('TC-003: should return error for wrong password', async () => {
      mockApi.login.mockResolvedValue({ error: 'Incorrect password' });
      const result = await attemptLogin('user@example.com', 'WrongPass', mockApi);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Incorrect password');
    });

    test('TC-004: should track failed attempts and lock after 5', async () => {
      mockApi.login.mockResolvedValue({ error: 'Incorrect password' });
      
      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await attemptLogin('user@example.com', 'WrongPass', mockApi);
      }
      
      // 6th attempt should be blocked
      const result = await attemptLogin('user@example.com', 'Password123', mockApi);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Account temporarily locked');
    });
  });
});
```

---

## Next Steps

When implementing:
1. Start with parser — it must correctly extract all spec fields
2. Build the LLM call wrapper (handle errors, retries)
3. Implement the validation step (TypeScript check)
4. Finally, wire up the prompt templates

Test the generator in isolation:
```bash
mobile-test-suite generate --spec=specs/login.md --output=tests --tier=1
# Should produce tests/tier1/login/* even if app not implemented
```
