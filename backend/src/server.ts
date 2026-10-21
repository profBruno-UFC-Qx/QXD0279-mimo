import express from 'express';
import fs from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';

const app = express();
const port = 3000;

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});


const swaggerPath = path.join(__dirname, '../swagger-output.json');
const swaggerDocument = fs.existsSync(swaggerPath)
  ? JSON.parse(fs.readFileSync(swaggerPath, 'utf-8'))
  : {
      openapi: '3.0.0',
      info: {
        title: 'API do Projeto',
        version: '1.0.0',
        description: 'Documentação da API',
      },
    };

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
  console.log(`Documentação Swagger em http://localhost:${port}/api-docs`);
});

export default app;
