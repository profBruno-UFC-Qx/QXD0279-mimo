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
  pickupPoint?: string;
  serviceHours?: string;
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

function parsePage(val: unknown): number {
  const num = Number(val);
  return Number.isFinite(num) ? Math.max(1, Math.floor(num)) : 1;
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
  const page = parsePage(query.page);
  const perPage = parsePerPage(query.per_page);

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
      pickupPoint: item.building.pickupPoint,
      serviceHours: item.building.serviceHours,
    },
    photos: (item.photos ?? []).map((p) => ({
      id: p.id,
      url: p.url,
    })),
  }));

  return paginate(publicData, total, { page, per_page: perPage });
}
