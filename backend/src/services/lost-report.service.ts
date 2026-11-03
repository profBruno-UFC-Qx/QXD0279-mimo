import { AppDataSource } from '../data-source.js';
import { HttpError } from '../middlewares/http-error.js';
import { LostReportStatus, type ItemStatus } from '../models/enums.js';
import type { LostReport } from '../models/lost-report.js';
import type { Item } from '../models/item.js';
import {
  findCategoryById,
  findBuildingById,
  insertLostReport,
  findMatchingPublicItems,
  findLostReportsByUserId,
  findLostReportByIdAndUserId,
  updateOwnLostReportIfOpen,
} from '../repository/lost-report.repository.js';

export interface ValidatedLostReportInput {
  categoryId: number;
  buildingId: number | null;
  description: string;
  lossDate: string;
}

export interface PublicLostReportDto {
  id: number;
  userId: number;
  categoryId: number;
  buildingId: number | null;
  description: string;
  lossDate: string;
  status: LostReportStatus;
  createdAt: Date;
}

export interface PublicSuggestedItemDto {
  id: number;
  title: string;
  description: string | null;
  categoryId: number;
  buildingId: number;
  foundLocation: string | null;
  foundDate: string;
  status: ItemStatus;
  category?: { id: number; name: string };
  building?: { id: number; name: string };
  photos?: { id: number; url: string }[];
}

export interface CreateLostReportResult {
  lostReport: PublicLostReportDto;
  suggestions: PublicSuggestedItemDto[];
}

export function validateLostReportInput(input: unknown): ValidatedLostReportInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Payload da requisição deve ser um objeto JSON válido.');
  }

  const { categoryId, buildingId, description, lossDate } = input as Record<string, unknown>;

  // 1. Validação de categoryId
  if (categoryId === undefined || categoryId === null) {
    throw new HttpError(400, 'O campo categoryId é obrigatório.');
  }
  if (
    typeof categoryId !== 'number' ||
    !Number.isInteger(categoryId) ||
    categoryId <= 0 ||
    !Number.isSafeInteger(categoryId)
  ) {
    throw new HttpError(400, 'O campo categoryId deve ser um número inteiro positivo seguro.');
  }

  // 2. Validação de buildingId (opcional ou null)
  let validatedBuildingId: number | null = null;
  if (buildingId !== undefined && buildingId !== null) {
    if (
      typeof buildingId !== 'number' ||
      !Number.isInteger(buildingId) ||
      buildingId <= 0 ||
      !Number.isSafeInteger(buildingId)
    ) {
      throw new HttpError(400, 'O campo buildingId deve ser um número inteiro positivo seguro quando fornecido.');
    }
    validatedBuildingId = buildingId;
  }

  // 3. Validação de description
  if (description === undefined || description === null) {
    throw new HttpError(400, 'O campo description é obrigatório.');
  }
  if (typeof description !== 'string') {
    throw new HttpError(400, 'O campo description deve ser uma string.');
  }
  if (description.length < 10) {
    throw new HttpError(400, 'O campo description deve conter pelo menos 10 caracteres.');
  }
  if (description.length > 2000) {
    throw new HttpError(400, 'O campo description excede o limite máximo de 2000 caracteres.');
  }

  // 4. Validação de lossDate
  if (lossDate === undefined || lossDate === null) {
    throw new HttpError(400, 'O campo lossDate é obrigatório.');
  }
  if (typeof lossDate !== 'string') {
    throw new HttpError(400, 'O campo lossDate deve ser uma string no formato ISO YYYY-MM-DD.');
  }
  const dateMatch = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(lossDate);
  if (!dateMatch) {
    throw new HttpError(400, 'O campo lossDate deve estar no formato ISO YYYY-MM-DD.');
  }

  const [yearStr, monthStr, dayStr] = lossDate.split('-');
  const y = Number(yearStr);
  const m = Number(monthStr);
  const d = Number(dayStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y >= 0 && y <= 99) {
    dt.setUTCFullYear(y);
  }
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) {
    throw new HttpError(400, 'O campo lossDate representa uma data inexistente no calendário.');
  }

  return {
    categoryId,
    buildingId: validatedBuildingId,
    description,
    lossDate,
  };
}

export function formatPublicLostReport(lr: LostReport, rawLossDate?: string): PublicLostReportDto {
  const formattedLossDate =
    lr.lossDate instanceof Date
      ? lr.lossDate.toISOString().split('T')[0]
      : typeof lr.lossDate === 'string'
        ? lr.lossDate
        : (rawLossDate ?? String(lr.lossDate));

  return {
    id: lr.id,
    userId: lr.userId,
    categoryId: lr.categoryId,
    buildingId: lr.buildingId ?? null,
    description: lr.description,
    lossDate: formattedLossDate,
    status: lr.status,
    createdAt: lr.createdAt,
  };
}

function formatPublicSuggestedItem(item: Item): PublicSuggestedItemDto {
  const formattedFoundDate =
    item.foundDate instanceof Date
      ? item.foundDate.toISOString().split('T')[0]
      : String(item.foundDate);

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    categoryId: item.categoryId,
    buildingId: item.buildingId,
    foundLocation: item.foundLocation,
    foundDate: formattedFoundDate,
    status: item.status,
    category: item.category ? { id: item.category.id, name: item.category.name } : undefined,
    building: item.building ? { id: item.building.id, name: item.building.name } : undefined,
    photos: item.photos ? item.photos.map((p) => ({ id: p.id, url: p.url })) : [],
  };
}

export async function createLostReport(
  userId: number,
  input: unknown,
): Promise<CreateLostReportResult> {
  const validated = validateLostReportInput(input);

  return await AppDataSource.transaction(async (manager) => {
    // Validação de integridade referencial prévia
    const category = await findCategoryById(validated.categoryId, manager);
    if (!category) {
      throw new HttpError(400, `Categoria com ID ${validated.categoryId} não encontrada.`);
    }

    if (validated.buildingId !== null) {
      const building = await findBuildingById(validated.buildingId, manager);
      if (!building) {
        throw new HttpError(400, `Prédio com ID ${validated.buildingId} não encontrado.`);
      }
    }

    // Inserção com campos controlados pelo servidor
    const savedReport = await insertLostReport(
      {
        userId,
        categoryId: validated.categoryId,
        buildingId: validated.buildingId,
        description: validated.description,
        lossDate: validated.lossDate,
        status: LostReportStatus.OPEN,
      },
      manager,
    );

    // Consulta de sugestões compatíveis (RF12)
    const matchingItems = await findMatchingPublicItems(validated.categoryId, manager);

    return {
      lostReport: formatPublicLostReport(savedReport, validated.lossDate),
      suggestions: matchingItems.map(formatPublicSuggestedItem),
    };
  });
}

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

export async function listOwnLostReports(
  userId: number,
  query: Record<string, unknown>,
): Promise<PublicLostReportDto[]> {
  const status = validateStatusFilter(query.status);
  const reports = await findLostReportsByUserId(userId, status);
  return reports.map((r) => formatPublicLostReport(r));
}

function parseReportId(rawId: unknown): number {
  if (typeof rawId !== 'string' && typeof rawId !== 'number') {
    throw new HttpError(400, 'ID inválido.');
  }
  const str = String(rawId).trim();
  if (!/^[1-9]\d*$/.test(str)) {
    throw new HttpError(400, 'ID inválido.');
  }
  const parsed = Number(str);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || String(parsed) !== str) {
    throw new HttpError(400, 'ID inválido.');
  }
  return parsed;
}

export async function getOwnLostReportDetails(
  userId: number,
  rawId: unknown,
): Promise<PublicLostReportDto> {
  const reportId = parseReportId(rawId);
  const report = await findLostReportByIdAndUserId(reportId, userId);
  if (!report) {
    throw new HttpError(404, 'Relato de perda não encontrado.');
  }
  return formatPublicLostReport(report);
}

export interface ValidatedLostReportUpdateInput {
  categoryId?: number;
  buildingId?: number | null;
  description?: string;
  lossDate?: string;
}

function validateLostReportUpdateInput(input: unknown): ValidatedLostReportUpdateInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Payload inválido.');
  }

  const obj = input as Record<string, unknown>;
  const result: ValidatedLostReportUpdateInput = {};
  let hasField = false;

  // 1. categoryId
  if ('categoryId' in obj && obj.categoryId !== undefined) {
    const catId = obj.categoryId;
    if (typeof catId !== 'number' || !Number.isSafeInteger(catId) || catId <= 0) {
      throw new HttpError(400, 'categoryId deve ser um inteiro positivo.');
    }
    result.categoryId = catId;
    hasField = true;
  }

  // 2. buildingId
  if ('buildingId' in obj && obj.buildingId !== undefined) {
    const bldId = obj.buildingId;
    if (bldId === null) {
      result.buildingId = null;
      hasField = true;
    } else if (typeof bldId !== 'number' || !Number.isSafeInteger(bldId) || bldId <= 0) {
      throw new HttpError(400, 'buildingId deve ser um inteiro positivo ou null.');
    } else {
      result.buildingId = bldId;
      hasField = true;
    }
  }

  // 3. description
  if ('description' in obj && obj.description !== undefined) {
    const desc = obj.description;
    if (typeof desc !== 'string') {
      throw new HttpError(400, 'description deve ser uma string.');
    }
    const trimmed = desc.trim();
    if (trimmed.length < 10 || trimmed.length > 2000) {
      throw new HttpError(400, 'description deve ter entre 10 e 2000 caracteres.');
    }
    result.description = trimmed;
    hasField = true;
  }

  // 4. lossDate
  if ('lossDate' in obj && obj.lossDate !== undefined) {
    const lDate = obj.lossDate;
    if (typeof lDate !== 'string') {
      throw new HttpError(400, 'lossDate deve ser uma string no formato ISO YYYY-MM-DD.');
    }
    const match = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(lDate);
    if (!match) {
      throw new HttpError(400, 'lossDate deve estar no formato ISO YYYY-MM-DD.');
    }
    const [yStr, mStr, dStr] = lDate.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (y >= 0 && y <= 99) {
      dt.setUTCFullYear(y);
    }
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) {
      throw new HttpError(400, 'lossDate representa uma data inexistente no calendário.');
    }
    result.lossDate = lDate;
    hasField = true;
  }

  if (!hasField) {
    throw new HttpError(400, 'Nenhum campo válido para atualização foi informado.');
  }

  return result;
}

export async function updateOwnLostReport(
  userId: number,
  rawId: unknown,
  input: unknown,
): Promise<PublicLostReportDto> {
  const reportId = parseReportId(rawId);
  const validated = validateLostReportUpdateInput(input);

  if (validated.categoryId !== undefined) {
    const cat = await findCategoryById(validated.categoryId);
    if (!cat) {
      throw new HttpError(400, `Categoria com ID ${validated.categoryId} não encontrada.`);
    }
  }

  if (validated.buildingId !== undefined && validated.buildingId !== null) {
    const bld = await findBuildingById(validated.buildingId);
    if (!bld) {
      throw new HttpError(400, `Prédio com ID ${validated.buildingId} não encontrado.`);
    }
  }

  const affected = await updateOwnLostReportIfOpen(reportId, userId, validated);
  if (affected === 0) {
    const existing = await findLostReportByIdAndUserId(reportId, userId);
    if (!existing) {
      throw new HttpError(404, 'Relato de perda não encontrado.');
    }
    if (existing.status !== LostReportStatus.OPEN) {
      throw new HttpError(409, 'Somente relatos com status OPEN podem ser editados.');
    }
  }

  const updated = await findLostReportByIdAndUserId(reportId, userId);
  if (!updated) {
    throw new HttpError(404, 'Relato de perda não encontrado.');
  }
  return formatPublicLostReport(updated);
}
