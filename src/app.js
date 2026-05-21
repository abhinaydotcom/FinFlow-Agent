import express from 'express';
import morgan from 'morgan';
import { logger } from './utils/logger.js';
import invoiceRouter from './routes/invoice.routes.js';
import { errorHandler, NotFoundError } from './utils/errors.js';

import path from 'path';

const app = express();

// Standard middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files from the public folder
app.use(express.static(path.join(process.cwd(), 'public')));

// Stream Morgan HTTP logs into Winston logger (NFR-4)
const morganFormat = process.env.NODE_ENV === 'development' ? 'dev' : 'short';
app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => logger.http(message.trim()),
    },
  })
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

// Register invoice processing and reconciliation endpoints (FR-7)
app.use('/', invoiceRouter);

// Catch-all for unhandled routes
app.use('*', (req, res, next) => {
  next(new NotFoundError(`Cannot find ${req.originalUrl} on this server`));
});

// Global operational error-handling middleware (NFR-3)
app.use(errorHandler);

export default app;
