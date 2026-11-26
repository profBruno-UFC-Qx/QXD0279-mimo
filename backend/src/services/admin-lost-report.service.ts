import { HttpError } from '../middlewares/http-error.js';
import { LostReportStatus } from '../models/enums.js';
import { paginate, type Paginated } from '../shared/pagination.js';
import {
  listAdminLostReportsRepo,
  findAdminLostReportById,
  resolveLostReportRepo,
} from '../repository/lost-report.repository.js';
import { formatPublicLostReport, type PublicLostReportDto } from './lost-report.service.js';

function validateStatusFilter(rawStatus: unknown): LostReportStatus | undefined {
  if (rawStatus === undefined) {
    return undefined;
  }
  if (typeof rawStatus !== 'string' || rawStatus.trim().length === 0) {
    throw new HttpError(400, 'O parâmetro status não pode ser vazio ou repetido.');
  }
  const trimmed = rawStatus.trim();
  if (!Object.values(LostReportStatus).includes(trimmed as LostReportStatus)) {
    throw new HttpError(400, `Status inválido: ${trimmed}. Valores permitidos: OPEN, RESOLVED, CANCELLED.`);
  }
  return trimmed as LostReportStatus;
}

function parsePositiveId(value: unknown, field: string): number {
  if (value === undefined || value === null) {
    throw new HttpError(400, `O parâmetro ${field} é obrigatório.`);
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new HttpError(400, `O parâmetro ${field} deve ser um número inteiro positivo.`);
  }
  const str = String(value).trim();
  if (!/^[1-9]\d*$/.test(str)) {
    throw new HttpError(400, `O parâmetro ${field} deve ser um inteiro positivo.`);
  }
  const id = Number(str);
  if (!Number.isSafeInteger(id) || id <= 0 || String(id) !== str) {
    throw new HttpError(400, `O parâmetro ${field} deve ser um inteiro positivo seguro.`);
  }
  return id;
}

function parseOptionalPositiveId(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return parsePositiveId(value, field);
}

export async function listAdminLostReports(
  query: Record<string, unknown>,
): Promise<Paginated<PublicLostReportDto>> {
  const status = validateStatusFilter(query.status);
  const categoryId = parseOptionalPositiveId(query.categoryId, 'categoryId');
  const buildingId = parseOptionalPositiveId(query.buildingId, 'buildingId');

  const parsePage = (value: unknown, field: string, fallback: number): number => {
    if (value === undefined) return fallback;
    return parsePositiveId(value, field);
  };

  const page = parsePage(query.page, 'page', 1);
  const perPage = parsePage(query.per_page ?? query.perPage, 'per_page', 20);
  if (perPage > 100) {
    throw new HttpError(400, 'O parâmetro per_page deve ser no máximo 100.');
  }

  const [reports, total] = await listAdminLostReportsRepo(
    { status, categoryId, buildingId },
    page,
    perPage,
  );

  return paginate(
    reports.map((r) => formatPublicLostReport(r)),
    total,
    { page, per_page: perPage },
  );
}

export async function getAdminLostReportDetails(rawId: unknown): Promise<PublicLostReportDto> {
  const id = parsePositiveId(rawId, 'id');
  const report = await findAdminLostReportById(id);
  if (!report) {
    throw new HttpError(404, 'Relato de perda não encontrado.');
  }
  return formatPublicLostReport(report);
}

export async function resolveAdminLostReport(rawId: unknown): Promise<PublicLostReportDto> {
  const id = parsePositiveId(rawId, 'id');
  const result = await resolveLostReportRepo(id);
  if (result === 'not_found') {
    throw new HttpError(404, 'Relato de perda não encontrado.');
  }
  if (result === 'not_open') {
    throw new HttpError(409, 'O relato de perda não está aberto.');
  }
  const report = await findAdminLostReportById(id);
  if (!report) {
    throw new HttpError(404, 'Relato de perda não encontrado.');
  }
  return formatPublicLostReport(report);
}
