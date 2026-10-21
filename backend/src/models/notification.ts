import { NotificationType } from './enums.js';

export class Notification {
  constructor(
    public id: string,
    public userId: string,
    public type: NotificationType,
    public linkUrl: string,
    public readAt: Date | null,
    public createdAt: Date,
  ) {}
}
