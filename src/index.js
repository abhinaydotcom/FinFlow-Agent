import app from './app.js';
import { PORT } from './config.js';
import { logger } from './utils/logger.js';

const server = app.listen(PORT, () => {
  logger.info(`==================================================`);
  logger.info(`  FinFlow AP Reconciliation Agent Server Running  `);
  logger.info(`  Environment: ${process.env.NODE_ENV || 'development'}     `);
  logger.info(`  Listening on Port: http://localhost:${PORT}      `);
  logger.info(`==================================================`);
});

// Handle unhandled promise rejections gracefully
process.on('unhandledRejection', (err) => {
  logger.error(`UNHANDLED REJECTION: Shutting down...`);
  logger.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
