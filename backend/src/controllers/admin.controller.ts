import { Router } from 'express';
import { notImplemented } from '../shared/not-implemented.js';

export const adminRouter = Router();

adminRouter.get(
  '/',
  /* #swagger.tags = ['Admins'] */
  /* #swagger.summary = 'Listar administradores' */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Listagem de administradores'),
);

adminRouter.post(
  '/',
  /* #swagger.tags = ['Admins'] */
  /* #swagger.summary = 'Cadastrar administrador' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { name: 'Ana Silva', email: 'ana@example.com', initialPassword: 'senha-inicial' } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Cadastro de administrador'),
);

adminRouter.get(
  '/:id',
  /* #swagger.tags = ['Admins'] */
  /* #swagger.summary = 'Consultar administrador' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Consulta de administrador'),
);

adminRouter.delete(
  '/:id',
  /* #swagger.tags = ['Admins'] */
  /* #swagger.summary = 'Excluir administrador' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Exclusão de administrador'),
);
