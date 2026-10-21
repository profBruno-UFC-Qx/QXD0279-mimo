import swaggerAutogen from 'swagger-autogen';

const outputFile = './swagger-output.json';
const endpointsFiles = ['./src/server.ts'];

const doc = {
  info: {
    title: 'API do Projeto',
    version: '1.0.0',
    description: 'Documentação da API com swagger-autogen',
  },
  host: 'localhost:3000',
  schemes: ['http'],
  definitions: {
    Aluno: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 1 },
        nome: { type: 'string', example: 'Ana' },
        idade: { type: 'number', example: 20 },
        curso: { type: 'string', example: 'Sistemas para Internet' },
      },
    },
  },
};

swaggerAutogen()(outputFile, endpointsFiles, doc).then(() => {
  import('./server.js');
});