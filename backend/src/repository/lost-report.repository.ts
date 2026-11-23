import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source.js';
import { LostReport } from '../models/lost-report.js';
import { Category } from '../models/category.js';
import { Building } from '../models/building.js';
import { Item } from '../models/item.js';
import { User } from '../models/user.js';
import { Notification } from '../models/notification.js';
import { ItemStatus, LostReportStatus, UserRole, NotificationType } from '../models/enums.js';
import { getItemMatchScore } from '../shared/item-match.js';

export interface InsertLostReportData {
  userId: number;
  categoryId: number;
  buildingId: number | null;
  description: string;
  lossDate: string | Date;
  status: LostReportStatus;
}

export async function findCategoryById(
  id: number,
  entityManager?: EntityManager,
): Promise<Category | null> {
  const repo = entityManager ? entityManager.getRepository(Category) : AppDataSource.getRepository(Category);
  return await repo.findOne({ where: { id } });
}

export async function findBuildingById(
  id: number,
  entityManager?: EntityManager,
): Promise<Building | null> {
  const repo = entityManager ? entityManager.getRepository(Building) : AppDataSource.getRepository(Building);
  return await repo.findOne({ where: { id } });
}

export async function insertLostReport(
  data: InsertLostReportData,
  entityManager?: EntityManager,
): Promise<LostReport> {
  const repo = entityManager ? entityManager.getRepository(LostReport) : AppDataSource.getRepository(LostReport);
  const created = repo.create({
    userId: data.userId,
    categoryId: data.categoryId,
    buildingId: data.buildingId,
    description: data.description,
    lossDate: data.lossDate,
    status: data.status,
  });
  return await repo.save(created);
}

export async function findMatchingPublicItems(
  categoryId: number,
  buildingId: number | null,
  lossDate: string | Date,
  description: string,
  entityManager?: EntityManager,
): Promise<Item[]> {
  const repo = entityManager ? entityManager.getRepository(Item) : AppDataSource.getRepository(Item);
  const items = await repo
    .createQueryBuilder('item')
    .leftJoinAndSelect('item.category', 'category')
    .leftJoinAndSelect('item.building', 'building')
    .leftJoinAndSelect('item.photos', 'photos')
    .where('item.categoryId = :categoryId', { categoryId })
    .andWhere('item.status IN (:...publicStatuses)', {
      publicStatuses: [ItemStatus.AVAILABLE, ItemStatus.ELIGIBLE],
    })
    .orderBy('item.foundDate', 'DESC')
    .addOrderBy('item.id', 'DESC')
    .getMany();

  const report = { buildingId, lossDate, description };
  return items
    .map((item) => ({
      item,
      score: getItemMatchScore(item, report),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;

      const aDate = a.item.foundDate instanceof Date
        ? a.item.foundDate.getTime()
        : new Date(a.item.foundDate).getTime();
      const bDate = b.item.foundDate instanceof Date
        ? b.item.foundDate.getTime()
        : new Date(b.item.foundDate).getTime();
      if (aDate !== bDate) return bDate - aDate;
      return b.item.id - a.item.id;
    })
    .map(({ item }) => item);
}

export async function findLostReportsByUserId(
  userId: number,
  status?: LostReportStatus,
): Promise<LostReport[]> {
  const repo = AppDataSource.getRepository(LostReport);
  const qb = repo
    .createQueryBuilder('lostReport')
    .where('lostReport.userId = :userId', { userId });

  if (status !== undefined) {
    qb.andWhere('lostReport.status = :status', { status });
  }

  return await qb
    .orderBy('lostReport.createdAt', 'DESC')
    .addOrderBy('lostReport.id', 'DESC')
    .getMany();
}

export async function findLostReportByIdAndUserId(
  reportId: number,
  userId: number,
): Promise<LostReport | null> {
  const repo = AppDataSource.getRepository(LostReport);
  return await repo.findOne({
    where: {
      id: reportId,
      userId,
    },
  });
}

export interface UpdateLostReportData {
  categoryId?: number;
  buildingId?: number | null;
  description?: string;
  lossDate?: string;
}

export async function updateOwnLostReportIfOpen(
  reportId: number,
  userId: number,
  data: UpdateLostReportData,
): Promise<number> {
  const repo = AppDataSource.getRepository(LostReport);
  const updateFields: Record<string, unknown> = {};
  if (data.categoryId !== undefined) updateFields.categoryId = data.categoryId;
  if (data.buildingId !== undefined) updateFields.buildingId = data.buildingId;
  if (data.description !== undefined) updateFields.description = data.description;
  if (data.lossDate !== undefined) updateFields.lossDate = data.lossDate;

  if (Object.keys(updateFields).length === 0) {
    return 0;
  }

  const result = await repo
    .createQueryBuilder()
    .update(LostReport)
    .set(updateFields)
    .where('id = :reportId AND userId = :userId AND status = :openStatus', {
      reportId,
      userId,
      openStatus: LostReportStatus.OPEN,
    })
    .execute();

  return result.affected ?? 0;
}

export async function cancelOwnLostReportIfOpen(
  reportId: number,
  userId: number,
): Promise<number> {
  const repo = AppDataSource.getRepository(LostReport);
  const result = await repo
    .createQueryBuilder()
    .update(LostReport)
    .set({ status: LostReportStatus.CANCELLED })
    .where('id = :reportId AND userId = :userId AND status = :openStatus', {
      reportId,
      userId,
      openStatus: LostReportStatus.OPEN,
    })
    .execute();

  return result.affected ?? 0;
}

let lostReportTxQueue: Promise<void> = Promise.resolve();

function serializeLostReportTransaction<T>(work: () => Promise<T>): Promise<T> {
  // O driver SQLite do TypeORM compartilha uma única conexão; enfileirar transações de mutação evita colisão de BEGIN TRANSACTION sob carga concorrente.
  const run = lostReportTxQueue.then(work, work);
  lostReportTxQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function confirmLostReportSuggestionRepo(
  reportId: number,
  userId: number,
  itemId: number,
): Promise<'updated' | 'not_found' | 'not_open' | 'already_confirmed' | 'item_not_found'> {
  return await serializeLostReportTransaction(() =>
    AppDataSource.transaction(async (manager) => {
      const reportRepo = manager.getRepository(LostReport);
      const itemRepo = manager.getRepository(Item);
      const userRepo = manager.getRepository(User);
      const notificationRepo = manager.getRepository(Notification);

      const report = await reportRepo.findOne({ where: { id: reportId } });
      if (!report || report.userId !== userId) {
        return 'not_found';
      }
      if (report.status !== LostReportStatus.OPEN) {
        return 'not_open';
      }
      if (report.confirmedItemId !== null && report.confirmedItemId !== undefined) {
        return 'already_confirmed';
      }

      const eligibleItem = await itemRepo
        .createQueryBuilder('item')
        .where('item.id = :itemId', { itemId })
        .andWhere('item.categoryId = :categoryId', { categoryId: report.categoryId })
        .andWhere('item.status IN (:...publicStatuses)', {
          publicStatuses: [ItemStatus.AVAILABLE, ItemStatus.ELIGIBLE],
        })
        .getOne();
      if (!eligibleItem) {
        return 'item_not_found';
      }

      const updateResult = await manager
        .createQueryBuilder()
        .update(LostReport)
        .set({ confirmedItemId: eligibleItem.id })
        .where('id = :reportId', { reportId })
        .andWhere('userId = :userId', { userId })
        .andWhere('status = :openStatus', { openStatus: LostReportStatus.OPEN })
        .andWhere('confirmedItemId IS NULL')
        .execute();

      if ((updateResult.affected ?? 0) !== 1) {
        const fresh = await reportRepo.findOne({ where: { id: reportId } });
        if (!fresh || fresh.userId !== userId) {
          return 'not_found';
        }
        if (fresh.status !== LostReportStatus.OPEN) {
          return 'not_open';
        }
        return 'already_confirmed';
      }

      const admins = await userRepo.find({
        where: [
          { role: UserRole.ADMIN },
          { role: UserRole.SUPERADMIN },
        ],
      });

      if (admins.length > 0) {
        const notifications = admins.map((admin) =>
          notificationRepo.create({
            userId: admin.id,
            type: NotificationType.ITEM_CLAIMED,
            linkUrl: `/admin/items/${eligibleItem.id}`,
          }),
        );
        await notificationRepo.save(notifications);
      }

      return 'updated';
    }),
  );
}

export async function listAdminLostReportsRepo(
  filters: { status?: LostReportStatus; categoryId?: number; buildingId?: number },
  page: number,
  perPage: number,
): Promise<[LostReport[], number]> {
  const repo = AppDataSource.getRepository(LostReport);
  const qb = repo.createQueryBuilder('lostReport');

  if (filters.status !== undefined) {
    qb.andWhere('lostReport.status = :status', { status: filters.status });
  }
  if (filters.categoryId !== undefined) {
    qb.andWhere('lostReport.categoryId = :categoryId', { categoryId: filters.categoryId });
  }
  if (filters.buildingId !== undefined) {
    qb.andWhere('lostReport.buildingId = :buildingId', { buildingId: filters.buildingId });
  }

  return await qb
    .orderBy('lostReport.createdAt', 'DESC')
    .addOrderBy('lostReport.id', 'DESC')
    .skip((page - 1) * perPage)
    .take(perPage)
    .getManyAndCount();
}

export async function findAdminLostReportById(reportId: number): Promise<LostReport | null> {
  const repo = AppDataSource.getRepository(LostReport);
  return await repo.findOne({ where: { id: reportId } });
}

export async function resolveLostReportRepo(
  reportId: number,
): Promise<'resolved' | 'not_found' | 'not_open'> {
  return await serializeLostReportTransaction(() =>
    AppDataSource.transaction(async (manager) => {
      const reportRepo = manager.getRepository(LostReport);
      const notificationRepo = manager.getRepository(Notification);

      const updateResult = await manager
        .createQueryBuilder()
        .update(LostReport)
        .set({ status: LostReportStatus.RESOLVED })
        .where('id = :reportId', { reportId })
        .andWhere('status = :openStatus', { openStatus: LostReportStatus.OPEN })
        .execute();

      if ((updateResult.affected ?? 0) !== 1) {
        const existing = await reportRepo.findOne({ where: { id: reportId } });
        return existing ? 'not_open' : 'not_found';
      }

      const resolved = await reportRepo.findOne({ where: { id: reportId } });
      if (!resolved) {
        return 'not_found';
      }

      const notification = notificationRepo.create({
        userId: resolved.userId,
        type: NotificationType.REPORT_RESOLVED,
        linkUrl: `/lost-reports/${resolved.id}`,
      });
      await notificationRepo.save(notification);

      return 'resolved';
    }),
  );
}
