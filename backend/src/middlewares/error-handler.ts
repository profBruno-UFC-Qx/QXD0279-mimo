import type { ErrorRequestHandler } from 'express';
import { QueryFailedError } from 'typeorm';
import type { ApiResponse } from '../shared/api-response.js';
import { HttpError } from './http-error.js';

// Fluxo: controller lança HttpError > getKnownError() converte para ErrorResponse
// O middleware monta a resposta HTTP no formato ApiResponse.

interface ErrorResponse {
  statusCode: number;
  details: string;
}

function getDatabaseError(error: QueryFailedError): ErrorResponse | null {
  const sqliteError = error.driverError as { code?: string; message?: string };
  const message = sqliteError.message ?? '';

  if (
    sqliteError.code?.startsWith('SQLITE_BUSY') ||
    sqliteError.code?.startsWith('SQLITE_LOCKED')
  ) {
    return {
      statusCode: 409,
      details: 'A operação conflita com uma alteração simultânea; tente novamente.',
    };
  }

  if (message.includes('UNIQUE constraint failed')) {
    return {
      statusCode: 409,
      details: 'Já existe um registro com esses dados únicos.',
    };
  }

  if (message.includes('FOREIGN KEY constraint failed')) {
    return {
      statusCode: 409,
      details: 'A operação conflita com registros relacionados.',
    };
  }

  if (message.includes('NOT NULL constraint failed')) {
    return {
      statusCode: 400,
      details: 'Um campo obrigatório não foi informado.',
    };
  }

  if (message.includes('CHECK constraint failed')) {
    return {
      statusCode: 400,
      details: 'Um ou mais valores não atendem às regras exigidas.',
    };
  }

  if (message.includes('PRIMARY KEY constraint failed')) {
    return {
      statusCode: 409,
      details: 'Já existe um registro com essa chave primária.',
    };
  }

  return null;
}

function getKnownError(error: unknown): ErrorResponse | null {
  // Erros HTTP lançados intencionalmente pela aplicação.
  if (error instanceof HttpError) {
    return { statusCode: error.statusCode, details: error.message };
  }

  // JSON sintaticamente inválido é rejeitado pelo express.json antes do controller.
  if (error instanceof SyntaxError) {
    const parseError = error as SyntaxError & { status?: number; type?: string };
    if (parseError.status === 400 && parseError.type === 'entity.parse.failed') {
      return { statusCode: 400, details: 'O corpo da requisição contém JSON inválido.' };
    }
  }

  // Erros de persistência
  if (error instanceof QueryFailedError) {
    return getDatabaseError(error);
  }

  // Dá para adicionar mais 

  return null;
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  // Tenta reconhecer um erro conhecido.
  const knownError = getKnownError(error);

  // Erros desconhecidos viram 500
  const statusCode = knownError?.statusCode ?? 500;
  const details = knownError?.details ?? 'Ocorreu um erro interno.';

  // Se o erro não for conhecido, printa no console para análise
  if (!knownError) {
    console.error(error);
  }

  // Formato padrão da API para qualquer erro.
  const response: ApiResponse<never> = {
    success: false,
    data: null,
    error: { code: statusCode, details },
  };

  res.status(statusCode).json(response);
};
