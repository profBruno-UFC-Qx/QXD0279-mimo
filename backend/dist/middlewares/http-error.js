export class HttpError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
    }
}
