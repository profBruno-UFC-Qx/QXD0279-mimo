import { Router, type Request, type Response } from 'express';
import { notImplemented } from '../shared/not-implemented.js';
import { authenticate } from '../middlewares/auth.js';
import { listOwnNotifications } from '../services/notification.service.js';
import type { ApiResponse } from '../shared/api-response.js';

export const notificationRouter = Router();

notificationRouter.get(
  '/unread-count',
  /* #swagger.tags = ['Notifications'] */
  /* #swagger.summary = 'Contar notificações não lidas' */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Contagem de notificações não lidas'),
);

notificationRouter.get(
  '/',
  /* #swagger.tags = ['Notifications'] */
  /* #swagger.summary = 'Listar notificações do usuário autenticado' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.parameters['read'] = { in: 'query', type: 'boolean' } */
  /* #swagger.responses[200] = { description: 'Lista de notificações do usuário', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Parâmetro inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  async (req: Request, res: Response) => {
    const userId = res.locals.auth.userId as number;
    const notifications = await listOwnNotifications(userId, req.query);
    const response: ApiResponse<typeof notifications> = {
      success: true,
      data: notifications,
    };
    res.status(200).json(response);
  },
);

notificationRouter.patch(
  '/read-all',
  /* #swagger.tags = ['Notifications'] */
  /* #swagger.summary = 'Marcar todas as notificações como lidas' */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Marcação de notificações como lidas'),
);

notificationRouter.patch(
  '/:id/read',
  /* #swagger.tags = ['Notifications'] */
  /* #swagger.summary = 'Marcar uma notificação como lida' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Marcação de notificação como lida'),
);
