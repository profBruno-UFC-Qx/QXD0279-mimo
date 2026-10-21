import { QueryFailedError } from 'typeorm';
import { HttpError } from '../shared/http-error.js';
export const errorHandler = (error, _req, res, _next) => {
    let statusCode = 500;
    let details = 'Ocorreu um erro interno.';
    if (error instanceof HttpError) {
        statusCode = error.statusCode;
        details = error.message;
    }
    else if (error instanceof QueryFailedError) {
        const driverError = error.driverError;
        if (driverError.code === 'SQLITE_CONSTRAINT' && driverError.message?.includes('UNIQUE constraint failed')) {
            statusCode = 409;
            details = 'Já existe um registro com esses dados únicos.';
        }
    }
    if (statusCode === 500) {
        console.error(error);
    }
    const response = {
        success: false,
        data: null,
        error: { code: statusCode, details },
    };
    res.status(statusCode).json(response);
};
