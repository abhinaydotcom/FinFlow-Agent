import { logger } from './logger.js';

export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(message) {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 422);
    this.errors = errors;
  }
}

export const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log only server-side unexpected errors as actual errors, client errors as warnings
  if (err.statusCode >= 500) {
    logger.error(`${err.message} \nStack: ${err.stack}`);
  } else {
    logger.warn(`${err.statusCode} - ${err.message}`);
  }

  const responseBody = {
    status: err.status,
    message: err.message,
  };

  if (err.errors && err.errors.length > 0) {
    responseBody.errors = err.errors;
  }

  // Hide detailed stack trace in production for security
  if (process.env.NODE_ENV === 'development' && err.statusCode >= 500) {
    responseBody.stack = err.stack;
  }

  res.status(err.statusCode).json(responseBody);
};
