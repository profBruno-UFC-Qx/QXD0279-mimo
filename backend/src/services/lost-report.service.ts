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

function formatPublicLostReport(lr: LostReport, rawLossDate: string): PublicLostReportDto {
  const formattedLossDate =
    lr.lossDate instanceof Date
      ? lr.lossDate.toISOString().split('T')[0]
      : typeof lr.lossDate === 'string'
        ? lr.lossDate
        : rawLossDate;

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
