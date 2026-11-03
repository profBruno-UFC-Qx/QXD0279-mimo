import { HttpError } from '../middlewares/http-error.js';
import type { NotificationType } from '../models/enums.js';
import type { Notification } from '../models/notification.js';
import {
  findNotificationsByUserId,
  countUnreadNotificationsByUserId,
} from '../repository/notification.repository.js';

export interface PublicNotificationDto {
  id: number;
  userId: number;
  type: NotificationType;
  linkUrl: string;
  readAt: Date | null;
  createdAt: Date;
}

export function formatPublicNotification(n: Notification): PublicNotificationDto {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    linkUrl: n.linkUrl,
    readAt: n.readAt ?? null,
    createdAt: n.createdAt,
  };
}

export async function listOwnNotifications(
  userId: number,
  query: Record<string, unknown>,
): Promise<PublicNotificationDto[]> {
  let readFilter: boolean | undefined = undefined;

  if ('read[]' in query) {
    throw new HttpError(400, 'Parâmetro query "read" deve ser "true" ou "false".');
  }

  if ('read' in query && query.read !== undefined) {
    const rawRead = query.read;
    if (rawRead === 'true') {
      readFilter = true;
    } else if (rawRead === 'false') {
      readFilter = false;
    } else {
      throw new HttpError(400, 'Parâmetro query "read" deve ser "true" ou "false".');
    }
  }

  const notifications = await findNotificationsByUserId(userId, readFilter);
  return notifications.map(formatPublicNotification);
}

export async function countOwnUnreadNotifications(
  userId: number,
): Promise<{ count: number }> {
  const count = await countUnreadNotificationsByUserId(userId);
  return { count };
}
