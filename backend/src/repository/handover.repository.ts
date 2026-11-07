import { AppDataSource } from '../data-source.js';
import { Handover } from '../models/handover.js';
import { Item } from '../models/item.js';
import { User } from '../models/user.js';
import { ItemStatus } from '../models/enums.js';

export interface CreateHandoverData {
  itemId: number;
  withdrawnName: string;
  withdrawnCpf: string;
  withdrawnUserId: number | null;
  adminId: number;
}

export async function createHandoverRepo(
  data: CreateHandoverData,
): Promise<'success' | 'item_not_found' | 'item_not_available_or_eligible' | 'user_not_found'> {
  return await AppDataSource.transaction(async (manager) => {
    const itemRepo = manager.getRepository(Item);
    const handoverRepo = manager.getRepository(Handover);
    const userRepo = manager.getRepository(User);

    if (data.withdrawnUserId !== null && data.withdrawnUserId !== undefined) {
      const userExists = await userRepo.existsBy({ id: data.withdrawnUserId });
      if (!userExists) {
        return 'user_not_found';
      }
    }

    const item = await itemRepo.findOne({ where: { id: data.itemId } });
    if (!item) {
      return 'item_not_found';
    }

    if (item.status !== ItemStatus.AVAILABLE && item.status !== ItemStatus.ELIGIBLE) {
      return 'item_not_available_or_eligible';
    }

    item.status = ItemStatus.HANDED_OVER;
    await itemRepo.save(item);

    const handover = handoverRepo.create({
      itemId: data.itemId,
      withdrawnName: data.withdrawnName,
      withdrawnCpf: data.withdrawnCpf,
      withdrawnUserId: data.withdrawnUserId,
      adminId: data.adminId,
    });
    await handoverRepo.save(handover);

    return 'success';
  });
}

export async function findHandoversByUserId(userId: number): Promise<Handover[]> {
  const repo = AppDataSource.getRepository(Handover);
  return await repo.find({
    where: { withdrawnUserId: userId },
    relations: ['item', 'item.category', 'item.building', 'admin'],
    order: { handedAt: 'DESC', id: 'DESC' },
  });
}

export interface AdminHandoverFilters {
  itemId?: number;
  adminId?: number;
  from?: string;
  to?: string;
}

export async function listAdminHandoversRepo(
  filters: AdminHandoverFilters,
  page: number,
  perPage: number,
): Promise<[Handover[], number]> {
  const repo = AppDataSource.getRepository(Handover);
  const qb = repo
    .createQueryBuilder('handover')
    .leftJoinAndSelect('handover.item', 'item')
    .leftJoinAndSelect('item.category', 'category')
    .leftJoinAndSelect('item.building', 'building')
    .leftJoinAndSelect('handover.admin', 'admin');

  if (filters.itemId !== undefined) {
    qb.andWhere('handover.itemId = :itemId', { itemId: filters.itemId });
  }
  if (filters.adminId !== undefined) {
    qb.andWhere('handover.adminId = :adminId', { adminId: filters.adminId });
  }
  if (filters.from !== undefined) {
    qb.andWhere('handover.handedAt >= :from', { from: `${filters.from} 00:00:00` });
  }
  if (filters.to !== undefined) {
    qb.andWhere('handover.handedAt <= :to', { to: `${filters.to} 23:59:59` });
  }

  return await qb
    .orderBy('handover.handedAt', 'DESC')
    .addOrderBy('handover.id', 'DESC')
    .skip((page - 1) * perPage)
    .take(perPage)
    .getManyAndCount();
}

export async function findHandoverById(id: number): Promise<Handover | null> {
  const repo = AppDataSource.getRepository(Handover);
  return await repo.findOne({
    where: { id },
    relations: ['item', 'item.category', 'item.building', 'admin', 'withdrawnUser'],
  });
}
