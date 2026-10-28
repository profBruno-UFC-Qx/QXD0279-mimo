import { Router, type Request, type Response } from 'express';
import { validate } from 'class-validator';
import { Category } from '../models/category.js';
import { HttpError } from '../middlewares/http-error.js';
import { CategoryService } from '../services/category.service.js';
import type { ApiResponse } from '../shared/api-response.js';

const categoryService = new CategoryService();
export const categoryRouter = Router();

async function validateCategoryBody(body: unknown): Promise<string> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'O corpo da requisição deve ser um objeto JSON com o campo name.');
  }

  const payload = body as Record<string, unknown>;
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== 'name' || !Object.hasOwn(payload, 'name')) {
    throw new HttpError(400, 'Informe somente o campo name.');
  }

  if (typeof payload.name !== 'string') {
    throw new HttpError(400, 'O nome da categoria deve ser um texto.');
  }

  const name = payload.name.trim();
  const validationErrors = await validate(Object.assign(new Category(), { name }));
  if (validationErrors.length > 0) {
    throw new HttpError(400, 'O nome da categoria deve ter entre 2 e 100 caracteres.');
  }

  return name;
}

function parseCategoryId(rawId: string): number {
  if (!/^\d+$/.test(rawId)) {
    throw new HttpError(400, 'O ID da categoria deve ser um número inteiro positivo.');
  }

  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, 'O ID da categoria deve ser um número inteiro positivo.');
  }

  return id;
}

async function listCategories(_req: Request, res: Response): Promise<void> {
  const categories = await categoryService.list();
  const response: ApiResponse<Category[]> = { success: true, data: categories };
  res.json(response);
}

async function createCategory(req: Request, res: Response): Promise<void> {
  const name = await validateCategoryBody(req.body);
  const category = await categoryService.create(name);
  const response: ApiResponse<Category> = { success: true, data: category };
  res.status(201).json(response);
}

async function updateCategory(req: Request<{ id: string }>, res: Response): Promise<void> {
  const id = parseCategoryId(req.params.id);
  const name = await validateCategoryBody(req.body);
  const category = await categoryService.update(id, name);
  if (!category) {
    throw new HttpError(404, 'Não existe categoria cadastrada com esse ID.');
  }

  const response: ApiResponse<Category> = { success: true, data: category };
  res.json(response);
}

async function deleteCategory(req: Request<{ id: string }>, res: Response): Promise<void> {
  const id = parseCategoryId(req.params.id);
  const result = await categoryService.delete(id);
  if (result === 'not_found') {
    throw new HttpError(404, 'Não existe categoria cadastrada com esse ID.');
  }
  if (result === 'linked') {
    throw new HttpError(409, 'Não é possível excluir uma categoria com itens ou perdas vinculados.');
  }

  res.status(204).end();
}

categoryRouter.get(
  '/',
  /* #swagger.tags = ['Categories'] */
  /* #swagger.summary = 'Listar categorias para consulta pública' */
  /* #swagger.responses[200] = { description: 'Categorias ordenadas por nome', schema: { $ref: '#/definitions/ApiResponse' } } */
  listCategories,
);

categoryRouter.post(
  '/',
  /* #swagger.tags = ['Categories'] */
  /* #swagger.summary = 'Criar categoria' */
  /* #swagger.description = 'Operação administrativa (ADMIN/SUPERADMIN). Autorização real ainda não está integrada; a rota está desprotegida e não deve ser exposta publicamente antes dessa integração.' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { name: 'Acessórios' } } */
  /* #swagger.responses[201] = { description: 'Categoria criada', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Payload inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Já existe uma categoria com esse nome', schema: { $ref: '#/definitions/ApiResponse' } } */
  createCategory,
);

categoryRouter.patch(
  '/:id',
  /* #swagger.tags = ['Categories'] */
  /* #swagger.summary = 'Renomear categoria' */
  /* #swagger.description = 'Operação administrativa (ADMIN/SUPERADMIN). Autorização real ainda não está integrada; a rota está desprotegida e não deve ser exposta publicamente antes dessa integração.' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { name: 'Acessórios' } } */
  /* #swagger.responses[200] = { description: 'Categoria renomeada', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID ou payload inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Categoria não encontrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Já existe uma categoria com esse nome', schema: { $ref: '#/definitions/ApiResponse' } } */
  updateCategory,
);

categoryRouter.delete(
  '/:id',
  /* #swagger.tags = ['Categories'] */
  /* #swagger.summary = 'Excluir categoria' */
  /* #swagger.description = 'Operação administrativa (ADMIN/SUPERADMIN). Autorização real ainda não está integrada; a rota está desprotegida e não deve ser exposta publicamente antes dessa integração.' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[204] = { description: 'Categoria excluída sem corpo de resposta' } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Categoria não encontrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Categoria possui itens ou perdas vinculados', schema: { $ref: '#/definitions/ApiResponse' } } */
  deleteCategory,
);
