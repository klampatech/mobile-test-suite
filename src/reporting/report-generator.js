/**
 * Report Generator
 * Generates test reports in various formats
 */

const fs = require('fs');
const path = require('path');

async function generateReport(summary, format = 'json') {
  switch (format) {
    case 'json':
      return generateJsonReport(summary);
    case 'markdown':
      return generateMarkdownReport(summary);
    case 'html':
      return generateHtmlReport(summary);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

function generateJsonReport(summary) {
  return JSON.stringify(summary, null, 2);
}

function generateMarkdownReport(summary) {
  let md = `# Test Run Summary\n\n`;
  md += `**Run ID:** ${summary.runId}\n`;
  md += `**Status:** ${summary.overall.status === 'passed' ? 'PASSED' : 'FAILED'}\n`;
  md += `**Duration:** ${formatDuration(summary.duration)}\n`;
  md += `**Timestamp:** ${summary.timestamp}\n\n`;

  md += `## Results by Tier\n\n`;
  md += `| Tier | Runner | Tests | Passed | Failed | Duration | Status |\n`;
  md += `|------|--------|-------|--------|--------|----------|--------|\n`;

  Object.entries(summary.tiers).forEach(([tier, result]) => {
    const status = result.failed === 0 ? 'PASSED' : 'FAILED';
    md += `| ${tier} | ${result.runner || 'N/A'} | ${result.total || '-'} | ${result.passed || 0} | ${result.failed || 0} | ${formatDuration(result.duration)} | ${status} |\n`;
  });

  md += `\n`;

  const failures = Object.entries(summary.tiers)
    .filter(([, r]) => r.failed > 0)
    .flatMap(([tier, r]) => (r.tests || []).filter(t => t.status === 'failed'));

  if (failures.length > 0) {
    md += `## Failed Tests\n\n`;
    failures.forEach((test) => {
      md += `### ${test.name}\n`;
      md += `- Location: \`${test.location || 'unknown'}\`\n`;
      if (test.error) md += `- Error: ${test.error}\n`;
    });
  }

  return md;
}

function generateHtmlReport(summary) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Test Report - ${summary.runId}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .summary { display: flex; gap: 30px; margin: 20px 0; }
    .summary-item { padding: 15px; background: #f9f9f9; border-radius: 6px; }
    .summary-item .label { font-size: 12px; color: #888; text-transform: uppercase; }
    .summary-item .value { font-size: 24px; font-weight: bold; color: #333; }
    .passed { color: #28a745; }
    .failed { color: #dc3545; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f9f9f9; font-weight: 600; }
    .status-passed { color: #28a745; font-weight: bold; }
    .status-failed { color: #dc3545; font-weight: bold; }
    .error { background: #fff5f5; border-left: 3px solid #dc3545; padding: 10px; margin: 10px 0; font-family: monospace; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Report</h1>
    <div class="summary">
      <div class="summary-item">
        <div class="label">Run ID</div>
        <div class="value">${summary.runId}</div>
      </div>
      <div class="summary-item">
        <div class="label">Status</div>
        <div class="value ${summary.overall.status}">${summary.overall.status.toUpperCase()}</div>
      </div>
      <div class="summary-item">
        <div class="label">Duration</div>
        <div class="value">${formatDuration(summary.duration)}</div>
      </div>
    </div>

    <h2>Results by Tier</h2>
    <table>
      <thead>
        <tr>
          <th>Tier</th>
          <th>Runner</th>
          <th>Tests</th>
          <th>Passed</th>
          <th>Failed</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(summary.tiers).map(([tier, result]) => `
        <tr>
          <td>Tier ${tier}</td>
          <td>${result.runner || 'N/A'}</td>
          <td>${result.total || '-'}</td>
          <td class="passed">${result.passed || 0}</td>
          <td class="${result.failed > 0 ? 'failed' : ''}">${result.failed || 0}</td>
          <td class="status-${result.failed === 0 ? 'passed' : 'failed'}">${result.failed === 0 ? 'PASSED' : 'FAILED'}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>

    ${generateFailuresHtml(summary)}
  </div>
</body>
</html>`;

  return html;
}

function generateFailuresHtml(summary) {
  const failures = Object.entries(summary.tiers)
    .filter(([, r]) => r.failed > 0)
    .flatMap(([tier, r]) => (r.tests || []).filter(t => t.status === 'failed'));

  if (failures.length === 0) return '';

  let html = '<h2>Failed Tests</h2>';

  failures.forEach((test) => {
    html += `<div class="error">`;
    html += `<strong>${test.name}</strong><br>`;
    if (test.location) html += `Location: ${test.location}<br>`;
    if (test.error) html += `Error: ${test.error}`;
    html += `</div>`;
  });

  return html;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

async function saveReport(report, outputPath, format) {
  const fullPath = format === 'html' && !outputPath.endsWith('.html')
    ? `${outputPath}.html`
    : outputPath;

  fs.writeFileSync(fullPath, report);
  return fullPath;
}

module.exports = {
  generateReport,
  generateJsonReport,
  generateMarkdownReport,
  generateHtmlReport,
  saveReport,
  formatDuration,
};