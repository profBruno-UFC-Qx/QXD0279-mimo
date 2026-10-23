import { Router } from 'express';
import { notImplemented } from '../shared/not-implemented.js';

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
  /* #swagger.parameters['read'] = { in: 'query', type: 'boolean' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Listagem de notificações'),
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
