import { NotificationType } from './enums.js';
export class Notification {
    id;
    userId;
    type;
    linkUrl;
    readAt;
    createdAt;
    constructor(id, userId, type, linkUrl, readAt, createdAt) {
        this.id = id;
        this.userId = userId;
        this.type = type;
        this.linkUrl = linkUrl;
        this.readAt = readAt;
        this.createdAt = createdAt;
    }
}
