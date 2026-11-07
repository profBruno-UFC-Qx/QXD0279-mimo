import { AppDataSource } from '../data-source.js';
import { Category } from '../models/category.js';
import { Building } from '../models/building.js';
import { Disposition } from '../models/disposition.js';
import { Handover } from '../models/handover.js';
import { Item } from '../models/item.js';
import { ItemPhoto } from '../models/item-photo.js';
import { LostReport } from '../models/lost-report.js';
import { Notification } from '../models/notification.js';
import { ItemStatus, LostReportStatus, NotificationType } from '../models/enums.js';
import {
  In,
  Like,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';

export interface CreateAdminItemData {
  title: string;
  description: string | null;
  categoryId: number;
  buildingId: number;
  foundLocation: string | null;
  foundDate: Date;
  photos: string[];
}

export interface UpdateAdminItemData {
  title?: string;
  description?: string | null;
  categoryId?: number;
  buildingId?: number;
  foundLocation?: string | null;
  foundDate?: Date;
  photosToAdd?: string[];
  photosToRemove?: number[];
}

export interface AdminItemFilters {
  status?: ItemStatus;
  categoryId?: number;
  buildingId?: number;
  search?: string;
}

export type UpdateAdminItemResult =
  | Item
  | 'not_found'
  | 'not_editable'
  | 'reference_not_found'
  | 'photo_not_found';

export type DeleteAdminItemResult = 'deleted' | 'not_found' | 'not_editable' | 'has_history';

const editableStatuses = [ItemStatus.AVAILABLE, ItemStatus.ELIGIBLE];

export class AdminItemRepository {
  async create(data: CreateAdminItemData, createdBy: number): Promise<Item | null> {
    return AppDataSource.transaction(async (manager) => {
      if (!(await manager.getRepository(Category).existsBy({ id: data.categoryId }))) return null;
      if (!(await manager.getRepository(Building).existsBy({ id: data.buildingId }))) return null;

      const items = manager.getRepository(Item);
      const item = await items.save(items.create({
        title: data.title,
        description: data.description,
        categoryId: data.categoryId,
        buildingId: data.buildingId,
        foundLocation: data.foundLocation,
        foundDate: data.foundDate,
        status: ItemStatus.AVAILABLE,
        plannedDestination: null,
        createdBy,
      }));

      const photos = data.photos.map((url) => manager.getRepository(ItemPhoto).create({
        itemId: item.id,
        url,
      }));
      if (photos.length > 0) item.photos = await manager.getRepository(ItemPhoto).save(photos);
      else item.photos = [];

      const matches = await this.findCompatibleOpenLostReports(
        manager.getRepository(LostReport),
        item,
      );
      const uniqueMatches = new Map(matches.map((report) => [report.id, report]));
      const notifications = [...uniqueMatches.values()].map((report) =>
        manager.getRepository(Notification).create({
          userId: report.userId,
          type: NotificationType.MATCH_FOUND,
          linkUrl: `/lost-reports/${report.id}`,
        }),
      );
      if (notifications.length > 0) await manager.getRepository(Notification).save(notifications);

      const createdItem = await items.findOneBy({ id: item.id });
      if (!createdItem) throw new Error('Created item could not be reloaded.');
      createdItem.photos = item.photos;
      return createdItem;
    });
  }

  async list(
    filters: AdminItemFilters,
    page: number,
    perPage: number,
  ): Promise<[Item[], number]> {
    const where: FindOptionsWhere<Item> = {};
    if (filters.status) where.status = filters.status;
    if (filters.categoryId !== undefined) where.categoryId = filters.categoryId;
    if (filters.buildingId !== undefined) where.buildingId = filters.buildingId;

    const conditions: FindOptionsWhere<Item> | FindOptionsWhere<Item>[] = filters.search
      ? [
          { ...where, title: Like(`%${filters.search}%`) },
          { ...where, description: Like(`%${filters.search}%`) },
        ]
      : where;

    return AppDataSource.getRepository(Item).findAndCount({
      where: conditions,
      skip: (page - 1) * perPage,
      take: perPage,
      order: { foundDate: 'DESC', id: 'DESC' },
    });
  }

  async getById(id: number): Promise<Item | null> {
    return AppDataSource.getRepository(Item).findOneBy({ id });
  }

  async getDetails(id: number): Promise<{ item: Item; photos: ItemPhoto[] } | null> {
    const item = await this.getById(id);
    if (!item) return null;

    const photos = await AppDataSource.getRepository(ItemPhoto).find({
      where: { itemId: id },
      order: { id: 'ASC' },
    });
    return { item, photos };
  }

  async getPossibleOwners(id: number): Promise<LostReport[] | null> {
    const item = await this.getById(id);
    if (!item) return null;

    return this.findCompatibleOpenLostReports(AppDataSource.getRepository(LostReport), item);
  }

  async update(id: number, data: UpdateAdminItemData): Promise<UpdateAdminItemResult> {
    return AppDataSource.transaction(async (manager) => {
      const items = manager.getRepository(Item);
      const item = await items.findOneBy({ id });
      if (!item) return 'not_found';
      if (!editableStatuses.includes(item.status)) return 'not_editable';

      if (data.categoryId !== undefined && !(await manager.getRepository(Category).existsBy({ id: data.categoryId }))) {
        return 'reference_not_found';
      }
      if (data.buildingId !== undefined && !(await manager.getRepository(Building).existsBy({ id: data.buildingId }))) {
        return 'reference_not_found';
      }

      const photoIds = data.photosToRemove ?? [];
      const photos = manager.getRepository(ItemPhoto);
      if (photoIds.length > 0) {
        const ownedPhotos = await photos.find({ where: { itemId: id, id: In(photoIds) } });
        if (ownedPhotos.length !== photoIds.length) return 'photo_not_found';
      }

      const { photosToAdd = [], photosToRemove: _photosToRemove, ...changes } = data;
      if (Object.keys(changes).length > 0) {
        const updated = await items.update({ id, status: In(editableStatuses) }, changes);
        if (updated.affected !== 1) {
          return (await items.findOneBy({ id })) ? 'not_editable' : 'not_found';
        }
      }

      if (photoIds.length > 0) await photos.delete({ itemId: id, id: In(photoIds) });
      if (photosToAdd.length > 0) {
        await photos.save(photosToAdd.map((url) => photos.create({ itemId: id, url })));
      }

      const updatedItem = await items.findOneBy({ id });
      if (!updatedItem) return 'not_found';
      updatedItem.photos = await photos.find({ where: { itemId: id }, order: { id: 'ASC' } });
      return updatedItem;
    });
  }

  async delete(id: number): Promise<DeleteAdminItemResult> {
    return AppDataSource.transaction(async (manager) => {
      const items = manager.getRepository(Item);
      const item = await items.findOneBy({ id });
      if (!item) return 'not_found';
      if (!editableStatuses.includes(item.status)) return 'not_editable';

      if (await manager.getRepository(Handover).existsBy({ itemId: id })) return 'has_history';
      if (await manager.getRepository(Disposition).existsBy({ itemId: id })) return 'has_history';

      const result = await items.delete({ id, status: In(editableStatuses) });
      if (result.affected !== 1) {
        return (await items.findOneBy({ id })) ? 'not_editable' : 'not_found';
      }

      return 'deleted';
    });
  }

  private findCompatibleOpenLostReports(
    repository: Repository<LostReport>,
    item: { categoryId: number; buildingId: number; foundDate: Date | string },
  ): Promise<LostReport[]> {
    const foundDate = item.foundDate instanceof Date
      ? [
          item.foundDate.getFullYear(),
          String(item.foundDate.getMonth() + 1).padStart(2, '0'),
          String(item.foundDate.getDate()).padStart(2, '0'),
        ].join('-')
      : item.foundDate.slice(0, 10);

    return repository
      .createQueryBuilder('report')
      .where('report.categoryId = :categoryId', { categoryId: item.categoryId })
      .andWhere('report.status = :status', { status: LostReportStatus.OPEN })
      .andWhere('(report.buildingId = :buildingId OR report.buildingId IS NULL)', {
        buildingId: item.buildingId,
      })
      .andWhere('report.lossDate <= :foundDate', { foundDate })
      .orderBy('report.lossDate', 'DESC')
      .addOrderBy('report.id', 'ASC')
      .getMany();
  }
}
