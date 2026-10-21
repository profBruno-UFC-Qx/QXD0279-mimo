import { LostReportStatus } from './enums.js';
export class LostReport {
    id;
    userId;
    categoryId;
    buildingId;
    description;
    lossDate;
    status;
    createdAt;
    constructor(id, userId, categoryId, buildingId, description, lossDate, status, createdAt) {
        this.id = id;
        this.userId = userId;
        this.categoryId = categoryId;
        this.buildingId = buildingId;
        this.description = description;
        this.lossDate = lossDate;
        this.status = status;
        this.createdAt = createdAt;
    }
}
