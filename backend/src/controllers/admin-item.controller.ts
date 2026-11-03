import { Router, type Request, type Response } from 'express';
import { validate } from 'class-validator';
import { Item } from '../models/item.js';
import { ItemPhoto } from '../models/item-photo.js';
import { LostReport } from '../models/lost-report.js';
import { ItemStatus, UserRole } from '../models/enums.js';
import { HttpError } from '../middlewares/http-error.js';
import { AdminItemService } from '../services/admin-item.service.js';
import type {
  AdminItemFilters,
  CreateAdminItemData,
  UpdateAdminItemData,
} from '../services/admin-item.service.js';
import type { ApiResponse } from '../shared/api-response.js';
import type { Paginated } from '../shared/pagination.js';

const adminItemService = new AdminItemService();
export const adminItemRouter = Router();

type RequestWithIdentity = Request & { user?: unknown };

function requireAdminId(req: Request): number {
  const user = (req as RequestWithIdentity).user;
  if (user === undefined || user === null) {
    throw new HttpError(503, 'A autorização administrativa ainda não está integrada.');
  }
  if (typeof user !== 'object') throw new HttpError(401, 'Identidade autenticada inválida.');

  const identity = user as { id?: unknown; role?: unknown };
  if (typeof identity.id !== 'number' || !Number.isSafeInteger(identity.id) || identity.id <= 0) {
    throw new HttpError(401, 'Identidade autenticada inválida.');
  }
  if (identity.role !== UserRole.ADMIN && identity.role !== UserRole.SUPERADMIN) {
    throw new HttpError(403, 'Acesso restrito a administradores.');
  }

  return identity.id;
}

function parsePathId(rawId: string): number {
  if (!/^\d+$/.test(rawId)) {
    throw new HttpError(400, 'O ID do item deve ser um número inteiro positivo.');
  }
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, 'O ID do item deve ser um número inteiro positivo.');
  }
  return id;
}

function requireObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'O corpo da requisição deve ser um objeto JSON.');
  }
  return body as Record<string, unknown>;
}

function rejectUnknownFields(payload: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(payload).some((field) => !allowed.includes(field))) {
    throw new HttpError(400, 'O corpo contém campos não permitidos.');
  }
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new HttpError(400, `O campo ${field} deve ser texto.`);
  return value.trim();
}

function requirePositiveId(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new HttpError(400, `O campo ${field} deve ser um inteiro positivo seguro.`);
  }
  return value;
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `O campo ${field} deve usar o formato YYYY-MM-DD.`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new HttpError(400, `O campo ${field} deve conter uma data válida.`);
  }
  return date;
}

async function validateItemFields(data: Partial<Item>): Promise<void> {
  const errors = await validate(Object.assign(new Item(), data), { skipMissingProperties: true });
  if (errors.length > 0) {
    throw new HttpError(400, 'Um ou mais campos do item são inválidos.');
  }
}

async function parsePhotoUrls(value: unknown, field: string): Promise<string[]> {
  if (!Array.isArray(value)) throw new HttpError(400, `O campo ${field} deve ser uma lista de URLs.`);

  const urls: string[] = [];
  for (const entry of value) {
    const url = requireText(entry, field);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new HttpError(400, `O campo ${field} contém uma URL inválida.`);
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      /\s/.test(url) ||
      url.length > 500
    ) {
      throw new HttpError(400, `O campo ${field} aceita somente URLs HTTP/HTTPS de até 500 caracteres.`);
    }

    const errors = await validate(Object.assign(new ItemPhoto(), { url }), {
      skipMissingProperties: true,
    });
    if (errors.length > 0) throw new HttpError(400, `O campo ${field} contém uma URL inválida.`);
    urls.push(url);
  }
  return urls;
}

function parseOptionalText(payload: Record<string, unknown>, field: 'description' | 'foundLocation'):
  string | null {
  if (!Object.hasOwn(payload, field) || payload[field] === null) return null;
  return requireText(payload[field], field);
}

async function parseCreatePayload(body: unknown): Promise<CreateAdminItemData> {
  const payload = requireObject(body);
  const allowed = ['title', 'description', 'categoryId', 'buildingId', 'foundLocation', 'foundDate', 'photos'];
  rejectUnknownFields(payload, allowed);
  for (const field of ['title', 'categoryId', 'buildingId', 'foundDate', 'photos']) {
    if (!Object.hasOwn(payload, field)) throw new HttpError(400, `O campo ${field} é obrigatório.`);
  }

  const data: CreateAdminItemData = {
    title: requireText(payload.title, 'title'),
    description: parseOptionalText(payload, 'description'),
    categoryId: requirePositiveId(payload.categoryId, 'categoryId'),
    buildingId: requirePositiveId(payload.buildingId, 'buildingId'),
    foundLocation: parseOptionalText(payload, 'foundLocation'),
    foundDate: parseDate(payload.foundDate, 'foundDate'),
    photos: await parsePhotoUrls(payload.photos, 'photos'),
  };
  await validateItemFields({
    title: data.title,
    description: data.description,
    categoryId: data.categoryId,
    buildingId: data.buildingId,
    foundLocation: data.foundLocation,
    foundDate: data.foundDate,
  });
  return data;
}

async function parseUpdatePayload(body: unknown): Promise<UpdateAdminItemData> {
  const payload = requireObject(body);
  const allowed = [
    'title', 'description', 'categoryId', 'buildingId', 'foundLocation', 'foundDate',
    'photosToAdd', 'photosToRemove',
  ];
  rejectUnknownFields(payload, allowed);
  if (Object.keys(payload).length === 0) throw new HttpError(400, 'Informe ao menos um campo para atualização.');

  const data: UpdateAdminItemData = {};
  if (Object.hasOwn(payload, 'title')) data.title = requireText(payload.title, 'title');
  if (Object.hasOwn(payload, 'description')) {
    data.description = payload.description === null ? null : requireText(payload.description, 'description');
  }
  if (Object.hasOwn(payload, 'categoryId')) data.categoryId = requirePositiveId(payload.categoryId, 'categoryId');
  if (Object.hasOwn(payload, 'buildingId')) data.buildingId = requirePositiveId(payload.buildingId, 'buildingId');
  if (Object.hasOwn(payload, 'foundLocation')) {
    data.foundLocation = payload.foundLocation === null ? null : requireText(payload.foundLocation, 'foundLocation');
  }
  if (Object.hasOwn(payload, 'foundDate')) data.foundDate = parseDate(payload.foundDate, 'foundDate');
  if (Object.hasOwn(payload, 'photosToAdd')) {
    data.photosToAdd = await parsePhotoUrls(payload.photosToAdd, 'photosToAdd');
  }
  if (Object.hasOwn(payload, 'photosToRemove')) {
    if (!Array.isArray(payload.photosToRemove)) {
      throw new HttpError(400, 'O campo photosToRemove deve ser uma lista de IDs.');
    }
    data.photosToRemove = payload.photosToRemove.map((id) => requirePositiveId(id, 'photosToRemove'));
    if (new Set(data.photosToRemove).size !== data.photosToRemove.length) {
      throw new HttpError(400, 'photosToRemove não pode conter IDs duplicados.');
    }
  }

  await validateItemFields({
    title: data.title,
    description: data.description,
    categoryId: data.categoryId,
    buildingId: data.buildingId,
    foundLocation: data.foundLocation,
    foundDate: data.foundDate,
  });
  return data;
}

function parseListQuery(query: Record<string, unknown>): {
  filters: AdminItemFilters;
  page: number;
  perPage: number;
} {
  const allowed = ['status', 'categoryId', 'buildingId', 'search', 'page', 'per_page'];
  rejectUnknownFields(query, allowed);

  const filters: AdminItemFilters = {};
  if (query.status !== undefined) {
    if (typeof query.status !== 'string' || !Object.values(ItemStatus).includes(query.status as ItemStatus)) {
      throw new HttpError(400, 'O filtro status é inválido.');
    }
    filters.status = query.status as ItemStatus;
  }
  for (const field of ['categoryId', 'buildingId'] as const) {
    if (query[field] !== undefined) {
      if (typeof query[field] !== 'string' || !/^\d+$/.test(query[field])) {
        throw new HttpError(400, `O filtro ${field} deve ser um inteiro positivo.`);
      }
      filters[field] = requirePositiveId(Number(query[field]), field);
    }
  }
  if (query.search !== undefined) {
    if (typeof query.search !== 'string' || query.search.length > 2000) {
      throw new HttpError(400, 'O filtro search deve ser texto com até 2000 caracteres.');
    }
    filters.search = query.search.trim();
  }

  const parsePage = (value: unknown, field: string, fallback: number): number => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      throw new HttpError(400, `O parâmetro ${field} deve ser um inteiro positivo.`);
    }
    return requirePositiveId(Number(value), field);
  };

  const page = parsePage(query.page, 'page', 1);
  const perPage = parsePage(query.per_page, 'per_page', 20);
  if (perPage > 100) throw new HttpError(400, 'O parâmetro per_page deve ser no máximo 100.');
  return { filters, page, perPage };
}

async function createItem(req: Request, res: Response): Promise<void> {
  const createdBy = requireAdminId(req);
  const item = await adminItemService.create(await parseCreatePayload(req.body), createdBy);
  const response: ApiResponse<Item> = { success: true, data: item };
  res.status(201).json(response);
}

async function listItems(req: Request, res: Response): Promise<void> {
  requireAdminId(req);
  const { filters, page, perPage } = parseListQuery(req.query as Record<string, unknown>);
  const data = await adminItemService.list(filters, page, perPage);
  const response: ApiResponse<Paginated<Item>> = { success: true, data };
  res.json(response);
}

async function getItemDetails(req: Request<{ id: string }>, res: Response): Promise<void> {
  requireAdminId(req);
  const details = await adminItemService.getDetails(parsePathId(req.params.id));
  if (!details) throw new HttpError(404, 'O item não foi encontrado.');

  const response: ApiResponse<{ item: Item; photos: ItemPhoto[] }> = { success: true, data: details };
  res.json(response);
}

async function getPossibleOwners(req: Request<{ id: string }>, res: Response): Promise<void> {
  requireAdminId(req);
  const reports = await adminItemService.getPossibleOwners(parsePathId(req.params.id));
  if (!reports) throw new HttpError(404, 'O item não foi encontrado.');

  const response: ApiResponse<LostReport[]> = { success: true, data: reports };
  res.json(response);
}

async function updateItem(req: Request<{ id: string }>, res: Response): Promise<void> {
  requireAdminId(req);
  const item = await adminItemService.update(parsePathId(req.params.id), await parseUpdatePayload(req.body));
  const response: ApiResponse<Item> = { success: true, data: item };
  res.json(response);
}

async function deleteItem(req: Request<{ id: string }>, res: Response): Promise<void> {
  requireAdminId(req);
  await adminItemService.remove(parsePathId(req.params.id));
  res.status(204).end();
}

adminItemRouter.post(
  '/',
  /* #swagger.tags = ['Admin - Items'] */
  /* #swagger.summary = 'Cadastrar item encontrado' */
  /* #swagger.description = 'Requer ADMIN/SUPERADMIN; fechado por padrão até a integração da autenticação real.' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { title: 'Chaves', description: 'Chaves encontradas no saguão', categoryId: 1, buildingId: 1, foundLocation: 'Saguão', foundDate: '2026-10-23', photos: ['https://example.com/photo.jpg'] } } */
  /* #swagger.responses[201] = { description: 'Item cadastrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Payload inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Identidade autenticada inválida', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Papel sem permissão administrativa', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Categoria ou prédio não encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Conflito de integridade ou concorrência', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[503] = { description: 'Autenticação administrativa ainda não integrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  createItem,
);

adminItemRouter.get(
  '/',
  /* #swagger.tags = ['Admin - Items'] */
  /* #swagger.summary = 'Listar itens de todos os status para administração' */
  /* #swagger.description = 'Requer ADMIN/SUPERADMIN; fechado por padrão até a integração da autenticação real.' */
  /* #swagger.parameters['status'] = { in: 'query', type: 'string', enum: ['AVAILABLE', 'ELIGIBLE', 'HANDED_OVER', 'SOLD', 'AUCTIONED', 'DONATED', 'DISCARDED'] } */
  /* #swagger.parameters['categoryId'] = { in: 'query', type: 'integer' } */
  /* #swagger.parameters['buildingId'] = { in: 'query', type: 'integer' } */
  /* #swagger.parameters['search'] = { in: 'query', type: 'string' } */
  /* #swagger.parameters['page'] = { in: 'query', type: 'integer', default: 1 } */
  /* #swagger.parameters['per_page'] = { in: 'query', type: 'integer', default: 20, minimum: 1, maximum: 100 } */
  /* #swagger.responses[200] = { description: 'Itens paginados', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Filtros ou paginação inválidos', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Identidade autenticada inválida', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Papel sem permissão administrativa', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[503] = { description: 'Autenticação administrativa ainda não integrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  listItems,
);

adminItemRouter.get(
  '/:id/possible-owners',
  /* #swagger.tags = ['Admin - Items'] */
  /* #swagger.summary = 'Listar perdas compatíveis com um item' */
  /* #swagger.description = 'Compatibilidade determinística: mesma categoria, prédio igual quando indicado e lossDate até foundDate. Requer ADMIN/SUPERADMIN; fechado até integrar autenticação.' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[200] = { description: 'Perdas abertas compatíveis', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Identidade autenticada inválida', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Papel sem permissão administrativa', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Item não encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[503] = { description: 'Autenticação administrativa ainda não integrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  getPossibleOwners,
);

adminItemRouter.get(
  '/:id',
  /* #swagger.tags = ['Admin - Items'] */
  /* #swagger.summary = 'Consultar item no painel administrativo' */
  /* #swagger.description = 'Requer ADMIN/SUPERADMIN; fechado por padrão até a integração da autenticação real.' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[200] = { description: 'Item e fotos', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Identidade autenticada inválida', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Papel sem permissão administrativa', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Item não encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[503] = { description: 'Autenticação administrativa ainda não integrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  getItemDetails,
);

adminItemRouter.patch(
  '/:id',
  /* #swagger.tags = ['Admin - Items'] */
  /* #swagger.summary = 'Atualizar item e suas fotos' */
  /* #swagger.description = 'Requer ADMIN/SUPERADMIN; fechado por padrão até a integração da autenticação real.' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { title: 'Chaves', description: 'Descrição', categoryId: 1, buildingId: 1, foundLocation: 'Saguão', foundDate: '2026-10-23', photosToAdd: ['https://example.com/photo.jpg'], photosToRemove: [2] } } */
  /* #swagger.responses[200] = { description: 'Item atualizado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID ou payload inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Identidade autenticada inválida', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Papel sem permissão administrativa', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Item, referência ou foto não encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Item não pode ser atualizado neste estado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[503] = { description: 'Autenticação administrativa ainda não integrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  updateItem,
);

adminItemRouter.delete(
  '/:id',
  /* #swagger.tags = ['Admin - Items'] */
  /* #swagger.summary = 'Excluir item' */
  /* #swagger.description = 'Requer ADMIN/SUPERADMIN; fechado por padrão até a integração da autenticação real.' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[204] = { description: 'Item excluído sem corpo' } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Identidade autenticada inválida', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Papel sem permissão administrativa', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Item não encontrado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Item já entregue/destinado ou com histórico', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[503] = { description: 'Autenticação administrativa ainda não integrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  deleteItem,
);
