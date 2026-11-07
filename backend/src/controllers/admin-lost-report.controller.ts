import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requireAdmin } from './admin-authorization.js';
import {
  listAdminLostReports,
  getAdminLostReportDetails,
  resolveAdminLostReport,
} from '../services/admin-lost-report.service.js';
import type { ApiResponse } from '../shared/api-response.js';
import type { Paginated } from '../shared/pagination.js';
import type { PublicLostReportDto } from '../services/lost-report.service.js';

export const adminLostReportRouter = Router();

adminLostReportRouter.get(
  '/',
  /* #swagger.tags = ['Admin - Lost Reports'] */
  /* #swagger.summary = 'Listar perdas de todos os usuários' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['status'] = { in: 'query', type: 'string', enum: ['OPEN', 'RESOLVED', 'CANCELLED'] } */
  /* #swagger.parameters['categoryId'] = { in: 'query', type: 'integer' } */
  /* #swagger.parameters['buildingId'] = { in: 'query', type: 'integer' } */
  /* #swagger.parameters['page'] = { in: 'query', type: 'integer', default: 1 } */
  /* #swagger.parameters['per_page'] = { in: 'query', type: 'integer', default: 20, minimum: 1, maximum: 100 } */
  /* #swagger.responses[200] = { description: 'Perdas paginadas', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Filtros ou paginação inválidos', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito a administradores', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    await requireAdmin(res);
    const result = await listAdminLostReports(req.query as Record<string, unknown>);
    const response: ApiResponse<Paginated<PublicLostReportDto>> = {
      success: true,
      data: result,
    };
    res.json(response);
  },
);

adminLostReportRouter.get(
  '/:id',
  /* #swagger.tags = ['Admin - Lost Reports'] */
  /* #swagger.summary = 'Consultar qualquer perda' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[200] = { description: 'Detalhes da perda', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito a administradores', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Perda não encontrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    await requireAdmin(res);
    const result = await getAdminLostReportDetails(req.params.id);
    const response: ApiResponse<PublicLostReportDto> = {
      success: true,
      data: result,
    };
    res.json(response);
  },
);

adminLostReportRouter.post(
  '/:id/resolve',
  /* #swagger.tags = ['Admin - Lost Reports'] */
  /* #swagger.summary = 'Encerrar uma perda como resolvida' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[200] = { description: 'Perda resolvida com sucesso', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito a administradores', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Perda não encontrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Perda não está aberta', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    await requireAdmin(res);
    const result = await resolveAdminLostReport(req.params.id);
    const response: ApiResponse<PublicLostReportDto> = {
      success: true,
      data: result,
    };
    res.json(response);
  },
);
