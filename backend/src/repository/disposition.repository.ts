import { AppDataSource } from '../data-source.js';
import { Disposition } from '../models/disposition.js';
import { Item } from '../models/item.js';
import { DispositionType, ItemStatus } from '../models/enums.js';

export interface CreateDispositionData {
  itemId: number;
  destination: DispositionType;
  receiverDocument: string;
  adminId: number;
}

export async function createDispositionRepo(
  data: CreateDispositionData,
): Promise<'success' | 'item_not_found' | 'item_not_eligible'> {
  return await AppDataSource.transaction(async (manager) => {
    const itemRepo = manager.getRepository(Item);
    const dispositionRepo = manager.getRepository(Disposition);

    const item = await itemRepo.findOne({ where: { id: data.itemId } });
    if (!item) {
      return 'item_not_found';
    }

    if (item.status !== ItemStatus.ELIGIBLE) {
      return 'item_not_eligible';
    }

    // Mapear DispositionType para ItemStatus correspondente
    let newStatus: ItemStatus;
    switch (data.destination) {
      case DispositionType.SOLD:
        newStatus = ItemStatus.SOLD;
        break;
      case DispositionType.AUCTIONED:
        newStatus = ItemStatus.AUCTIONED;
        break;
      case DispositionType.DONATED:
        newStatus = ItemStatus.DONATED;
        break;
      case DispositionType.DISCARDED:
        newStatus = ItemStatus.DISCARDED;
        break;
      default:
        return 'item_not_eligible';
    }

    item.status = newStatus;
    await itemRepo.save(item);

    const disposition = dispositionRepo.create({
      itemId: data.itemId,
      destination: data.destination,
      receiverDocument: data.receiverDocument,
      adminId: data.adminId,
    });
    await dispositionRepo.save(disposition);

    return 'success';
  });
}

export interface AdminDispositionFilters {
  destination?: DispositionType;
  from?: string;
  to?: string;
}

export async function listAdminDispositionsRepo(
  filters: AdminDispositionFilters,
  page: number,
  perPage: number,
): Promise<[Disposition[], number]> {
  const repo = AppDataSource.getRepository(Disposition);
  const qb = repo
    .createQueryBuilder('disposition')
    .leftJoinAndSelect('disposition.item', 'item')
    .leftJoinAndSelect('item.category', 'category')
    .leftJoinAndSelect('item.building', 'building')
    .leftJoinAndSelect('disposition.admin', 'admin');

  if (filters.destination !== undefined) {
    qb.andWhere('disposition.destination = :destination', { destination: filters.destination });
  }
  if (filters.from !== undefined) {
    qb.andWhere('disposition.executedAt >= :from', { from: `${filters.from} 00:00:00` });
  }
  if (filters.to !== undefined) {
    qb.andWhere('disposition.executedAt <= :to', { to: `${filters.to} 23:59:59` });
  }

  return await qb
    .orderBy('disposition.executedAt', 'DESC')
    .addOrderBy('disposition.id', 'DESC')
    .skip((page - 1) * perPage)
    .take(perPage)
    .getManyAndCount();
}

export async function findDispositionById(id: number): Promise<Disposition | null> {
  const repo = AppDataSource.getRepository(Disposition);
  return await repo.findOne({
    where: { id },
    relations: ['item', 'item.category', 'item.building', 'admin'],
  });
}
