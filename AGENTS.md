## Build & Run

**Build:** N/A - Pure JavaScript (no build step needed)

**Link for local development:**
```bash
cd /Users/kylelampa/Development/mobile-test-suite
npm link
```

## Validation

Run these after implementing changes:

- Lint: `npx eslint src --ext .js`
- Syntax check: `node --check bin/cli.js`

## Operational Notes

### CLI Commands

```bash
# Initialize a React Native project
mobile-test-suite init [--project=<path>] [--expo | --cli] [--install]

# Generate tests from spec
mobile-test-suite generate --spec=<path> --output=<path> [--tier=1|2|3|all] [--force]

# Run tests
mobile-test-suite test [path] [--tier=1|2|3|all] [--device=<id>] [--stop-on-fail] [--retry=<n>]

# Device management
mobile-test-suite device list
mobile-test-suite device pair [--name=<label>] [--platform=ios|android]
mobile-test-suite device discover [--platform=ios|android|all]
mobile-test-suite device reset <device-id>
mobile-test-suite device health <device-id>

# Generate reports
mobile-test-suite report [--run=<id>] [--format=json|markdown|html|junit] [--output=<path>]
```

### Environment Variables

Set these before using generation or device features:

```bash
export ANTHROPIC_API_KEY="your-api-key"  # Required for test generation
export LLM_PROVIDER="anthropic"          # Optional, default: anthropic
export LLM_MODEL="claude-sonnet-4-20250514"  # Optional
```

### Flakiness Detection

Test results are automatically recorded to `~/.mobile-test-suite/flakiness.json` for tracking flaky tests. Use the `--retry` flag to handle flaky tests:

```bash
mobile-test-suite test --tier=1 --retry=3
```

### Tier Execution Order

Tier 1 (Jest, ~10-30s) → Tier 2 (RNTL, ~30-60s) → Tier 3 (Detox, ~2-5min)

Fail-fast: Use `--stop-on-fail` to halt on Tier 1 failure.

### Test Result Persistence

After each test run, results are saved to `test-results/<run-id>/`:
- `run.json` - Run metadata
- `tier-1-results.json`, `tier-2-results.json`, `tier-3-results.json` - Tier results
- `summary.json` - Aggregated results
- `summary.md` - Human-readable report
- `summary.html` - HTML report
- `results.xml` - JUnit XML for CI

Use `mobile-test-suite report --run=<run-id>` to generate reports from saved results.

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Spec invalid / parse error |
| 2 | Output not writable / no tests found |
| 3 | LLM generation failed / device connection failed |
| 4 | Build failed |

---

## Codebase Patterns

### File Structure
```
src/
├── cli/           # Command handlers (generate.js, test.js, device.js, init.js, report.js)
├── config/        # Configuration loader
├── parser/        # Spec file parser (spec-parser.js)
├── generator/      # LLM-powered test generation (test-generator.js)
├── runners/       # Tier 1/2/3 test runners
├── devices/       # Device discovery and registry
├── drivers/       # iOS/Android device drivers
└── reporting/    # Result aggregation and report generation
```

### CLI Entry Point
- bin/cli.js - Main CLI router using commander

### Test Result Format
```javascript
{
  tier: 1 | 2 | 3,
  runner: 'jest' | 'detox',
  duration: number,
  passed: number,
  failed: number,
  skipped: number,
  tests: TestResult[],
  errors: string[]
}
```

### Device State Machine
`unknown → paired → available → in-use → passed/failed`

### Notes
- JavaScript files (no TypeScript compilation required)
- Requires Node.js >= 18
- iOS device operations require: idevice_id, ideviceinstaller (install via Homebrew)
- Android device operations require: adb (Android SDK)