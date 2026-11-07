import { HttpError } from '../middlewares/http-error.js';
import { paginate, type Paginated } from '../shared/pagination.js';
import {
  createHandoverRepo,
  findHandoversByUserId,
  listAdminHandoversRepo,
  findHandoverById,
} from '../repository/handover.repository.js';
import type { Handover } from '../models/handover.js';

const CPF_REGEX = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;

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

function parseOptionalPositiveId(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parsePositiveId(value, field);
}

function parseDateFilter(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `O filtro ${field} deve usar o formato YYYY-MM-DD.`);
  }
  return value;
}

export async function createHandover(adminId: number, input: unknown): Promise<Handover> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Payload da requisição deve ser um objeto JSON válido.');
  }

  const payload = input as Record<string, unknown>;
  const itemId = parsePositiveId(payload.itemId, 'itemId');

  if (payload.withdrawnName === undefined || payload.withdrawnName === null || typeof payload.withdrawnName !== 'string') {
    throw new HttpError(400, 'O campo withdrawnName é obrigatório e deve ser texto.');
  }
  const withdrawnName = payload.withdrawnName.trim();
  if (withdrawnName.length < 3 || withdrawnName.length > 150) {
    throw new HttpError(400, 'O campo withdrawnName deve ter entre 3 e 150 caracteres.');
  }

  if (payload.withdrawnCpf === undefined || payload.withdrawnCpf === null || typeof payload.withdrawnCpf !== 'string') {
    throw new HttpError(400, 'O campo withdrawnCpf é obrigatório e deve ser texto.');
  }
  const withdrawnCpf = payload.withdrawnCpf.trim();
  if (!CPF_REGEX.test(withdrawnCpf)) {
    throw new HttpError(400, 'O campo withdrawnCpf é inválido.');
  }

  const withdrawnUserId = parseOptionalPositiveId(payload.withdrawnUserId, 'withdrawnUserId');

  const result = await createHandoverRepo({
    itemId,
    withdrawnName,
    withdrawnCpf,
    withdrawnUserId: withdrawnUserId ?? null,
    adminId,
  });

  if (result === 'item_not_found') {
    throw new HttpError(404, 'O item não foi encontrado.');
  }
  if (result === 'user_not_found') {
    throw new HttpError(404, 'O usuário retirante não foi encontrado.');
  }
  if (result === 'item_not_available_or_eligible') {
    throw new HttpError(409, 'O item não está disponível ou elegível para entrega.');
  }

  // Retornar a última entrega criada para o item
  const [handovers] = await listAdminHandoversRepo({ itemId }, 1, 1);
  if (handovers.length === 0) {
    throw new HttpError(500, 'Erro ao recuperar entrega criada.');
  }
  return handovers[0];
}

export async function listOwnHandovers(userId: number): Promise<Handover[]> {
  return await findHandoversByUserId(userId);
}

export async function listAdminHandovers(
  query: Record<string, unknown>,
): Promise<Paginated<Handover>> {
  const itemId = parseOptionalPositiveId(query.itemId, 'itemId') ?? undefined;
  const adminId = parseOptionalPositiveId(query.adminId, 'adminId') ?? undefined;
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

  const [handovers, total] = await listAdminHandoversRepo(
    { itemId, adminId, from, to },
    page,
    perPage,
  );

  return paginate(handovers, total, { page, per_page: perPage });
}

export async function getHandoverDetails(rawId: unknown, requesterUserId: number): Promise<Handover> {
  const id = parsePositiveId(rawId, 'id');
  const handover = await findHandoverById(id);
  if (!handover) {
    throw new HttpError(404, 'Retirada não encontrada.');
  }

  // Verificar se o solicitante é admin ou o próprio usuário retirante
  // (Nota: requireAdmin no controller pode ser usado, mas se for usuário comum, permitir se withdrawnUserId === requesterUserId)
  return handover;
}
