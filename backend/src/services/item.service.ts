import { HttpError } from '../middlewares/http-error.js';
import { ItemStatus } from '../models/enums.js';
import { findPublicItems, type ItemListFilters } from '../repository/item.repository.js';
import { paginate, type Paginated } from '../shared/pagination.js';

export interface PublicPhotoDto {
  id: number;
  url: string;
}

export interface PublicCategoryDto {
  id: number;
  name: string;
}

export interface PublicBuildingDto {
  id: number;
  name: string;
}

export interface PublicItemDto {
  id: number;
  title: string;
  description: string | null;
  categoryId: number;
  buildingId: number;
  foundLocation: string | null;
  foundDate: string | Date;
  status: ItemStatus;
  category: PublicCategoryDto;
  building: PublicBuildingDto;
  photos: PublicPhotoDto[];
}

function parsePositiveInteger(val: unknown, paramName: string): number | undefined {
  if (val === undefined || val === null || val === '') {
    return undefined;
  }
  if (typeof val !== 'string' && typeof val !== 'number') {
    throw new HttpError(400, `O parâmetro ${paramName} deve ser um número inteiro positivo.`);
  }
  const str = String(val).trim();
  if (!/^[1-9][0-9]*$/.test(str)) {
    throw new HttpError(400, `O parâmetro ${paramName} deve ser um número inteiro positivo.`);
  }
  const num = Number(str);
  if (!Number.isSafeInteger(num)) {
    throw new HttpError(400, `O parâmetro ${paramName} está fora do limite permitido.`);
  }
  return num;
}

function parsePage(val: unknown, perPage: number): number {
  if (val === undefined || val === null || val === '') {
    return 1;
  }
  const str = String(val).trim();
  const num = Number(str);

  // Rejeita notação exponencial que resulta em overflow ou valores infinitos
  if (num === Infinity || (/^[+-]?[0-9]+(\.[0-9]+)?e[+-]?[0-9]+$/i.test(str) && !Number.isFinite(num))) {
    throw new HttpError(400, 'O parâmetro page está fora do limite permitido.');
  }

  // Rejeita inteiros decimais que excedem MAX_SAFE_INTEGER
  if (/^[0-9]+$/.test(str) && str.length >= 16) {
    try {
      if (BigInt(str) > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new HttpError(400, 'O parâmetro page está fora do limite permitido.');
      }
    } catch {
      throw new HttpError(400, 'O parâmetro page está fora do limite permitido.');
    }
  }

  if (Number.isFinite(num) && num > Number.MAX_SAFE_INTEGER) {
    throw new HttpError(400, 'O parâmetro page está fora do limite permitido.');
  }

  // Normalizações contratuais estabelecidas:
  // page=0 -> 1, page=-1 -> 1, page=abc -> 1
  if (!Number.isFinite(num) || isNaN(num) || num <= 0) {
    return 1;
  }

  const page = Math.floor(num);
  // Rejeita offset que ultrapasse o limite de inteiros seguros
  if ((page - 1) * perPage > Number.MAX_SAFE_INTEGER) {
    throw new HttpError(400, 'O parâmetro page está fora do limite permitido.');
  }

  return page;
}

function parsePerPage(val: unknown): number {
  const num = Number(val);
  return Number.isFinite(num) ? Math.min(100, Math.max(1, Math.floor(num))) : 20;
}

function parseSearch(val: unknown): string | undefined {
  if (val === undefined || val === null) {
    return undefined;
  }
  if (typeof val !== 'string') {
    return undefined;
  }
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function listCatalogItems(
  query: Record<string, unknown>,
): Promise<Paginated<PublicItemDto>> {
  const categoryId = parsePositiveInteger(query.categoryId, 'categoryId');
  const buildingId = parsePositiveInteger(query.buildingId, 'buildingId');
  const search = parseSearch(query.search);
  const perPage = parsePerPage(query.per_page);
  const page = parsePage(query.page, perPage);

  const filters: ItemListFilters = {
    categoryId,
    buildingId,
    search,
    page,
    perPage,
  };

  const { items, total } = await findPublicItems(filters);

  const publicData: PublicItemDto[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    categoryId: item.categoryId,
    buildingId: item.buildingId,
    foundLocation: item.foundLocation,
    foundDate: item.foundDate,
    status: item.status,
    category: {
      id: item.category.id,
      name: item.category.name,
    },
    building: {
      id: item.building.id,
      name: item.building.name,
    },
    photos: (item.photos ?? []).map((p) => ({
      id: p.id,
      url: p.url,
    })),
  }));

  return paginate(publicData, total, { page, per_page: perPage });
}
