import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { getUserProfile } from '../services/user.service.js';
import type { ApiResponse } from '../shared/api-response.js';
import { notImplemented } from '../shared/not-implemented.js';
import type { PublicUser } from '../services/auth.service.js';

export const userRouter = Router();

userRouter.get(
  '/me',
  /* #swagger.tags = ['Users'] */
  /* #swagger.summary = 'Consultar o próprio perfil' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.responses[200] = { description: 'Perfil retornado com sucesso', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[500] = { description: 'Erro interno', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (_req: Request, res: Response) => {
    const userId = res.locals.auth.userId as number;
    const profile = await getUserProfile(userId);
    const response: ApiResponse<PublicUser> = {
      success: true,
      data: profile,
    };
    res.status(200).json(response);
  },
);

userRouter.patch(
  '/me',
  /* #swagger.tags = ['Users'] */
  /* #swagger.summary = 'Atualizar o próprio perfil' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { name: 'Ana Silva', phone: '+5511999999999', password: 'nova-senha' } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Atualização de perfil'),
);
