/**
 * server.js — long-running entry point (Render, Railway, Docker, a VPS).
 *
 * Validates config, connects to MongoDB, starts the scheduled jobs and listens.
 * Shuts down cleanly on SIGTERM so deploys never cut a request in half.
 */
const mongoose = require('mongoose');
const cron = require('node-cron');
const env = require('./config/env');
const logger = require('./lib/logger');
const app = require('./app');

module.exports = app; // kept so `require('./server')` still yields the app

const start = async () => {
  try {
    const warnings = env.check();
    warnings.forEach((w) => logger.warn(`Missing production config: ${w}`));
  } catch (err) {
    logger.error(err.message);
    process.exit(1);
  }

  await mongoose.connect(env.MONGODB_URI, { maxPoolSize: 20, serverSelectionTimeoutMS: 10000 });
  logger.info('MongoDB connected');

  if (env.RUN_CRON) {
    const { startRecurringCron } = require('./cron/recurringJob');
    const { startStreakCron } = require('./cron/streakJob');
    const { runAllAlerts } = require('./cron/budgetAlertJob');
    startRecurringCron();
    startStreakCron();
    cron.schedule('30 * * * *', () => runAllAlerts().catch((e) => logger.error('alerts job', { err: e.message })));
    logger.info('Scheduled jobs started (recurring :05, streaks :15, alerts :30 every hour)');
  }

  const server = app.listen(env.PORT, () => logger.info(`Clario API listening on :${env.PORT}`));

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await mongoose.disconnect().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

if (require.main === module) {
  start().catch((err) => {
    logger.error(`Startup failed: ${err.message}`);
    process.exit(1);
  });
}
