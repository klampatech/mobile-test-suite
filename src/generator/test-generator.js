/**
 * Test Generator
 * Generates tests using LLM API calls
 */

const fs = require('fs');
const path = require('path');
const { toPromptContext } = require('../parser/spec-parser');

let Anthropic;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch (e) {}

async function generateTests(spec, options) {
  const {
    outputDir,
    tiers = [1, 2, 3],
    force = false,
    model = 'claude-sonnet-4-20250514',
    apiKeyEnv = 'ANTHROPIC_API_KEY',
    provider = 'anthropic',
  } = options;

  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(`API key not set. Set ${apiKeyEnv} environment variable.`);
  }

  const results = [];
  const context = toPromptContext(spec);

  for (const tier of tiers) {
    try {
      const tierResult = await generateTierTests(spec, tier, {
        apiKey,
        model,
        provider,
        context,
      });

      results.push(tierResult);
    } catch (error) {
      console.error(`Error generating Tier ${tier} tests: ${error.message}`);
      results.push({
        tier,
        error: error.message,
        file: null,
        tests: 0,
      });
    }
  }

  return results;
}

async function generateTierTests(spec, tier, options) {
  const { apiKey, model, provider, context } = options;

  const systemPrompt = getSystemPrompt(tier);
  const userPrompt = getUserPrompt(spec, tier);

  let generatedCode;

  if (provider === 'anthropic' && Anthropic) {
    generatedCode = await generateWithAnthropic(apiKey, model, systemPrompt, userPrompt, context);
  } else {
    generatedCode = await generateWithAxios(apiKey, model, systemPrompt, userPrompt, context);
  }

  const parsed = parseGeneratedCode(generatedCode, tier);

  return {
    tier,
    file: parsed.fileName,
    code: parsed.code,
    tests: parsed.testCount,
    validated: false,
  };
}

async function generateWithAnthropic(apiKey, model, systemPrompt, userPrompt, context) {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `${userPrompt}\n\n---\n\nContext:\n${context}`,
      },
    ],
  });

  return response.content[0].text;
}

async function generateWithAxios(apiKey, model, systemPrompt, userPrompt, context) {
  const axios = require('axios');

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${userPrompt}\n\n---\n\nContext:\n${context}`,
        },
      ],
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.content[0].text;
}

function getSystemPrompt(tier) {
  const prompts = {
    1: `You are an expert Jest test engineer. Generate unit/logic tests for React Native applications.

**TIER 1 - Unit/Logic Tests (Jest)**
- Test business logic in isolation
- Mock all external dependencies (API, storage, native modules)
- Focus on pure functions, validation, state machines
- NO React components, NO JSX
- Use jest.fn() for mocks
- File should be named: <requirement>-logic.test.ts`,

    2: `You are an expert React Native Testing Library engineer. Generate component integration tests.

**TIER 2 - Component Tests (RNTL)**
- Test component behavior with @testing-library/react-native
- Mock native modules (Animated, AsyncStorage, Navigation)
- Focus on user interactions, state updates, rendering
- Use fireEvent and waitFor for async tests
- File should be named: <requirement>-component.test.tsx`,

    3: `You are an expert Detox E2E test engineer. Generate end-to-end tests for real devices.

**TIER 3 - E2E Tests (Detox)**
- Test full user flows on real devices
- NO mocking - real API, real navigation
- Use testID for element matching (not text)
- Focus on user-visible behavior
- File should be named: <requirement>-e2e.spec.ts`,
  };

  return prompts[tier] || prompts[1];
}

function getUserPrompt(spec, tier) {
  return `Generate ${tier === 1 ? 'Tier 1 (Jest unit tests)' : tier === 2 ? 'Tier 2 (RNTL component tests)' : 'Tier 3 (Detox E2E tests)'} for the following requirement.

IMPORTANT:
- Output ONLY the code block, no explanations
- Use testID attributes for elements in Tier 2/3
- Include proper imports and jest/Detox imports
- Each test should be comprehensive
- Follow the naming convention: <feature-name>-<type>.test.ts/tsx/spec.ts

Generate the test code now.`;
}

function parseGeneratedCode(response, tier) {
  const codeBlockMatch = response.match(/```(?:typescript|ts|javascript)?\s*\n([\s\S]*?)```/);
  const code = codeBlockMatch ? codeBlockMatch[1].trim() : response.trim();

  const extension = tier === 3 ? 'spec.ts' : tier === 2 ? 'test.tsx' : 'test.ts';
  const testCount = (code.match(/\btest\(|it\(/g) || []).length;

  return {
    code,
    extension,
    testCount,
    fileName: `generated-test.${extension}`,
  };
}

async function writeTests(generatedTests, outputDir) {
  const written = [];

  for (const test of generatedTests) {
    if (test.error || !test.code) continue;

    const tierDir = path.join(outputDir, `tier${test.tier}`);
    if (!fs.existsSync(tierDir)) {
      fs.mkdirSync(tierDir, { recursive: true });
    }

    const filePath = path.join(tierDir, test.file);
    fs.writeFileSync(filePath, test.code);

    written.push({
      tier: test.tier,
      file: filePath,
      tests: test.testCount,
    });
  }

  return written;
}

async function validateGeneratedCode(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');

  const hasImport = code.includes('import');
  const hasTest = code.includes('test(') || code.includes('it(');

  if (!hasImport || !hasTest) {
    throw new Error('Generated code appears invalid (missing imports or tests)');
  }

  return true;
}

module.exports = {
  generateTests,
  generateTierTests,
  parseGeneratedCode,
  writeTests,
  validateGeneratedCode,
};