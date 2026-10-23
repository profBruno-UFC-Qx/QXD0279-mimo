import { Router } from 'express';
import { notImplemented } from '../shared/not-implemented.js';

export const catalogItemRouter = Router();

catalogItemRouter.get(
  '/',
  /* #swagger.tags = ['Catalog'] */
  /* #swagger.summary = 'Listar itens encontrados disponíveis ao público' */
  /* #swagger.parameters['categoryId'] = { in: 'query', type: 'integer' } */
  /* #swagger.parameters['buildingId'] = { in: 'query', type: 'integer' } */
  /* #swagger.parameters['search'] = { in: 'query', type: 'string' } */
  /* #swagger.parameters['page'] = { in: 'query', type: 'integer', default: 1 } */
  /* #swagger.parameters['per_page'] = { in: 'query', type: 'integer', default: 20, minimum: 1, maximum: 100 } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Listagem pública de itens'),
);

catalogItemRouter.get(
  '/:id',
  /* #swagger.tags = ['Catalog'] */
  /* #swagger.summary = 'Consultar detalhes de um item disponível ao público' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Detalhes públicos do item'),
);
