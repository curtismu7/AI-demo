'use strict';
const { PostHog } = require('posthog-node');

const client = new PostHog(process.env.POSTHOG_API_KEY, {
  host: process.env.POSTHOG_HOST,
  enableExceptionAutocapture: true,
});

process.on('SIGINT', async () => {
  await client.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await client.shutdown();
  process.exit(0);
});

module.exports = client;
