/**
 * Notification Service
 * Sends notifications on test failure (Slack, email)
 */

const axios = require('axios');
const chalk = require('chalk');

/**
 * Send notifications based on test results
 * @param {Object} config - Notification configuration
 * @param {Object} summary - Test run summary
 */
async function sendNotifications(config, summary) {
  const notifications = config.notifications || {};
  const onFailure = notifications.onFailure || {};

  if (summary.overall.status !== 'failed') {
    console.log(chalk.dim('All tests passed, skipping notifications'));
    return;
  }

  console.log(chalk.yellow('Tests failed, sending notifications...'));

  // Send Slack notification
  if (onFailure.slack && onFailure.slack.enabled) {
    await sendSlackNotification(onFailure.slack, summary);
  }

  // Send email notification (if configured)
  if (onFailure.email && onFailure.email.enabled) {
    await sendEmailNotification(onFailure.email, summary);
  }
}

/**
 * Send Slack notification
 * @param {Object} slackConfig - Slack configuration
 * @param {Object} summary - Test summary
 */
async function sendSlackNotification(slackConfig, summary) {
  const { webhookUrl, channel, mentionOnFlaky } = slackConfig;

  if (!webhookUrl) {
    console.warn(chalk.yellow('Slack webhook URL not configured'));
    return;
  }

  const failedCount = summary.overall.failed || 0;
  const totalCount = summary.overall.totalTests || 0;
  const passedCount = summary.overall.passed || 0;
  const tierResults = Object.entries(summary.tiers || {})
    .map(([tier, result]) => `Tier ${tier}: ${result.passed || 0}/${result.total || 0} passed`)
    .join('\n');

  const mention = mentionOnFlaky && summary.flaky?.detected > 0 ? '<!here> ' : '';

  const message = {
    channel,
    text: `${mention}Test Run Failed: ${summary.runId}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🚨 Test Run Failed: ${summary.runId}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Failed:*\n${failedCount}/${totalCount}`,
          },
          {
            type: 'mrkdwn',
            text: `*Passed:*\n${passedCount}`,
          },
          {
            type: 'mrkdwn',
            text: `*Duration:*\n${formatDuration(summary.duration)}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Tier Results:*\n${tierResults}`,
        },
      },
    ],
  };

  // Add flaky tests section if present
  if (summary.flaky?.detected > 0) {
    const flakyTests = summary.flaky.tests || [];
    message.blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⚠️ Flaky Tests Detected:*\n${flakyTests.join(', ')}`,
      },
    });
  }

  // Add failed tests details
  const failedTests = Object.entries(summary.tiers || {})
    .flatMap(([tier, result]) => (result.tests || [])
      .filter(t => t.status === 'failed')
      .map(t => ({ tier, ...t })))
    .slice(0, 5); // Limit to 5

  if (failedTests.length > 0) {
    const failureText = failedTests
      .map(t => `• Tier ${t.tier}: ${t.name}${t.error ? ` - ${t.error}` : ''}`)
      .join('\n');

    message.blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Failed Tests (first 5):*\n${failureText}`,
      },
    });
  }

  // Add action button
  message.blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View Full Report',
          emoji: true,
        },
        url: `file://${process.cwd()}/test-results/${summary.runId}/summary.html`,
      },
    ],
  });

  try {
    await axios.post(webhookUrl, message);
    console.log(chalk.green('✓ Slack notification sent'));
  } catch (error) {
    console.error(chalk.red(`✗ Failed to send Slack notification: ${error.message}`));
  }
}

/**
 * Send email notification
 * @param {Object} emailConfig - Email configuration
 * @param {Object} summary - Test summary
 */
async function sendEmailNotification(emailConfig, summary) {
  const { smtpUrl, to, subject } = emailConfig;

  if (!smtpUrl || !to) {
    console.warn(chalk.yellow('Email not configured (missing smtpUrl or to)'));
    return;
  }

  const failedCount = summary.overall.failed || 0;
  const body = `
Test Run Failed: ${summary.runId}

Failed: ${failedCount}/${summary.overall.totalTests || 0}
Passed: ${summary.overall.passed || 0}
Duration: ${formatDuration(summary.duration)}

Tier Results:
${Object.entries(summary.tiers || {})
  .map(([tier, result]) => `Tier ${tier}: ${result.passed || 0}/${result.total || 0} passed`)
  .join('\n')}

${summary.flaky?.detected > 0 ? `\n⚠️ Flaky Tests: ${summary.flaky.tests.join(', ')}` : ''}

View full report at: test-results/${summary.runId}/summary.html
  `.trim();

  // Simple mailto for now (production would use nodemailer)
  const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject || `Test Failed: ${summary.runId}`)}&body=${encodeURIComponent(body)}`;

  console.log(chalk.dim(`Email notification: ${mailtoUrl}`));
  console.log(chalk.yellow('Note: Configure SMTP for automated emails'));
}

function formatDuration(ms) {
  if (!ms) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

module.exports = {
  sendNotifications,
  sendSlackNotification,
  sendEmailNotification,
};