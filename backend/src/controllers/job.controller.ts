import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requireAdmin } from './admin-authorization.js';
import { runDispositionEligibilityJob } from '../services/job.service.js';
import type { ApiResponse } from '../shared/api-response.js';

export const jobRouter = Router();

jobRouter.post(
  '/disposition-eligibility',
  /* #swagger.tags = ['Jobs'] */
  /* #swagger.summary = 'Executar o processamento diário de elegibilidade' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.responses[200] = { description: 'Processamento executado com sucesso', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito a administradores', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (_req: Request, res: Response) => {
    await requireAdmin(res);
    const result = await runDispositionEligibilityJob();
    const response: ApiResponse<{ updatedCount: number }> = {
      success: true,
      data: result,
    };
    res.json(response);
  },
);
