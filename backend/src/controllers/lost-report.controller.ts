import { Router, type Request, type Response } from 'express';
import { notImplemented } from '../shared/not-implemented.js';
import { authenticate } from '../middlewares/auth.js';
import {
  createLostReport,
  listOwnLostReports,
  getOwnLostReportDetails,
  updateOwnLostReport,
  cancelOwnLostReport,
  confirmLostReportSuggestion,
} from '../services/lost-report.service.js';
import type { ApiResponse } from '../shared/api-response.js';

export const lostReportRouter = Router();

lostReportRouter.post(
  '/',
  /* #swagger.tags = ['Lost Reports'] */
  /* #swagger.summary = 'Registrar objeto perdido' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { categoryId: 1, buildingId: 1, description: 'Descrição do objeto perdido', lossDate: '2026-10-23' } } */
  /* #swagger.responses[201] = { description: 'Relato de perda registrado com sucesso', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Dados inválidos', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    const userId = res.locals.auth.userId as number;
    const result = await createLostReport(userId, req.body);
    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
    };
    res.status(201).json(response);
  },
);

lostReportRouter.get(
  '/mine',
  /* #swagger.tags = ['Lost Reports'] */
  /* #swagger.summary = 'Listar as próprias perdas' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['status'] = { in: 'query', type: 'string', enum: ['OPEN', 'RESOLVED', 'CANCELLED'] } */
  /* #swagger.responses[200] = { description: 'Lista de perdas do usuário', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Parâmetro inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    const userId = res.locals.auth.userId as number;
    const reports = await listOwnLostReports(userId, req.query);
    const response: ApiResponse<typeof reports> = {
      success: true,
      data: reports,
    };
    res.status(200).json(response);
  },
);

lostReportRouter.post(
  '/:id/suggestions/:itemId/confirm',
  /* #swagger.tags = ['Lost Reports'] */
  /* #swagger.summary = 'Confirmar item sugerido para uma perda' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer', description: 'ID da perda' } */
  /* #swagger.parameters['itemId'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[200] = { description: 'Sugestão confirmada com sucesso', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Relato de perda ou item não encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Conflito de estado', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    const userId = res.locals.auth.userId as number;
    const result = await confirmLostReportSuggestion(userId, req.params.id, req.params.itemId);
    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
    };
    res.status(200).json(response);
  },
);

lostReportRouter.post(
  '/:id/cancel',
  /* #swagger.tags = ['Lost Reports'] */
  /* #swagger.summary = 'Cancelar uma perda própria' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[200] = { description: 'Perda cancelada com sucesso', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Relato de perda não encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Conflito de estado', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    const userId = res.locals.auth.userId as number;
    const report = await cancelOwnLostReport(userId, req.params.id);
    const response: ApiResponse<typeof report> = {
      success: true,
      data: report,
    };
    res.status(200).json(response);
  },
);

lostReportRouter.get(
  '/:id',
  /* #swagger.tags = ['Lost Reports'] */
  /* #swagger.summary = 'Consultar uma perda própria' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[200] = { description: 'Detalhes da perda', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Relato de perda não encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    const userId = res.locals.auth.userId as number;
    const report = await getOwnLostReportDetails(userId, req.params.id);
    const response: ApiResponse<typeof report> = {
      success: true,
      data: report,
    };
    res.status(200).json(response);
  },
);

lostReportRouter.patch(
  '/:id',
  /* #swagger.tags = ['Lost Reports'] */
  /* #swagger.summary = 'Atualizar uma perda própria' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { categoryId: 1, buildingId: 1, description: 'Descrição atualizada', lossDate: '2026-10-23' } } */
  /* #swagger.responses[200] = { description: 'Perda atualizada com sucesso', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Dados inválidos', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Relato de perda não encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Conflito de estado', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    const userId = res.locals.auth.userId as number;
    const report = await updateOwnLostReport(userId, req.params.id, req.body);
    const response: ApiResponse<typeof report> = {
      success: true,
      data: report,
    };
    res.status(200).json(response);
  },
);
