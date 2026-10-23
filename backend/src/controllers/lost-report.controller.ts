import { Router } from 'express';
import { notImplemented } from '../shared/not-implemented.js';

export const lostReportRouter = Router();

lostReportRouter.post(
  '/',
  /* #swagger.tags = ['Lost Reports'] */
  /* #swagger.summary = 'Registrar objeto perdido' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { categoryId: 1, buildingId: 1, description: 'Descrição do objeto perdido', lossDate: '2026-10-23' } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Cadastro de perda'),
);

lostReportRouter.get(
  '/mine',
  /* #swagger.tags = ['Lost Reports'] */
  /* #swagger.summary = 'Listar as próprias perdas' */
  /* #swagger.parameters['status'] = { in: 'query', type: 'string', enum: ['OPEN', 'RESOLVED', 'CANCELLED'] } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Listagem das próprias perdas'),
);

lostReportRouter.post(
  '/:id/suggestions/:itemId/confirm',
  /* #swagger.tags = ['Lost Reports'] */
  /* #swagger.summary = 'Confirmar item sugerido para uma perda' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer', description: 'ID da perda' } */
  /* #swagger.parameters['itemId'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Confirmação de sugestão'),
);

lostReportRouter.post(
  '/:id/cancel',
  /* #swagger.tags = ['Lost Reports'] */
  /* #swagger.summary = 'Cancelar uma perda própria' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Cancelamento de perda'),
);

lostReportRouter.get(
  '/:id',
  /* #swagger.tags = ['Lost Reports'] */
  /* #swagger.summary = 'Consultar uma perda própria' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Consulta de perda'),
);

lostReportRouter.patch(
  '/:id',
  /* #swagger.tags = ['Lost Reports'] */
  /* #swagger.summary = 'Atualizar uma perda própria' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { categoryId: 1, buildingId: 1, description: 'Descrição atualizada', lossDate: '2026-10-23' } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Atualização de perda'),
);
