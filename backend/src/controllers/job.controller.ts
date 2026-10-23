import { Router } from 'express';
import { notImplemented } from '../shared/not-implemented.js';

export const jobRouter = Router();

jobRouter.post(
  '/disposition-eligibility',
  /* #swagger.tags = ['Jobs'] */
  /* #swagger.summary = 'Executar o processamento diário de elegibilidade' */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Processamento de elegibilidade'),
);
