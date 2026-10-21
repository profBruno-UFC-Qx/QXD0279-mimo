import { QueryFailedError } from 'typeorm';
import { HttpError } from './http-error.js';
function getDatabaseError(error) {
    const driverError = error.driverError;
    // Adicione aqui o mapeamento de outros erros específicos do SQLite.
    if (driverError.code === 'SQLITE_CONSTRAINT' && driverError.message?.includes('UNIQUE constraint failed')) {
        return {
            statusCode: 409,
            details: 'Já existe um registro com esses dados únicos.',
        };
    }
    return null;
}
function getKnownError(error) {
    // 1. Erros HTTP lançados intencionalmente pela aplicação.
    if (error instanceof HttpError) {
        return { statusCode: error.statusCode, details: error.message };
    }
    // 2. Erros de persistência que queremos traduzir para HTTP.
    if (error instanceof QueryFailedError) {
        return getDatabaseError(error);
    }
    // Para acrescentar um tipo de erro, adicione um tratamento aqui.
    return null;
}
export const errorHandler = (error, _req, res, _next) => {
    // 1. Tenta reconhecer um erro conhecido.
    const knownError = getKnownError(error);
    // 2. Erros desconhecidos viram 500; detalhes internos ficam apenas no log.
    const statusCode = knownError?.statusCode ?? 500;
    const details = knownError?.details ?? 'Ocorreu um erro interno.';
    if (!knownError) {
        console.error(error);
    }
    // 3. Mantém o formato padrão da API para qualquer erro.
    const response = {
        success: false,
        data: null,
        error: { code: statusCode, details },
    };
    res.status(statusCode).json(response);
};
