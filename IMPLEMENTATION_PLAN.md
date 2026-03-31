# Implementation Plan

## Completed

<!-- Completed tasks (can be periodically cleaned out) -->
- Nothing implemented yet - this is a new project

## In Progress

<!-- Tasks currently being worked on -->
- This plan - initial analysis complete

## Backlog

### Phase 1: Core Infrastructure

- [ ] **1.1** Set up project structure and package.json with dependencies
- [ ] **1.2** Create CLI entry point (`bin/cli.js`) with command router
- [ ] **1.3** Implement spec parser (`src/parser/`) to extract requirements from markdown specs
- [ ] **1.4** Implement LLM test generator (`src/generator/`) with API calls to Anthropic/OpenAI

### Phase 2: Test Execution Engine

- [ ] **2.1** Create Jest configuration (`jest.config.js`) for Tier 1 and Tier 2
- [ ] **2.2** Create test mocks (`tests/__mocks__/`) for React Native, AsyncStorage, navigation
- [ ] **2.3** Implement Tier 1 test runner (`src/runners/tier1.ts`) - Jest for logic tests
- [ ] **2.4** Implement Tier 2 test runner (`src/runners/tier2.ts`) - Jest + RNTL for component tests
- [ ] **2.5** Implement Tier 3 test runner (`src/runners/tier3.ts`) - Detox for E2E tests
- [ ] **2.6** Create Detox configuration (`detox.config.js` and `tests/e2e-environment.js`)

### Phase 3: Device Management

- [ ] **3.1** Implement device discovery (`src/devices/discovery.ts`) - iOS via idevice_id, Android via adb
- [ ] **3.2** Implement device registry (`src/devices/registry.ts`) - JSON storage at ~/.mobile-test-suite/
- [ ] **3.3** Implement device drivers (`src/drivers/ios-driver.ts`, `src/drivers/android-driver.ts`)
- [ ] **3.4** Implement device pairing (`mobile-test-suite device pair`)
- [ ] **3.5** Implement device reset/cleanup (`mobile-test-suite device reset`)
- [ ] **3.6** Implement device health checks (`mobile-test-suite device health`)
- [ ] **3.7** Implement device allocation for test runs

### Phase 4: Reporting & Analysis

- [ ] **4.1** Implement test result aggregation (`src/reporting/aggregator.ts`)
- [ ] **4.2** Implement flakiness detection (`src/reporting/flakiness.ts`) with SQLite history
- [ ] **4.3** Implement JSON report generator
- [ ] **4.4** Implement Markdown report generator
- [ ] **4.5** Implement HTML report generator with charts
- [ ] **4.6** Implement test run retention/cleanup

### Phase 5: Project Integration

- [ ] **5.1** Implement init command (`mobile-test-suite init`) to set up test infrastructure
- [ ] **5.2** Create `mobile-test-suite.config.js` template
- [ ] **5.3** Implement generate subcommands (--spec, --output, --tier, --force)
- [ ] **5.4** Implement test subcommands (--tier, --device, --stop-on-fail, --retry)
- [ ] **5.5** Implement report subcommands (--run, --format, --output)

### Phase 6: Orchestration & CI/CD

- [ ] **6.1** Implement tier orchestration with fail-fast logic
- [ ] **6.2** Add build caching for Tier 3 (hash-based rebuild detection)
- [ ] **6.3** Create GitHub Actions workflow template
- [ ] **6.4** Implement notification hooks (Slack, email) on failure

---

## Specification Analysis

### What the specs define:

1. **SPEC.md** - Core CLI interface
   - Commands: generate, test, device, init, report
   - Spec format: Gherkin-style Given/When/Then
   - Exit codes: 0-4 for different failure modes

2. **SPEC_tiers.md** - Three-tier test execution
   - Tier 1: Jest unit/logic tests (~10-30s)
   - Tier 2: RNTL component tests (~30-60s)
   - Tier 3: Detox E2E on real devices (~2-5min)

3. **SPEC_generation.md** - LLM-powered test generation
   - Parser extracts requirements from markdown
   - LLM generates tests in all three tiers
   - Validation: TypeScript compilation, ESLint

4. **SPEC_device.md** - Real device management
   - Device states: unknown → paired → available → in-use → passed/failed
   - iOS: idevice_id, ideviceinstaller
   - Android: adb
   - Health checks: battery, storage, screen, network

5. **SPEC_reporting.md** - Results & flakiness
   - JSON, Markdown, HTML report formats
   - Flakiness detection (SQLite history)
   - Test run retention policies

6. **SPEC_project.md** - Integration
   - Expo vs bare CLI workflows
   - TestID conventions
   - GitHub Actions template
   - Ralph/GasTown orchestration

### What exists vs what's needed:

| Component | Spec Location | Status |
|-----------|-------------|--------|
| CLI router | SPEC.md | Not implemented |
| Spec parser | SPEC_generation.md | Not implemented |
| LLM generator | SPEC_generation.md | Not implemented |
| Jest config | SPEC_tiers.md | Not implemented |
| Tier 1 runner | SPEC_tiers.md | Not implemented |
| Tier 2 runner | SPEC_tiers.md | Not implemented |
| Tier 3 runner | SPEC_tiers.md | Not implemented |
| Detox config | SPEC_tiers.md | Not implemented |
| Device discovery | SPEC_device.md | Not implemented |
| Device registry | SPEC_device.md | Not implemented |
| Device drivers | SPEC_device.md | Not implemented |
| Reporting layer | SPEC_reporting.md | Not implemented |
| Flakiness detection | SPEC_reporting.md | Not implemented |

---

## Implementation Order Rationale

1. **Phase 1 first** because the core CLI and generation logic is the foundation - without parsing specs and generating tests, nothing else matters.

2. **Phase 2 before Phase 3** because we can run Tier 1+2 tests without devices (CI/local). Device management is only needed for Tier 3.

3. **Phase 4 after execution** because reporting requires test results to aggregate - can't report what hasn't run yet.

4. **Phase 5 last** because init and config tie everything together - they depend on all other components being in place.

5. **Phase 6 final** because orchestration builds on all previous phases - it coordinates the whole pipeline.

---

## Dependencies Between Tasks

```
1.1 ─┬─> 1.2 ─> 1.3 ─> 1.4
     │                │
     └────────┬───────┘
              │
              ▼
     2.1 ─> 2.2 ─> 2.3 ─> 2.4 ─> 2.5
              │              │
              │              ▼
              │         3.1 ─> 3.2 ─> 3.3 ─> 3.4 ─> 3.5 ─> 3.6 ─> 3.7
              │
              ▼
         4.1 ─> 4.2 ─> 4.3 ─> 4.4 ─> 4.5 ─> 4.6
              │
              ▼
         5.1 ─> 5.2 ─> 5.3 ─> 5.4 ─> 5.5
              │
              ▼
         6.1 ─> 6.2 ─> 6.3 ─> 6.4
```

---

## Initial Setup Tasks (First Session)

To start implementing this project:

1. Initialize package.json with dependencies
2. Set up TypeScript configuration
3. Create basic CLI entry point
4. Implement spec parser (Phase 1.3)

This provides a working foundation for subsequent phases.
