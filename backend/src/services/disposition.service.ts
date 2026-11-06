import { HttpError } from '../middlewares/http-error.js';
import { paginate, type Paginated } from '../shared/pagination.js';
import { DispositionType } from '../models/enums.js';
import {
  createDispositionRepo,
  listAdminDispositionsRepo,
  findDispositionById,
} from '../repository/disposition.repository.js';
import type { Disposition } from '../models/disposition.js';

const DOCUMENT_REGEX = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$|^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;

function parsePositiveId(value: unknown, field: string): number {
  if (value === undefined || value === null) {
    throw new HttpError(400, `O campo ${field} é obrigatório.`);
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new HttpError(400, `O campo ${field} deve ser um número inteiro positivo.`);
  }
  const str = String(value).trim();
  if (!/^[1-9]\d*$/.test(str)) {
    throw new HttpError(400, `O campo ${field} deve ser um inteiro positivo.`);
  }
  const id = Number(str);
  if (!Number.isSafeInteger(id) || id <= 0 || String(id) !== str) {
    throw new HttpError(400, `O campo ${field} deve ser um inteiro positivo seguro.`);
  }
  return id;
}

function parseOptionalPositiveId(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return parsePositiveId(value, field);
}

function validateDestination(value: unknown): DispositionType {
  if (value === undefined || value === null || typeof value !== 'string') {
    throw new HttpError(400, 'O campo destination é obrigatório e deve ser uma string.');
  }
  const trimmed = value.trim();
  if (!Object.values(DispositionType).includes(trimmed as DispositionType)) {
    throw new HttpError(400, `Destination inválido: ${trimmed}. Valores permitidos: SOLD, AUCTIONED, DONATED, DISCARDED.`);
  }
  return trimmed as DispositionType;
}

function validateDestinationFilter(value: unknown): DispositionType | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, 'O filtro destination não pode ser vazio.');
  }
  const trimmed = value.trim();
  if (!Object.values(DispositionType).includes(trimmed as DispositionType)) {
    throw new HttpError(400, `Destination inválido: ${trimmed}.`);
  }
  return trimmed as DispositionType;
}

function parseDateFilter(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `O filtro ${field} deve usar o formato YYYY-MM-DD.`);
  }
  return value;
}

export async function createDisposition(adminId: number, input: unknown): Promise<Disposition> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Payload da requisição deve ser um objeto JSON válido.');
  }

  const payload = input as Record<string, unknown>;
  const itemId = parsePositiveId(payload.itemId, 'itemId');
  const destination = validateDestination(payload.destination);

  if (payload.receiverDocument === undefined || payload.receiverDocument === null || typeof payload.receiverDocument !== 'string') {
    throw new HttpError(400, 'O campo receiverDocument é obrigatório e deve ser texto.');
  }
  const receiverDocument = payload.receiverDocument.trim();
  if (!DOCUMENT_REGEX.test(receiverDocument)) {
    throw new HttpError(400, 'O campo receiverDocument deve ser um CPF ou CNPJ válido.');
  }

  const result = await createDispositionRepo({
    itemId,
    destination,
    receiverDocument,
    adminId,
  });

  if (result === 'item_not_found') {
    throw new HttpError(404, 'O item não foi encontrado.');
  }
  if (result === 'item_not_eligible') {
    throw new HttpError(409, 'O item não está elegível para destinação.');
  }

  const [dispositions] = await listAdminDispositionsRepo({ destination }, 1, 1);
  // Buscar a destinação recém criada
  const created = await listAdminDispositionsRepo({}, 1, 1);
  return created[0][0];
}

export async function listAdminDispositions(
  query: Record<string, unknown>,
): Promise<Paginated<Disposition>> {
  const destination = validateDestinationFilter(query.destination);
  const from = parseDateFilter(query.from, 'from');
  const to = parseDateFilter(query.to, 'to');

  const parsePage = (value: unknown, field: string, fallback: number): number => {
    if (value === undefined) return fallback;
    return parsePositiveId(value, field);
  };

  const page = parsePage(query.page, 'page', 1);
  const perPage = parsePage(query.per_page ?? query.perPage, 'per_page', 20);
  if (perPage > 100) {
    throw new HttpError(400, 'O parâmetro per_page deve ser no máximo 100.');
  }

  const [dispositions, total] = await listAdminDispositionsRepo(
    { destination, from, to },
    page,
    perPage,
  );

  return paginate(dispositions, total, { page, per_page: perPage });
}

export async function getDispositionDetails(rawId: unknown): Promise<Disposition> {
  const id = parsePositiveId(rawId, 'id');
  const disposition = await findDispositionById(id);
  if (!disposition) {
    throw new HttpError(404, 'Destinação não encontrada.');
  }
  return disposition;
}
