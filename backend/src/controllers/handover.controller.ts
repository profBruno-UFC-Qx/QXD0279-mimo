import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { requireAdmin } from './admin-authorization.js';
import {
  createHandover,
  listOwnHandovers,
  listAdminHandovers,
  getHandoverDetails,
} from '../services/handover.service.js';
import { findUserById } from '../repository/user.repository.js';
import { UserRole } from '../models/enums.js';
import { HttpError } from '../middlewares/http-error.js';
import type { ApiResponse } from '../shared/api-response.js';
import type { Paginated } from '../shared/pagination.js';
import type { Handover } from '../models/handover.js';

export const handoverRouter = Router();

handoverRouter.post(
  '/',
  /* #swagger.tags = ['Handovers'] */
  /* #swagger.summary = 'Registrar retirada presencial de item' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { itemId: 1, withdrawnName: 'Ana Silva', withdrawnCpf: '123.456.789-00', withdrawnUserId: 1 } } */
  /* #swagger.responses[201] = { description: 'Retirada registrada com sucesso', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Dados inválidos', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito a administradores', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Item ou usuário não encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Item não disponível ou inelegível', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    const admin = await requireAdmin(res);
    const handover = await createHandover(admin.id, req.body);
    const response: ApiResponse<Handover> = {
      success: true,
      data: handover,
    };
    res.status(201).json(response);
  },
);

handoverRouter.get(
  '/mine',
  /* #swagger.tags = ['Handovers'] */
  /* #swagger.summary = 'Listar o histórico de retiradas do usuário' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.responses[200] = { description: 'Histórico de retiradas', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    const userId = res.locals.auth.userId as number;
    const handovers = await listOwnHandovers(userId);
    const response: ApiResponse<Handover[]> = {
      success: true,
      data: handovers,
    };
    res.json(response);
  },
);

handoverRouter.get(
  '/',
  /* #swagger.tags = ['Handovers'] */
  /* #swagger.summary = 'Listar o histórico de retiradas' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['itemId'] = { in: 'query', type: 'integer' } */
  /* #swagger.parameters['adminId'] = { in: 'query', type: 'integer' } */
  /* #swagger.parameters['from'] = { in: 'query', type: 'string', format: 'date' } */
  /* #swagger.parameters['to'] = { in: 'query', type: 'string', format: 'date' } */
  /* #swagger.parameters['page'] = { in: 'query', type: 'integer', default: 1 } */
  /* #swagger.parameters['per_page'] = { in: 'query', type: 'integer', default: 20, minimum: 1, maximum: 100 } */
  /* #swagger.responses[200] = { description: 'Retiradas paginadas', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Filtros inválidos', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito a administradores', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    await requireAdmin(res);
    const result = await listAdminHandovers(req.query as Record<string, unknown>);
    const response: ApiResponse<Paginated<Handover>> = {
      success: true,
      data: result,
    };
    res.json(response);
  },
);

handoverRouter.get(
  '/:id',
  /* #swagger.tags = ['Handovers'] */
  /* #swagger.summary = 'Consultar uma retirada' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[200] = { description: 'Detalhes da retirada', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso negado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Retirada não encontrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    const auth = res.locals.auth as { userId: number };
    const user = await findUserById(auth.userId);
    const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPERADMIN;
    const handover = await getHandoverDetails(req.params.id, auth.userId);
    if (!isAdmin && handover.withdrawnUserId !== auth.userId) {
      throw new HttpError(403, 'Acesso negado.');
    }
    const response: ApiResponse<Handover> = {
      success: true,
      data: handover,
    };
    res.json(response);
  },
);
