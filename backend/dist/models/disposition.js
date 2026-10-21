import { DispositionType } from './enums.js';
export class Disposition {
    id;
    itemId;
    destination;
    adminId;
    receiverDocument;
    executedAt;
    constructor(id, itemId, destination, adminId, receiverDocument, executedAt) {
        this.id = id;
        this.itemId = itemId;
        this.destination = destination;
        this.adminId = adminId;
        this.receiverDocument = receiverDocument;
        this.executedAt = executedAt;
    }
}
