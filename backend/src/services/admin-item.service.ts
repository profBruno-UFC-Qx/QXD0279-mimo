import { Item } from '../models/item.js';
import { LostReport } from '../models/lost-report.js';
import { HttpError } from '../middlewares/http-error.js';
import { paginate, type Paginated } from '../shared/pagination.js';
import {
  AdminItemRepository,
  type AdminItemFilters,
  type CreateAdminItemData,
  type UpdateAdminItemData,
} from '../repository/admin-item.repository.js';
import type { ItemPhoto } from '../models/item-photo.js';

export type {
  AdminItemFilters,
  CreateAdminItemData,
  UpdateAdminItemData,
} from '../repository/admin-item.repository.js';

export class AdminItemService {
  constructor(private readonly repository = new AdminItemRepository()) {}

  async create(data: CreateAdminItemData, createdBy: number): Promise<Item> {
    const item = await this.repository.create(data, createdBy);
    if (!item) throw new HttpError(404, 'A categoria ou o prédio informado não foi encontrado.');
    return item;
  }

  async list(
    filters: AdminItemFilters,
    page: number,
    perPage: number,
  ): Promise<Paginated<Item>> {
    const [items, total] = await this.repository.list(filters, page, perPage);
    return paginate(items, total, { page, per_page: perPage });
  }

  async getDetails(id: number): Promise<{ item: Item; photos: ItemPhoto[] } | null> {
    return this.repository.getDetails(id);
  }

  async getPossibleOwners(id: number): Promise<LostReport[] | null> {
    return this.repository.getPossibleOwners(id);
  }

  async update(id: number, data: UpdateAdminItemData): Promise<Item> {
    const result = await this.repository.update(id, data);
    if (result === 'not_found') throw new HttpError(404, 'O item não foi encontrado.');
    if (result === 'not_editable') {
      throw new HttpError(409, 'Itens entregues ou destinados não podem ser atualizados.');
    }
    if (result === 'reference_not_found') {
      throw new HttpError(404, 'A categoria ou o prédio informado não foi encontrado.');
    }
    if (result === 'photo_not_found') {
      throw new HttpError(404, 'Uma ou mais fotos não pertencem a este item.');
    }
    return result;
  }

  async remove(id: number): Promise<void> {
    const result = await this.repository.delete(id);
    if (result === 'not_found') throw new HttpError(404, 'O item não foi encontrado.');
    if (result !== 'deleted') {
      throw new HttpError(409, 'Itens entregues, destinados ou com histórico não podem ser excluídos.');
    }
  }
}
