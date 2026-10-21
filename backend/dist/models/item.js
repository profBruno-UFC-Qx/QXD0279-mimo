import { DispositionType, ItemStatus } from './enums.js';
export class Item {
    id;
    title;
    description;
    categoryId;
    buildingId;
    foundLocation;
    foundDate;
    status;
    plannedDestination;
    createdBy;
    createdAt;
    updatedAt;
    constructor(id, title, description, categoryId, buildingId, foundLocation, foundDate, status, plannedDestination, createdBy, createdAt, updatedAt) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.categoryId = categoryId;
        this.buildingId = buildingId;
        this.foundLocation = foundLocation;
        this.foundDate = foundDate;
        this.status = status;
        this.plannedDestination = plannedDestination;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}
