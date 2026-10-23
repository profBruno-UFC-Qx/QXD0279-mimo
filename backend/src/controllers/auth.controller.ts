import { Router } from 'express';
import { notImplemented } from '../shared/not-implemented.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  /* #swagger.tags = ['Auth'] */
  /* #swagger.summary = 'Criar conta de usuário' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { name: 'Ana Silva', email: 'ana@example.com', password: 'senha' , phone: '+5511999999999' } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Cadastro de usuário'),
);

authRouter.post(
  '/login',
  /* #swagger.tags = ['Auth'] */
  /* #swagger.summary = 'Autenticar usuário' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { email: 'ana@example.com', password: 'senha' } } */
  /* #swagger.responses[501] = { description: 'Endpoint ainda não implementado', schema: { $ref: '#/definitions/ApiResponse' } } */
  notImplemented('Login'),
);
