import { Router } from 'express';
import { notImplemented } from '../shared/not-implemented.js';

export const handoverRouter = Router();

handoverRouter.post(
  '/',
  /* #swagger.tags = ['Handovers'] */
  /* #swagger.summary = 'Registrar retirada presencial de item' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { itemId: 1, withdrawnName: 'Ana Silva', withdrawnCpf: '123.456.789-00', withdrawnUserId: 1 } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Registro de entrega'),
);

handoverRouter.get(
  '/mine',
  /* #swagger.tags = ['Handovers'] */
  /* #swagger.summary = 'Listar o histórico de retiradas do usuário' */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Histórico pessoal de retiradas'),
);

handoverRouter.get(
  '/',
  /* #swagger.tags = ['Handovers'] */
  /* #swagger.summary = 'Listar o histórico de retiradas' */
  /* #swagger.parameters['itemId'] = { in: 'query', type: 'integer' } */
  /* #swagger.parameters['adminId'] = { in: 'query', type: 'integer' } */
  /* #swagger.parameters['from'] = { in: 'query', type: 'string', format: 'date' } */
  /* #swagger.parameters['to'] = { in: 'query', type: 'string', format: 'date' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Listagem de retiradas'),
);

handoverRouter.get(
  '/:id',
  /* #swagger.tags = ['Handovers'] */
  /* #swagger.summary = 'Consultar uma retirada' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Consulta de retirada'),
);
