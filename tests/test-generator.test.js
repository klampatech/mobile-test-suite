/**
 * Unit tests for test generator module
 */

const { parseGeneratedCode } = require('../src/generator/test-generator');

describe('test-generator', () => {
  describe('parseGeneratedCode', () => {
    it('should extract code from TypeScript code block', () => {
      const response = `\`\`\`typescript
import { test, expect } from '@testing-library/react-native';

test('should render login form', () => {
  expect(true).toBe(true);
});
\`\`\``;

      const result = parseGeneratedCode(response, 1);

      expect(result.code).toContain('import { test, expect }');
      expect(result.code).toContain("expect(true).toBe(true)");
      expect(result.extension).toBe('test.ts');
      expect(result.testCount).toBe(1);
    });

    it('should extract code from TSX code block for tier 2', () => {
      const response = `\`\`\`typescript
import React from 'react';
import { render } from '@testing-library/react-native';

test('component renders', () => {
  expect(true).toBe(true);
});
\`\`\``;

      const result = parseGeneratedCode(response, 2);

      expect(result.extension).toBe('test.tsx');
    });

    it('should extract code from spec for tier 3', () => {
      const response = `\`\`\`typescript
describe('Login Screen', () => {
  it('should allow login', () => {
    expect(true).toBe(true);
  });
});
\`\`\``;

      const result = parseGeneratedCode(response, 3);

      expect(result.extension).toBe('spec.ts');
    });

    it('should handle code without code block', () => {
      const response = `import { test, expect } from '@testing-library/react-native';

test('simple test', () => {
  expect(true).toBe(true);
});`;

      const result = parseGeneratedCode(response, 1);

      expect(result.code).toContain('import { test, expect }');
      expect(result.testCount).toBe(1);
    });

    it('should count multiple tests', () => {
      const response = `\`\`\`typescript
test('test 1', () => {});
test('test 2', () => {});
it('test 3', () => {});
\`\`\``;

      const result = parseGeneratedCode(response, 1);

      expect(result.testCount).toBe(3);
    });

    it('should handle JavaScript code block', () => {
      const response = `\`\`\`javascript
test('js test', () => {
  expect(true).toBe(true);
});
\`\`\``;

      const result = parseGeneratedCode(response, 1);

      expect(result.code).toContain('test');
      expect(result.testCount).toBe(1);
    });
  });
});