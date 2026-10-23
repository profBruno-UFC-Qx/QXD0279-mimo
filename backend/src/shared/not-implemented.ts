import type { RequestHandler } from 'express';
import type { ApiResponse } from './api-response.js';

export function notImplemented(operation: string): RequestHandler {
  return (_req, res) => {
    const response: ApiResponse<never> = {
      success: false,
      message: `${operation} ainda não foi implementado.`,
      data: null,
      error: {
        code: 501,
        details: 'Este endpoint está reservado para implementação.',
      },
    };

    res.status(501).json(response);
  };
}
