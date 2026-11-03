import { AppDataSource } from '../data-source.js';
import { Item } from '../models/item.js';
import { ItemStatus } from '../models/enums.js';

export interface ItemListFilters {
  categoryId?: number;
  buildingId?: number;
  search?: string;
  page: number;
  perPage: number;
}

export interface ItemListResult {
  items: Item[];
  total: number;
}

export async function findPublicItems(filters: ItemListFilters): Promise<ItemListResult> {
  const itemRepo = AppDataSource.getRepository(Item);

  const baseQb = itemRepo
    .createQueryBuilder('item')
    .where('item.status IN (:...publicStatuses)', {
      publicStatuses: [ItemStatus.AVAILABLE, ItemStatus.ELIGIBLE],
    });

  if (filters.categoryId !== undefined) {
    baseQb.andWhere('item.categoryId = :categoryId', { categoryId: filters.categoryId });
  }

  if (filters.buildingId !== undefined) {
    baseQb.andWhere('item.buildingId = :buildingId', { buildingId: filters.buildingId });
  }

  if (filters.search && filters.search.trim().length > 0) {
    const escaped = filters.search.trim().replace(/[%_\\]/g, '\\$&');
    baseQb.andWhere(
      '(item.title LIKE :search ESCAPE \'\\\' OR item.description LIKE :search ESCAPE \'\\\')',
      { search: `%${escaped}%` },
    );
  }

  const total = await baseQb.getCount();
  if (total === 0) {
    return { items: [], total: 0 };
  }

  // Paginação determinística baseada nos IDs dos itens
  const pagedRows = await baseQb
    .select('item.id', 'id')
    .orderBy('item.foundDate', 'DESC')
    .addOrderBy('item.id', 'DESC')
    .offset((filters.page - 1) * filters.perPage)
    .limit(filters.perPage)
    .getRawMany<{ id: number }>();

  const pagedIds = pagedRows.map((r) => r.id);
  if (pagedIds.length === 0) {
    return { items: [], total };
  }

  // Carrega as entidades completas com as relações públicas em lote
  const itemsWithRelations = await itemRepo
    .createQueryBuilder('item')
    .leftJoinAndSelect('item.category', 'category')
    .leftJoinAndSelect('item.building', 'building')
    .leftJoinAndSelect('item.photos', 'photos')
    .where('item.id IN (:...pagedIds)', { pagedIds })
    .getMany();

  // Reordena na ordem exata definida pela paginação de IDs
  const itemMap = new Map(itemsWithRelations.map((it) => [it.id, it]));
  const orderedItems = pagedIds.map((id) => itemMap.get(id)!).filter(Boolean);

  return { items: orderedItems, total };
}
