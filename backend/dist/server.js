import 'reflect-metadata';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import { AppDataSource } from './data-source.js';
const app = express();
const port = Number(process.env.PORT ?? 3000);
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    next();
});
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const swaggerPath = path.join(currentDirectory, '../swagger-output.json');
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
async function startServer() {
    try {
        await AppDataSource.initialize();
        if (process.env.NODE_ENV === 'production') {
            await AppDataSource.runMigrations();
        }
        app.listen(port, () => {
            console.log(`Servidor rodando em http://localhost:${port}`);
            console.log(`Documentação Swagger em http://localhost:${port}/api-docs`);
            console.log(`SQLite conectado em ${AppDataSource.options.database}`);
        });
    }
    catch (error) {
        console.error('Não foi possível inicializar o banco de dados:', error);
        process.exitCode = 1;
    }
}
async function closeServer() {
    if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
    }
}
process.once('SIGINT', () => void closeServer());
process.once('SIGTERM', () => void closeServer());
void startServer();
export default app;
