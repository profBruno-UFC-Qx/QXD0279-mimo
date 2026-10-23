import { Router } from 'express';
import { notImplemented } from '../shared/not-implemented.js';

export const adminLostReportRouter = Router();

adminLostReportRouter.get(
  '/',
  /* #swagger.tags = ['Admin - Lost Reports'] */
  /* #swagger.summary = 'Listar perdas de todos os usuários' */
  /* #swagger.parameters['status'] = { in: 'query', type: 'string', enum: ['OPEN', 'RESOLVED', 'CANCELLED'] } */
  /* #swagger.parameters['categoryId'] = { in: 'query', type: 'integer' } */
  /* #swagger.parameters['buildingId'] = { in: 'query', type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Listagem administrativa de perdas'),
);

adminLostReportRouter.get(
  '/:id',
  /* #swagger.tags = ['Admin - Lost Reports'] */
  /* #swagger.summary = 'Consultar qualquer perda' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Consulta administrativa de perda'),
);

adminLostReportRouter.post(
  '/:id/resolve',
  /* #swagger.tags = ['Admin - Lost Reports'] */
  /* #swagger.summary = 'Encerrar uma perda como resolvida' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Resolução de perda'),
);
