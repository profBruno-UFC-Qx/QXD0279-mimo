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
    lossDate: typeof data.lossDate === 'string' ? new Date(data.lossDate) : data.lossDate,
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
