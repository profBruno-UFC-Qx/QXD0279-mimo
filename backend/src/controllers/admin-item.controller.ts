import { Router } from 'express';
import { notImplemented } from '../shared/not-implemented.js';

export const adminItemRouter = Router();

adminItemRouter.post(
  '/',
  /* #swagger.tags = ['Admin - Items'] */
  /* #swagger.summary = 'Cadastrar item encontrado' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { title: 'Chaves', description: 'Chaves encontradas no saguão', categoryId: 1, buildingId: 1, foundLocation: 'Saguão', foundDate: '2026-10-23', photos: ['https://example.com/photo.jpg'] } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Cadastro de item'),
);

adminItemRouter.get(
  '/',
  /* #swagger.tags = ['Admin - Items'] */
  /* #swagger.summary = 'Listar itens de todos os status para administração' */
  /* #swagger.parameters['status'] = { in: 'query', type: 'string', enum: ['AVAILABLE', 'ELIGIBLE', 'HANDED_OVER', 'SOLD', 'AUCTIONED', 'DONATED', 'DISCARDED'] } */
  /* #swagger.parameters['categoryId'] = { in: 'query', type: 'integer' } */
  /* #swagger.parameters['buildingId'] = { in: 'query', type: 'integer' } */
  /* #swagger.parameters['search'] = { in: 'query', type: 'string' } */
  /* #swagger.parameters['page'] = { in: 'query', type: 'integer', default: 1 } */
  /* #swagger.parameters['per_page'] = { in: 'query', type: 'integer', default: 20, minimum: 1, maximum: 100 } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Listagem administrativa de itens'),
);

adminItemRouter.get(
  '/:id/possible-owners',
  /* #swagger.tags = ['Admin - Items'] */
  /* #swagger.summary = 'Listar perdas compatíveis com um item' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Consulta de possíveis donos'),
);

adminItemRouter.get(
  '/:id',
  /* #swagger.tags = ['Admin - Items'] */
  /* #swagger.summary = 'Consultar item no painel administrativo' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Consulta administrativa de item'),
);

adminItemRouter.patch(
  '/:id',
  /* #swagger.tags = ['Admin - Items'] */
  /* #swagger.summary = 'Atualizar item e suas fotos' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { title: 'Chaves', description: 'Descrição', categoryId: 1, buildingId: 1, foundLocation: 'Saguão', foundDate: '2026-10-23', photosToAdd: ['https://example.com/photo.jpg'], photosToRemove: [2] } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Atualização de item'),
);

adminItemRouter.delete(
  '/:id',
  /* #swagger.tags = ['Admin - Items'] */
  /* #swagger.summary = 'Excluir item' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Exclusão de item'),
);
