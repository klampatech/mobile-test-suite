/**
 * Spec Parser
 * Parses markdown specification files into structured requirements
 */

const fs = require('fs');
const path = require('path');

async function parseSpec(specPath) {
  if (!fs.existsSync(specPath)) {
    throw new Error(`Spec file not found: ${specPath}`);
  }

  const content = fs.readFileSync(specPath, 'utf-8');
  const _specDir = path.dirname(specPath);
  const specName = path.basename(specPath, '.md');

  return parseMarkdown(content, specName);
}

function parseMarkdown(content, specName) {
  const lines = content.split('\n');
  const result = {
    feature: specName,
    requirements: [],
    metadata: {},
  };

  let currentRequirement = null;
  let inEdgeCases = false;
  let inTestScenarios = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const featureMatch = line.match(/^#\s+Feature:\s+(.+)$/i);
    if (featureMatch) {
      result.feature = featureMatch[1].trim();
      continue;
    }

    const reqMatch = line.match(/^###\s+(REQ-\d+):\s+(.+)$/i);
    if (reqMatch) {
      if (currentRequirement) {
        result.requirements.push(currentRequirement);
      }
      currentRequirement = {
        id: reqMatch[1],
        name: reqMatch[2].trim(),
        priority: 'must-have',
        given: [],
        when: '',
        then: [],
        edgeCases: [],
        testScenarios: [],
        platform: null,
      };
      inEdgeCases = false;
      inTestScenarios = false;
      continue;
    }

    if (currentRequirement) {
      const priorityMatch = line.match(/^\*\*Priority:\*\*\s+(must-have|should-have|could-have)$/i);
      if (priorityMatch) {
        currentRequirement.priority = priorityMatch[1].toLowerCase();
        continue;
      }

      const platformMatch = line.match(/^\*\*Platform:\*\*\s+(.+)$/i);
      if (platformMatch) {
        const platforms = platformMatch[1].split(',').map(p => p.trim().toLowerCase());
        currentRequirement.platform = platforms;
        continue;
      }

      const givenMatch = line.match(/^\*\*Given\*\*\s+(.+)$/i);
      if (givenMatch) {
        currentRequirement.given.push(givenMatch[1].trim());
        continue;
      }

      const whenMatch = line.match(/^\*\*When\*\*\s+(.+)$/i);
      if (whenMatch) {
        currentRequirement.when = whenMatch[1].trim();
        continue;
      }

      const thenMatch = line.match(/^\*\*Then\*\*\s+(.+)$/i);
      if (thenMatch) {
        currentRequirement.then.push(thenMatch[1].trim());
        continue;
      }

      const andMatch = line.match(/^\*\*And\*\*\s+(.+)$/i);
      if (andMatch && (currentRequirement.given.length > 0 || currentRequirement.then.length > 0)) {
        if (currentRequirement.given.length > 0 && !currentRequirement.when) {
          currentRequirement.given.push(andMatch[1].trim());
        } else {
          currentRequirement.then.push(andMatch[1].trim());
        }
        continue;
      }

      if (line.match(/^\*\*Edge Cases:\*\*$/i)) {
        inEdgeCases = true;
        inTestScenarios = false;
        continue;
      }

      if (line.match(/^\*\*Test Scenarios:\*\*$/i)) {
        inTestScenarios = true;
        inEdgeCases = false;
        continue;
      }

      if (inEdgeCases && line.startsWith('- ')) {
        const edgeText = line.substring(2).trim();
        const arrowIndex = edgeText.indexOf('→');
        if (arrowIndex > 0) {
          currentRequirement.edgeCases.push({
            condition: edgeText.substring(0, arrowIndex).trim(),
            expected: edgeText.substring(arrowIndex + 1).trim(),
          });
        } else {
          currentRequirement.edgeCases.push({
            condition: edgeText,
            expected: '',
          });
        }
        continue;
      }

      if (inTestScenarios && line.startsWith('- ')) {
        const scenarioText = line.substring(2).trim();
        const tcMatch = scenarioText.match(/`TC-(\d+)`\s+(.+)$/);
        if (tcMatch) {
          currentRequirement.testScenarios.push({
            id: `TC-${tcMatch[1]}`,
            name: tcMatch[2].trim(),
          });
        } else {
          currentRequirement.testScenarios.push({
            id: '',
            name: scenarioText,
          });
        }
        continue;
      }
    }
  }

  if (currentRequirement) {
    result.requirements.push(currentRequirement);
  }

  return result;
}

function validateSpec(spec) {
  const errors = [];

  if (!spec.feature) {
    errors.push('Feature name is required');
  }

  if (!spec.requirements || spec.requirements.length === 0) {
    errors.push('At least one requirement is required');
  }

  spec.requirements.forEach((req, index) => {
    if (!req.id) {
      errors.push(`Requirement ${index + 1}: ID is required`);
    }
    if (!req.name) {
      errors.push(`Requirement ${index + 1}: Name is required`);
    }
    if (!req.priority) {
      errors.push(`Requirement ${index + 1}: Priority is required`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`Spec validation failed: ${errors.join(', ')}`);
  }

  return true;
}

function toPromptContext(spec) {
  let context = `Feature: ${spec.feature}\n\n`;

  for (const req of spec.requirements) {
    context += `Requirement: ${req.id} - ${req.name}\n`;
    context += `Priority: ${req.priority}\n`;

    if (req.given.length > 0) {
      context += `**Given** ${req.given.join(', ')}\n`;
    }
    if (req.when) {
      context += `**When** ${req.when}\n`;
    }
    if (req.then.length > 0) {
      context += `**Then** ${req.then.join(', ')}\n`;
    }

    if (req.edgeCases.length > 0) {
      context += '\nEdge Cases:\n';
      req.edgeCases.forEach((ec) => {
        context += `- ${ec.condition} → ${ec.expected}\n`;
      });
    }

    if (req.testScenarios.length > 0) {
      context += '\nTest Scenarios:\n';
      req.testScenarios.forEach((ts) => {
        context += `- \`${ts.id}\` ${ts.name}\n`;
      });
    }

    context += '\n---\n\n';
  }

  return context;
}

module.exports = {
  parseSpec,
  parseMarkdown,
  validateSpec,
  toPromptContext,
};