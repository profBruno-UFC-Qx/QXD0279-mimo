import { Router } from 'express';
import { notImplemented } from '../shared/not-implemented.js';

export const categoryRouter = Router();

categoryRouter.get(
  '/',
  /* #swagger.tags = ['Categories'] */
  /* #swagger.summary = 'Listar categorias' */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Listagem de categorias'),
);

categoryRouter.post(
  '/',
  /* #swagger.tags = ['Categories'] */
  /* #swagger.summary = 'Criar categoria' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { name: 'Acessórios' } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Criação de categoria'),
);

categoryRouter.patch(
  '/:id',
  /* #swagger.tags = ['Categories'] */
  /* #swagger.summary = 'Renomear categoria' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { name: 'Acessórios' } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Atualização de categoria'),
);

categoryRouter.delete(
  '/:id',
  /* #swagger.tags = ['Categories'] */
  /* #swagger.summary = 'Excluir categoria' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Exclusão de categoria'),
);
