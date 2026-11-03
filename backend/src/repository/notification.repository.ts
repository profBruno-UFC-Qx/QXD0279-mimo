import { AppDataSource } from '../data-source.js';
import { Notification } from '../models/notification.js';

export async function findNotificationsByUserId(
  userId: number,
  read?: boolean,
): Promise<Notification[]> {
  const repo = AppDataSource.getRepository(Notification);
  const qb = repo
    .createQueryBuilder('notification')
    .where('notification.userId = :userId', { userId });

  if (read === true) {
    qb.andWhere('notification.readAt IS NOT NULL');
  } else if (read === false) {
    qb.andWhere('notification.readAt IS NULL');
  }

  return qb
    .orderBy('notification.createdAt', 'DESC')
    .addOrderBy('notification.id', 'DESC')
    .getMany();
}

export async function countUnreadNotificationsByUserId(
  userId: number,
): Promise<number> {
  const repo = AppDataSource.getRepository(Notification);
  return repo
    .createQueryBuilder('notification')
    .where('notification.userId = :userId', { userId })
    .andWhere('notification.readAt IS NULL')
    .getCount();
}
