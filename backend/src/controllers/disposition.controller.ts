import { Router } from 'express';
import { notImplemented } from '../shared/not-implemented.js';

export const dispositionRouter = Router();

dispositionRouter.post(
  '/',
  /* #swagger.tags = ['Dispositions'] */
  /* #swagger.summary = 'Executar destinação de item elegível' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { itemId: 1, destination: 'DONATED', receiverDocument: '12.345.678/0001-90' } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Execução de destinação'),
);

dispositionRouter.get(
  '/',
  /* #swagger.tags = ['Dispositions'] */
  /* #swagger.summary = 'Listar destinações executadas' */
  /* #swagger.parameters['destination'] = { in: 'query', type: 'string', enum: ['SOLD', 'AUCTIONED', 'DONATED', 'DISCARDED'] } */
  /* #swagger.parameters['from'] = { in: 'query', type: 'string', format: 'date' } */
  /* #swagger.parameters['to'] = { in: 'query', type: 'string', format: 'date' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Listagem de destinações'),
);
