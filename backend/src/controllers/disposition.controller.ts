import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requireAdmin } from './admin-authorization.js';
import {
  createDisposition,
  listAdminDispositions,
  getDispositionDetails,
} from '../services/disposition.service.js';
import type { ApiResponse } from '../shared/api-response.js';
import type { Paginated } from '../shared/pagination.js';
import type { Disposition } from '../models/disposition.js';

export const dispositionRouter = Router();

dispositionRouter.post(
  '/',
  /* #swagger.tags = ['Dispositions'] */
  /* #swagger.summary = 'Executar destinação de item elegível' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { itemId: 1, destination: 'DONATED', receiverDocument: '12.345.678/0001-90' } } */
  /* #swagger.responses[201] = { description: 'Destinação executada com sucesso', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Dados inválidos', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito a administradores', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Item não encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Item não está elegível', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    const admin = await requireAdmin(res);
    const disposition = await createDisposition(admin.id, req.body);
    const response: ApiResponse<Disposition> = {
      success: true,
      data: disposition,
    };
    res.status(201).json(response);
  },
);

dispositionRouter.get(
  '/',
  /* #swagger.tags = ['Dispositions'] */
  /* #swagger.summary = 'Listar destinações executadas' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['destination'] = { in: 'query', type: 'string', enum: ['SOLD', 'AUCTIONED', 'DONATED', 'DISCARDED'] } */
  /* #swagger.parameters['from'] = { in: 'query', type: 'string', format: 'date' } */
  /* #swagger.parameters['to'] = { in: 'query', type: 'string', format: 'date' } */
  /* #swagger.parameters['page'] = { in: 'query', type: 'integer', default: 1 } */
  /* #swagger.parameters['per_page'] = { in: 'query', type: 'integer', default: 20, minimum: 1, maximum: 100 } */
  /* #swagger.responses[200] = { description: 'Destinações paginadas', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Filtros inválidos', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito a administradores', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    await requireAdmin(res);
    const result = await listAdminDispositions(req.query as Record<string, unknown>);
    const response: ApiResponse<Paginated<Disposition>> = {
      success: true,
      data: result,
    };
    res.json(response);
  },
);

dispositionRouter.get(
  '/:id',
  /* #swagger.tags = ['Dispositions'] */
  /* #swagger.summary = 'Consultar detalhes de uma destinação' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[200] = { description: 'Detalhes da destinação', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito a administradores', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Destinação não encontrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    await requireAdmin(res);
    const disposition = await getDispositionDetails(req.params.id);
    const response: ApiResponse<Disposition> = {
      success: true,
      data: disposition,
    };
    res.json(response);
  },
);
