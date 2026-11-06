import { Router, type Request, type Response } from 'express';
import { AppDataSource } from '../data-source.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  /* #swagger.tags = ['Health'] */
  /* #swagger.summary = 'Verificar saúde da aplicação e conexão com o banco de dados' */
  /* #swagger.responses[200] = { description: 'Serviço saudável', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[503] = { description: 'Serviço degradado ou sem banco', schema: { $ref: '#/definitions/ApiResponse' } } */
  async (_req: Request, res: Response) => {
    const dbOk = AppDataSource.isInitialized;
    const response = {
      success: dbOk,
      data: {
        status: dbOk ? 'healthy' : 'unhealthy',
        database: dbOk ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
      },
    };
    res.status(dbOk ? 200 : 503).json(response);
  },
);
