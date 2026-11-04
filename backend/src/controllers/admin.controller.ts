import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { listAdmins } from '../services/admin.service.js';
import type { PublicUser } from '../services/auth.service.js';
import type { ApiResponse } from '../shared/api-response.js';
import { notImplemented } from '../shared/not-implemented.js';

export const adminRouter = Router();

adminRouter.get(
  '/',
  /* #swagger.tags = ['Admins'] */
  /* #swagger.summary = 'Listar administradores' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.responses[200] = { description: 'Lista de administradores comuns', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Nao autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito ao superadministrador', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[500] = { description: 'Erro interno', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (_req: Request, res: Response) => {
    const userId = res.locals.auth.userId as number;
    const admins = await listAdmins(userId);
    const response: ApiResponse<PublicUser[]> = {
      success: true,
      data: admins,
    };
    res.status(200).json(response);
  },
);

adminRouter.post(
  '/',
  /* #swagger.tags = ['Admins'] */
  /* #swagger.summary = 'Cadastrar administrador' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { name: 'Ana Silva', email: 'ana@example.com', initialPassword: 'senha-inicial' } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Cadastro de administrador'),
);

adminRouter.get(
  '/:id',
  /* #swagger.tags = ['Admins'] */
  /* #swagger.summary = 'Consultar administrador' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Consulta de administrador'),
);

adminRouter.delete(
  '/:id',
  /* #swagger.tags = ['Admins'] */
  /* #swagger.summary = 'Excluir administrador' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Exclusão de administrador'),
);
