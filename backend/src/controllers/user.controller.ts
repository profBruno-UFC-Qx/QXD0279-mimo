import { Router } from 'express';
import { notImplemented } from '../shared/not-implemented.js';

export const userRouter = Router();

userRouter.get(
  '/me',
  /* #swagger.tags = ['Users'] */
  /* #swagger.summary = 'Consultar o próprio perfil' */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Consulta de perfil'),
);

userRouter.patch(
  '/me',
  /* #swagger.tags = ['Users'] */
  /* #swagger.summary = 'Atualizar o próprio perfil' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { name: 'Ana Silva', phone: '+5511999999999', password: 'nova-senha' } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Atualização de perfil'),
);
