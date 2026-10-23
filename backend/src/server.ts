import express from 'express';
import fs from 'node:fs';
import swaggerUi from 'swagger-ui-express';
import { AppDataSource } from './data-source.js';
import { errorHandler } from './middlewares/error-handler.js';
import { apiRouter } from './routes/index.js';

const app = express();
const port = 3000;
const preflightStatus = 204;

app.use(express.json());

// Configuração CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(preflightStatus);
    return;
  }
  next();
});

// Rotas da API
app.use('/api', apiRouter);

// Configuração Swagger
const swaggerDocument = JSON.parse(fs.readFileSync(new URL('../swagger-output.json', import.meta.url), 'utf-8'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Middlewares
app.use(errorHandler);

// Inicialização do servidor e conexão com o banco de dados
AppDataSource.initialize()
  .then(() => app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
    console.log(`Documentação Swagger em http://localhost:${port}/docs`);
  }))
  .catch((error: unknown) => {
    console.error('Não foi possível conectar ao SQLite:', error);
    process.exitCode = 1;
  });

export default app;
