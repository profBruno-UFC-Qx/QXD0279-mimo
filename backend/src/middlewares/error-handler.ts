import type { ErrorRequestHandler } from 'express';
import { QueryFailedError } from 'typeorm';
import type { ApiResponse } from '../shared/api-response.js';
import { HttpError } from '../shared/http-error.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  let statusCode = 500;
  let details = 'Ocorreu um erro interno.';

  if (error instanceof HttpError) {
    statusCode = error.statusCode;
    details = error.message;
  } else if (error instanceof QueryFailedError) {
    const driverError = error.driverError as { code?: string; message?: string };

    if (driverError.code === 'SQLITE_CONSTRAINT' && driverError.message?.includes('UNIQUE constraint failed')) {
      statusCode = 409;
      details = 'Já existe um registro com esses dados únicos.';
    }
  }

  if (statusCode === 500) {
    console.error(error);
  }

  const response: ApiResponse<never> = {
    success: false,
    data: null,
    error: { code: statusCode, details },
  };

  res.status(statusCode).json(response);
};
