/**
 * Unit tests for spec parser module
 */

const { parseSpec, parseMarkdown, validateSpec, toPromptContext } = require('../src/parser/spec-parser');

describe('spec-parser', () => {
  describe('parseMarkdown', () => {
    it('should parse a basic spec with feature and requirements', () => {
      const content = `# Feature: User Login

### REQ-1: Valid Credentials
**Priority:** must-have
**Platform:** ios, android

**Given** the user is on the login screen
**When** the user enters valid credentials
**Then** the user should be logged in successfully

**Edge Cases:**
- Invalid credentials → Show error message
- Network offline → Show offline message

**Test Scenarios:**
- \`TC-1\` Successful login with valid credentials
- \`TC-2\` Login failure with wrong password
`;

      const result = parseMarkdown(content, 'user-login');

      expect(result.feature).toBe('User Login');
      expect(result.requirements).toHaveLength(1);
      expect(result.requirements[0].id).toBe('REQ-1');
      expect(result.requirements[0].name).toBe('Valid Credentials');
      expect(result.requirements[0].priority).toBe('must-have');
      expect(result.requirements[0].platform).toEqual(['ios', 'android']);
      expect(result.requirements[0].given).toContain('the user is on the login screen');
      expect(result.requirements[0].when).toBe('the user enters valid credentials');
      expect(result.requirements[0].then).toContain('the user should be logged in successfully');
      expect(result.requirements[0].edgeCases).toHaveLength(2);
      expect(result.requirements[0].testScenarios).toHaveLength(2);
    });

    it('should handle multiple requirements', () => {
      const content = `# Feature: User Authentication

### REQ-1: Login
**Priority:** must-have
**Given** user is on login screen
**When** user enters credentials
**Then** user is logged in

### REQ-2: Logout
**Priority:** should-have
**Given** user is logged in
**When** user taps logout
**Then** user is logged out
`;

      const result = parseMarkdown(content, 'auth');

      expect(result.requirements).toHaveLength(2);
      expect(result.requirements[0].id).toBe('REQ-1');
      expect(result.requirements[1].id).toBe('REQ-2');
    });

    it('should handle And statements', () => {
      const content = `# Feature: Checkout

### REQ-1: Complete Purchase
**Priority:** must-have
**Given** user has items in cart
**And** user has added payment method
**When** user taps purchase
**Then** order is placed
**And** confirmation is shown
`;

      const result = parseMarkdown(content, 'checkout');

      const req = result.requirements[0];
      expect(req.given).toHaveLength(2);
      expect(req.then).toHaveLength(2);
    });

    it('should default platform to null when not specified', () => {
      const content = `# Feature: Test

### REQ-1: Simple Test
**Priority:** must-have
**Given** something
**When** something happens
**Then** something happens
`;

      const result = parseMarkdown(content, 'test');

      expect(result.requirements[0].platform).toBeNull();
    });
  });

  describe('validateSpec', () => {
    it('should throw error when feature is missing', () => {
      const spec = { feature: '', requirements: [] };
      expect(() => validateSpec(spec)).toThrow('Feature name is required');
    });

    it('should throw error when no requirements', () => {
      const spec = { feature: 'Test', requirements: [] };
      expect(() => validateSpec(spec)).toThrow('At least one requirement is required');
    });

    it('should throw error when requirement missing id', () => {
      const spec = { feature: 'Test', requirements: [{ name: 'Test', priority: 'must-have' }] };
      expect(() => validateSpec(spec)).toThrow('Requirement 1: ID is required');
    });

    it('should throw error when requirement missing name', () => {
      const spec = { feature: 'Test', requirements: [{ id: 'REQ-1', priority: 'must-have' }] };
      expect(() => validateSpec(spec)).toThrow('Requirement 1: Name is required');
    });

    it('should throw error when requirement missing priority', () => {
      const spec = { feature: 'Test', requirements: [{ id: 'REQ-1', name: 'Test' }] };
      expect(() => validateSpec(spec)).toThrow('Requirement 1: Priority is required');
    });

    it('should return true for valid spec', () => {
      const spec = {
        feature: 'Test',
        requirements: [{ id: 'REQ-1', name: 'Test', priority: 'must-have' }]
      };
      expect(validateSpec(spec)).toBe(true);
    });
  });

  describe('toPromptContext', () => {
    it('should generate context string from spec', () => {
      const spec = {
        feature: 'Login',
        requirements: [{
          id: 'REQ-1',
          name: 'Login',
          priority: 'must-have',
          given: ['user is on login screen'],
          when: 'user enters credentials',
          then: ['user is logged in'],
          edgeCases: [{ condition: 'wrong password', expected: 'show error' }],
          testScenarios: [{ id: 'TC-1', name: 'successful login' }]
        }]
      };

      const context = toPromptContext(spec);

      expect(context).toContain('Feature: Login');
      expect(context).toContain('Requirement: REQ-1 - Login');
      expect(context).toContain('Priority: must-have');
      expect(context).toContain('**Given** user is on login screen');
      expect(context).toContain('**When** user enters credentials');
      expect(context).toContain('**Then** user is logged in');
      expect(context).toContain('Edge Cases:');
      expect(context).toContain('wrong password → show error');
      expect(context).toContain('Test Scenarios:');
      expect(context).toContain('`TC-1` successful login');
    });
  });

  describe('parseSpec', () => {
    it('should throw error when file does not exist', async () => {
      await expect(parseSpec('/nonexistent/file.md')).rejects.toThrow('Spec file not found');
    });
  });
});