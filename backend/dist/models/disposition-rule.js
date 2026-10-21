import { DispositionType } from './enums.js';
export class DispositionRule {
    id;
    days;
    destination;
    active;
    locked;
    createdBy;
    createdAt;
    updatedAt;
    constructor(id, days, destination, active, locked, createdBy, createdAt, updatedAt) {
        this.id = id;
        this.days = days;
        this.destination = destination;
        this.active = active;
        this.locked = locked;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}
