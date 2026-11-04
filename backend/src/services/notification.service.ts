import { HttpError } from '../middlewares/http-error.js';
import type { NotificationType } from '../models/enums.js';
import type { Notification } from '../models/notification.js';
import {
  findNotificationsByUserId,
  countUnreadNotificationsByUserId,
  findNotificationByIdAndUserId,
  markNotificationReadIfUnread,
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

function parseNotificationId(rawId: unknown): number {
  if (typeof rawId !== 'string' && typeof rawId !== 'number') {
    throw new HttpError(400, 'ID inválido.');
  }

  const str = String(rawId).trim();
  if (!/^[1-9]\d*$/.test(str)) {
    throw new HttpError(400, 'ID inválido.');
  }

  const parsed = Number(str);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || String(parsed) !== str) {
    throw new HttpError(400, 'ID inválido.');
  }

  return parsed;
}

export async function markOwnNotificationAsRead(
  userId: number,
  rawId: unknown,
): Promise<PublicNotificationDto> {
  const notificationId = parseNotificationId(rawId);
  const readAt = new Date();

  await markNotificationReadIfUnread(notificationId, userId, readAt);

  // Consulta restrita ao proprietário autenticado: distingue "já lida" de
  // "inexistente/de terceiro" sem expor dados de notificações alheias.
  const notification = await findNotificationByIdAndUserId(notificationId, userId);
  if (!notification) {
    throw new HttpError(404, 'Notificação não encontrada.');
  }

  return formatPublicNotification(notification);
}
