# Test Reporting & Flakiness Detection Specification

**Version:** 0.1.0
**TDD Phase:** Result reporting and test reliability
**Status:** Draft

---

## Overview

After each test run, the suite generates structured reports for both machines (CI/CD) and humans (developers). The flakiness detector identifies unreliable tests that produce inconsistent results.

**Core principle:** A test that sometimes fails is worse than no test — it trains the team to ignore failures. Flaky tests must be surfaced, quarantined, or fixed.

---

## Report Structure

```
test-results/
└── <run-id>/
    ├── run.json          # Run metadata
    ├── tier-1-results.json
    ├── tier-2-results.json
    ├── tier-3-results.json
    ├── summary.json      # Aggregated results
    ├── summary.md        # Human-readable summary
    ├── flaky-tests.json  # Flakiness analysis
    └── artifacts/
        ├── tier-1-coverage/
        │   └── coverage-final.json
        ├── screenshots/  # Tier 3 failure screenshots
        │   ├── TC-001-failure-001.png
        │   └── TC-003-failure-001.png
        └── crash-logs/   # Native crash logs
            └── android-crash-2026-03-30.log
```

---

## Run Metadata (`run.json`)

Created at start of each `mobile-test-suite test` invocation.

```json
{
  "runId": "run-2026-03-30-001",
  "timestamp": "2026-03-30T14:00:00Z",
  "duration": 312000,
  "trigger": "cli",
  "config": {
    "projectPath": "/path/to/project",
    "tiers": ["1", "2", "3"],
    "device": "phone-a",
    "stopOnFail": false,
    "retryCount": 2
  },
  "environment": {
    "platform": "ios",
    "osVersion": "17.4",
    "nodeVersion": "20.10.0",
    "rnVersion": "0.73.0"
  },
  "specs": ["specs/login.md", "specs/checkout.md"],
  "git": {
    "branch": "feature/login",
    "commit": "a1b2c3d4",
    "message": "Implement login feature"
  }
}
```

---

## Tier Results Format

Each tier produces `tier-{1,2,3}-results.json`:

```json
{
  "tier": 1,
  "runner": "jest",
  "duration": 28500,
  "timestamp": "2026-03-30T14:00:05Z",
  "summary": {
    "total": 47,
    "passed": 45,
    "failed": 2,
    "skipped": 0,
    "todo": 0
  },
  "tests": [
    {
      "name": "Email Validation should return false for empty string",
      "status": "passed",
      "duration": 12,
      "retries": 0,
      "location": "tests/tier1/auth/login-logic.test.ts:15"
    },
    {
      "name": "Login Flow should authenticate with valid token",
      "status": "failed",
      "duration": 234,
      "retries": 1,
      "error": {
        "message": "Expected 200 but got 401",
        "stack": "AuthError: Expected 200 but got 401\n    at attemptLogin (src/auth/login.ts:42)",
        "type": "Error"
      },
      "location": "tests/tier1/auth/login-logic.test.ts:67",
      "flaky": false
    }
  ],
  "coverage": {
    "lines": 85.2,
    "statements": 82.1,
    "functions": 78.4,
    "branches": 71.3,
    "path": "test-results/run-2026-03-30-001/tier-1-coverage/coverage-final.json"
  }
}
```

---

## Summary Report (`summary.json`)

```json
{
  "runId": "run-2026-03-30-001",
  "overall": {
    "status": "failed",
    "passedTiers": 2,
    "failedTiers": 1,
    "totalDuration": 312000,
    "totalTests": 89,
    "passed": 82,
    "failed": 7,
    "skipped": 0
  },
  "tiers": {
    "1": { "status": "passed", "tests": 47, "passed": 45, "failed": 2 },
    "2": { "status": "passed", "tests": 24, "passed": 24, "failed": 0 },
    "3": { "status": "failed", "tests": 18, "passed": 13, "failed": 5 }
  },
  "device": {
    "id": "phone-a",
    "name": "iPhone 14 Pro",
    "platform": "ios",
    "osVersion": "17.4",
    "result": "failed"
  },
  "flaky": {
    "detected": 2,
    "tests": ["TC-004", "TC-010"]
  },
  "recommendations": [
    {
      "type": "flaky_test",
      "severity": "medium",
      "test": "TC-004: Account Lockout",
      "issue": "Fails 1 in 3 runs on iOS 17.4 - timing issue with animation delay",
      "action": "Increase waitFor timeout in test"
    }
  ]
}
```

---

## Human-Readable Summary (`summary.md`)

Generated for each run:

```markdown
# Test Run Summary

**Run ID:** run-2026-03-30-001  
**Status:** FAILED (1 of 3 tiers failed)  
**Duration:** 5m 12s  
**Timestamp:** 2026-03-30 14:00:00 UTC

## Results by Tier

| Tier | Runner | Tests | Passed | Failed | Duration | Status |
|------|--------|-------|--------|--------|----------|--------|
| 1 | Jest | 47 | 45 | 2 | 28.5s | PASSED |
| 2 | RNTL | 24 | 24 | 0 | 45.2s | PASSED |
| 3 | Detox | 18 | 13 | 5 | 4m 38s | FAILED |

## Failed Tests

### Tier 1 (2 failures)

1. **Login Flow › should authenticate with valid token**
   - Location: `tests/tier1/auth/login-logic.test.ts:67`
   - Error: `Expected 200 but got 401`
   - Retries: 1/2
   - Likely flaky: NO

2. **Password Validation › should enforce minimum length**
   - Location: `tests/tier1/auth/validation.test.ts:23`
   - Error: `Expected false but got true`
   - Retries: 0/2
   - Likely flaky: NO

### Tier 3 (5 failures)

1. **TC-004: Account Lockout › should lock after 5 failures**
   - Location: `tests/tier3/auth/LoginFlow.spec.ts:89`
   - Error: `Expected lockout message but found generic error`
   - Device: iPhone 14 Pro (iOS 17.4)
   - Screenshot: `artifacts/screenshots/TC-004-failure-001.png`
   - **Flaky: YES** (fails 1 in 3 runs)

## Flaky Tests Detected

| Test | Flakiness Rate | Issue | Recommendation |
|------|----------------|-------|----------------|
| TC-004: Account Lockout | 33% | Animation delay causing premature tap | Increase `waitFor` timeout by 500ms |
| TC-010: Push Notification | 20% | Race condition on notification permission | Mock notification in test |

## Coverage

**Tier 1 Coverage:** 85.2% lines

## Recommendations

1. **[MEDIUM]** TC-004 has 33% flakiness rate - increase timeout
2. **[LOW]** Password validation edge case not covered in Tier 2

## Artifacts

- Coverage report: `tier-1-coverage/lcov-report/index.html`
- Screenshots: `artifacts/screenshots/`
- Crash logs: `artifacts/crash-logs/`

---
*Generated by mobile-test-suite v0.1.0*
```

---

## Flakiness Detection

### Why Flakiness Matters

A test that fails 30% of the time:
- Trains developers to ignore failures
- Blocks legitimate PRs 30% of the time
- Erodes trust in the test suite
- Costs hours of investigation time

### Detection Algorithm

```
flakiness_rate = failures_on_retry / total_retries

if flakiness_rate >= 0.3:
    mark as FLKY
```

**Implementation:**

```typescript
interface FlakinessTracker {
  // In-memory during run
  testRuns: Map<string, TestRun[]>;
  
  // Persistent (SQLite)
  historicalRuns: TestRun[];
}

interface TestRun {
  testId: string;
  runId: string;
  status: 'passed' | 'failed';
  timestamp: Date;
  duration: number;
  device?: string;
  error?: string;
}

function detectFlakiness(testId: string, historicalRuns: TestRun[]): FlakinessReport {
  const runs = historicalRuns.filter(r => r.testId === testId);
  const totalRuns = runs.length;
  
  if (totalRuns < 3) {
    return { flaky: false, rate: 0, confidence: 'low', sampleSize: totalRuns };
  }
  
  // Count runs where first attempt failed but retry passed
  let falsePositives = 0;
  let retries = 0;
  
  for (const run of runs) {
    if (run.attempts > 1) {
      retries++;
      if (run.status === 'passed' && run.firstAttemptFailed) {
        falsePositives++;
      }
    }
  }
  
  const flakinessRate = retries > 0 ? falsePositives / retries : 0;
  
  return {
    flaky: flakinessRate >= 0.3,
    rate: flakinessRate,
    confidence: totalRuns >= 10 ? 'high' : 'medium',
    sampleSize: totalRuns,
    recentRuns: runs.slice(-10),
  };
}
```

### Flakiness History Database

Store in `~/.mobile-test-suite/flakiness.db` (SQLite):

```sql
CREATE TABLE test_runs (
  id INTEGER PRIMARY KEY,
  test_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'passed', 'failed', 'skipped'
  duration_ms INTEGER,
  error_type TEXT,
  error_message TEXT,
  device_id TEXT,
  platform TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(test_id, run_id)
);

CREATE TABLE test_flakiness (
  test_id TEXT PRIMARY KEY,
  flakiness_rate REAL,
  total_runs INTEGER,
  last_updated DATETIME,
  status TEXT DEFAULT 'monitoring', -- 'monitoring', 'quarantined', 'fixed'
  notes TEXT
);

CREATE INDEX idx_test_runs_test_id ON test_runs(test_id);
CREATE INDEX idx_test_runs_created ON test_runs(created_at);
```

### Flakiness Report (`flaky-tests.json`)

```json
{
  "runId": "run-2026-03-30-001",
  "analyzedAt": "2026-03-30T14:05:00Z",
  "totalTestsAnalyzed": 89,
  "flakyTestsDetected": 2,
  "quarantinedTests": 0,
  "flakyTests": [
    {
      "testId": "TC-004",
      "name": "Account Lockout",
      "location": "tests/tier3/auth/LoginFlow.spec.ts:89",
      "flakinessRate": 0.33,
      "sampleSize": 15,
      "confidence": "high",
      "firstFailureMode": "timeout",
      "pattern": "Fails on iOS 17.4, passes on iOS 17.3",
      "recommendation": "Increase waitFor timeout to 5000ms",
      "status": "monitoring"
    },
    {
      "testId": "TC-010",
      "name": "Push Notification Permission",
      "location": "tests/tier3/notifications/PushFlow.spec.ts:45",
      "flakinessRate": 0.20,
      "sampleSize": 10,
      "confidence": "medium",
      "firstFailureMode": "race_condition",
      "pattern": "Random failure when permission dialog appears",
      "recommendation": "Mock notification permission in test",
      "status": "monitoring"
    }
  ],
  "quarantineRecommendations": [
    {
      "testId": "TC-004",
      "reason": "Flakiness rate 33% exceeds 30% threshold",
      "action": "Would quarantine - run with: --quarantine=TC-004",
      "requiresApproval": true
    }
  ]
}
```

---

## Report Generation

### CLI Command

```bash
mobile-test-suite report [--run=<run-id>] [--format=json|markdown|html] [--output=<path>]
```

### HTML Report

Optional HTML report with charts:

```bash
mobile-test-suite report --run=run-2026-03-30-001 --format=html --output=reports/test-report.html
```

**HTML includes:**
- Summary statistics
- Tier-by-tier breakdown
- Flaky test timeline chart
- Failure distribution
- Expandable test details

---

## Notification on Failure

After each run, optionally notify:

```yaml
# mobile-test-suite.config.js
module.exports = {
  notifications: {
    onFailure: {
      slack: {
        webhookUrl: process.env.SLACK_WEBHOOK,
        channel: '#mobile-tests',
        mentionOnFlaky: true,
      },
      // or
      email: {
        to: 'team@example.com',
        onlyOnFlaky: true,
      }
    }
  }
};
```

---

## Test Run Retention

Old runs are pruned automatically:

```yaml
# mobile-test-suite.config.js
module.exports = {
  retention: {
    maxRuns: 100,
    maxAge: '30d',  # or '7d', '90d'
    keepFlakyRuns: true,  # always keep runs with flaky tests
    keepFailedRuns: true,  # always keep failed runs
  }
};
```

---

## Integration with IMPLEMENTATION_PLAN.md

When Ralph detects test failures, it updates `IMPLEMENTATION_PLAN.md`. The reporting layer should support this:

```bash
# Generate report and update IMPLEMENTATION_PLAN
mobile-test-suite report --run=<run-id> --update-plan
```

**This appends to IMPLEMENTATION_PLAN.md:**

```markdown
## Test Results (2026-03-30 14:00)

| Test | Tier | Status | Issue |
|------|------|--------|-------|
| TC-001 | 1 | PASSED | |
| TC-002 | 1 | PASSED | |
| TC-003 | 1 | FAILED | Wrong password error not thrown - needs implementation |
| TC-004 | 3 | FLAKY | Timeout issue on iOS 17.4 - increase waitFor |
```

---

## CLI Integration

### `--json` Output for CI

```bash
# Machine-readable output for CI
mobile-test-suite test --tier=all --format=json | tee test-results.json
```

**CI can then:**
```bash
if grep '"status": "failed"' test-results.json; then
  echo "Tests failed, not deploying"
  exit 1
fi
```

### JUnit XML Output (CI Compatibility)

```bash
mobile-test-suite report --run=<run-id> --format=junit --output=results.xml
```

**Compatible with Jenkins, CircleCI, GitHub Actions.**

---

## Artifact Retention

| Artifact | Retention | Location |
|----------|-----------|----------|
| Run metadata | 30 days | `test-results/<run-id>/run.json` |
| Tier results | 30 days | `test-results/<run-id>/tier-*-results.json` |
| Coverage reports | 30 days | `test-results/<run-id>/tier-*-coverage/` |
| Failure screenshots | Until fixed | `test-results/<run-id>/artifacts/screenshots/` |
| Crash logs | Until fixed | `test-results/<run-id>/artifacts/crash-logs/` |
| Flakiness DB | Permanent | `~/.mobile-test-suite/flakiness.db` |
