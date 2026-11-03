import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source.js';
import { LostReport } from '../models/lost-report.js';
import { Category } from '../models/category.js';
import { Building } from '../models/building.js';
import { Item } from '../models/item.js';
import { ItemStatus, LostReportStatus } from '../models/enums.js';

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
  entityManager?: EntityManager,
): Promise<Item[]> {
  const repo = entityManager ? entityManager.getRepository(Item) : AppDataSource.getRepository(Item);
  return await repo
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
