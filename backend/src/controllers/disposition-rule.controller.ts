import { Router, type Request, type Response } from 'express';
import { validate } from 'class-validator';
import { DispositionRule } from '../models/disposition-rule.js';
import { DispositionType, UserRole } from '../models/enums.js';
import { HttpError } from '../middlewares/http-error.js';
import { DispositionRuleService } from '../services/disposition-rule.service.js';
import type {
  CreateDispositionRuleData,
  UpdateDispositionRuleData,
} from '../services/disposition-rule.service.js';
import type { ApiResponse } from '../shared/api-response.js';

const dispositionRuleService = new DispositionRuleService();
export const dispositionRuleRouter = Router();

type RequestWithIdentity = Request & { user?: unknown };
type AdminIdentity = { id: number; role: UserRole.ADMIN | UserRole.SUPERADMIN };

function requireAdminIdentity(req: Request): AdminIdentity {
  // req.user só é confiável quando preenchido pelo middleware de autenticação real.
  const user = (req as RequestWithIdentity).user;
  if (user === undefined || user === null) {
    throw new HttpError(503, 'A autenticação administrativa ainda não está integrada.');
  }
  if (typeof user !== 'object') throw new HttpError(401, 'Identidade autenticada inválida.');

  const identity = user as { id?: unknown; role?: unknown };
  if (!Number.isSafeInteger(identity.id) || typeof identity.id !== 'number' || identity.id <= 0) {
    throw new HttpError(401, 'Identidade autenticada inválida.');
  }
  if (identity.role !== UserRole.ADMIN && identity.role !== UserRole.SUPERADMIN) {
    throw new HttpError(403, 'Acesso restrito a administradores.');
  }

  return { id: identity.id, role: identity.role };
}

function parseRuleId(rawId: string): number {
  if (!/^\d+$/.test(rawId)) {
    throw new HttpError(400, 'O ID da regra deve ser um inteiro positivo seguro.');
  }
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, 'O ID da regra deve ser um inteiro positivo seguro.');
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

function parseDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new HttpError(400, 'days deve ser um inteiro positivo seguro.');
  }
  return value;
}

function parseDestination(value: unknown): DispositionType {
  if (typeof value !== 'string' || !Object.values(DispositionType).includes(value as DispositionType)) {
    throw new HttpError(400, 'destination deve ser um destino de destinação válido.');
  }
  return value as DispositionType;
}

async function validateRuleFields(data: Partial<DispositionRule>): Promise<void> {
  const errors = await validate(Object.assign(new DispositionRule(), data), {
    skipMissingProperties: true,
  });
  if (errors.length > 0) throw new HttpError(400, 'Um ou mais campos da regra são inválidos.');
}

async function parseCreatePayload(body: unknown): Promise<CreateDispositionRuleData> {
  const payload = requireObject(body);
  rejectUnknownFields(payload, ['days', 'destination']);
  if (!Object.hasOwn(payload, 'days') || !Object.hasOwn(payload, 'destination')) {
    throw new HttpError(400, 'Informe os campos days e destination.');
  }

  const data: CreateDispositionRuleData = {
    days: parseDays(payload.days),
    destination: parseDestination(payload.destination),
  };
  await validateRuleFields(data);
  return data;
}

async function parseUpdatePayload(body: unknown): Promise<UpdateDispositionRuleData> {
  const payload = requireObject(body);
  rejectUnknownFields(payload, ['days', 'destination', 'active', 'locked']);
  if (Object.keys(payload).length === 0) {
    throw new HttpError(400, 'Informe ao menos um campo para atualização.');
  }

  const data: UpdateDispositionRuleData = {};
  if (Object.hasOwn(payload, 'days')) data.days = parseDays(payload.days);
  if (Object.hasOwn(payload, 'destination')) data.destination = parseDestination(payload.destination);
  if (Object.hasOwn(payload, 'active')) {
    if (typeof payload.active !== 'boolean') throw new HttpError(400, 'active deve ser um booleano.');
    data.active = payload.active;
  }
  if (Object.hasOwn(payload, 'locked')) {
    if (typeof payload.locked !== 'boolean') throw new HttpError(400, 'locked deve ser um booleano.');
    data.locked = payload.locked;
  }

  await validateRuleFields(data);
  return data;
}

function parseActiveFilter(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new HttpError(400, 'O filtro active aceita somente true ou false.');
}

async function listDispositionRules(req: Request, res: Response): Promise<void> {
  requireAdminIdentity(req);
  const rules = await dispositionRuleService.list(parseActiveFilter(req.query.active));
  const response: ApiResponse<DispositionRule[]> = { success: true, data: rules };
  res.json(response);
}

async function getDispositionRule(req: Request<{ id: string }>, res: Response): Promise<void> {
  requireAdminIdentity(req);
  const rule = await dispositionRuleService.getById(parseRuleId(req.params.id));
  if (!rule) throw new HttpError(404, 'A regra de destinação não foi encontrada.');

  const response: ApiResponse<DispositionRule> = { success: true, data: rule };
  res.json(response);
}

async function createDispositionRule(req: Request, res: Response): Promise<void> {
  const identity = requireAdminIdentity(req);
  const rule = await dispositionRuleService.create(await parseCreatePayload(req.body), identity.id);
  const response: ApiResponse<DispositionRule> = { success: true, data: rule };
  res.status(201).json(response);
}

async function updateDispositionRule(req: Request<{ id: string }>, res: Response): Promise<void> {
  const identity = requireAdminIdentity(req);
  const rule = await dispositionRuleService.update(
    parseRuleId(req.params.id),
    await parseUpdatePayload(req.body),
    identity.role,
  );
  const response: ApiResponse<DispositionRule> = { success: true, data: rule };
  res.json(response);
}

async function removeDispositionRule(req: Request<{ id: string }>, res: Response): Promise<void> {
  const identity = requireAdminIdentity(req);
  await dispositionRuleService.remove(parseRuleId(req.params.id), identity.role);
  res.status(204).end();
}

dispositionRuleRouter.get(
  '/',
  /* #swagger.tags = ['Disposition Rules'] */
  /* #swagger.summary = 'Listar regras globais de destinação' */
  /* #swagger.description = 'Requer ADMIN ou SUPERADMIN; endpoint fechado até a integração da autenticação real.' */
  /* #swagger.parameters['active'] = { in: 'query', type: 'string', enum: ['true', 'false'], description: 'Filtra regras ativas ou inativas.' } */
  /* #swagger.responses[200] = { description: 'Regras ordenadas por prazo e ID', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Filtro active inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Identidade autenticada inválida', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito a ADMIN/SUPERADMIN', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[503] = { description: 'Autenticação administrativa ainda não integrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  listDispositionRules,
);

dispositionRuleRouter.get(
  '/:id',
  /* #swagger.tags = ['Disposition Rules'] */
  /* #swagger.summary = 'Consultar regra de destinação' */
  /* #swagger.description = 'Requer ADMIN ou SUPERADMIN; endpoint fechado até a integração da autenticação real.' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[200] = { description: 'Regra encontrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Identidade autenticada inválida', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito a ADMIN/SUPERADMIN', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Regra não encontrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[503] = { description: 'Autenticação administrativa ainda não integrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  getDispositionRule,
);

dispositionRuleRouter.post(
  '/',
  /* #swagger.tags = ['Disposition Rules'] */
  /* #swagger.summary = 'Criar regra global de destinação' */
  /* #swagger.description = 'Requer ADMIN ou SUPERADMIN. destination aceita SOLD, AUCTIONED, DONATED ou DISCARDED. A regra é criada ativa e destravada; createdBy vem exclusivamente da identidade autenticada. Endpoint fechado até integrar autenticação real.' */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { days: 30, destination: 'DONATED' } } */
  /* #swagger.responses[201] = { description: 'Regra criada', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Payload inválido ou com campos internos', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Identidade autenticada inválida', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito a ADMIN/SUPERADMIN', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Conflito de integridade ou concorrência', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[503] = { description: 'Autenticação administrativa ainda não integrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  createDispositionRule,
);

dispositionRuleRouter.patch(
  '/:id',
  /* #swagger.tags = ['Disposition Rules'] */
  /* #swagger.summary = 'Atualizar regra de destinação' */
  /* #swagger.description = 'Aceita qualquer subconjunto não vazio de days, destination, active e locked. destination aceita SOLD, AUCTIONED, DONATED ou DISCARDED. locked=true torna a regra somente leitura para ADMIN: apenas SUPERADMIN pode alterar locked ou sobrescrever uma regra travada. Endpoint fechado até integrar autenticação real.' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.parameters['body'] = { in: 'body', required: true, schema: { days: 45, destination: 'AUCTIONED', active: true, locked: false } } */
  /* #swagger.responses[200] = { description: 'Regra atualizada', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'ID, payload ou campos inválidos', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Identidade autenticada inválida', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Papel sem permissão ou regra travada para ADMIN', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Regra não encontrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Conflito com uma alteração simultânea', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[503] = { description: 'Autenticação administrativa ainda não integrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  updateDispositionRule,
);

dispositionRuleRouter.delete(
  '/:id',
  /* #swagger.tags = ['Disposition Rules'] */
  /* #swagger.summary = 'Excluir regra de destinação' */
  /* #swagger.description = 'ADMIN pode excluir apenas regras destravadas; SUPERADMIN pode excluir qualquer regra. A exclusão não altera itens elegíveis. Endpoint fechado até integrar autenticação real.' */
  /* #swagger.parameters['id'] = { in: 'path', required: true, type: 'integer' } */
  /* #swagger.responses[204] = { description: 'Regra excluída sem corpo' } */
  /* #swagger.responses[400] = { description: 'ID inválido', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Identidade autenticada inválida', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Regra travada para ADMIN', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[404] = { description: 'Regra não encontrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[409] = { description: 'Conflito com uma alteração simultânea', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[503] = { description: 'Autenticação administrativa ainda não integrada', schema: { $ref: '#/definitions/ApiResponse' } } */
  removeDispositionRule,
);
