import swaggerAutogen from 'swagger-autogen';
import { fileURLToPath } from 'node:url';

const outputFile = fileURLToPath(new URL('../swagger-output.json', import.meta.url));
const endpointsFiles = ['./src/server.ts'];

const doc = {
  info: {
    title: 'Achadex API',
    version: '1.0.0',
    description: 'API para gerenciamento de itens encontrados, perdas e destinações.',
  },
  host: 'localhost:3000',
  schemes: ['http'],
  '@definitions': {
    ApiError: {
      type: 'object',
      required: ['code', 'details'],
      properties: {
        code: { type: 'integer', example: 501 },
        details: { type: 'string' },
      },
    },
    ApiResponse: {
      type: 'object',
      required: ['success', 'data'],
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: { description: 'Payload de sucesso; null nas respostas de erro.' },
        error: { $ref: '#/definitions/ApiError' },
      },
    },
  },
};

swaggerAutogen()(outputFile, endpointsFiles, doc).then(() => {
  import('./server.js');
});
