import { Router, type Request, type Response } from 'express';
import { loginUser, registerUser, type LoginResult, type PublicUser } from '../services/auth.service.js';
import type { ApiResponse } from '../shared/api-response.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  /* #swagger.tags = ['Auth'] */
  /* #swagger.summary = 'Criar conta de usuário' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { name: 'Ana Silva', email: 'ana@example.com', password: 'senha' , phone: '+5511999999999' } } */
  /* #swagger.responses[201] = { description: 'Usuário criado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Dados inválidos', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'E-mail já cadastrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  async (req: Request, res: Response) => {
    const user = await registerUser(req.body);
    const response: ApiResponse<PublicUser> = { success: true, data: user };
    res.status(201).json(response);
  },
);

authRouter.post(
  '/login',
  /* #swagger.tags = ['Auth'] */
  /* #swagger.summary = 'Autenticar usuário' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { email: 'ana@example.com', password: 'senha' } } */
  /* #swagger.responses[200] = { description: 'Usuário autenticado com sucesso', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Dados inválidos', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Credenciais inválidas', schema: { $ref: '#/definitions/ApiResponse' } } */
  async (req: Request, res: Response) => {
    const result = await loginUser(req.body);
    const response: ApiResponse<LoginResult> = { success: true, data: result };
    res.status(200).json(response);
  },
);
