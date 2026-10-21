import { DispositionType, ItemStatus } from './enums.js';

export class Item {
  constructor(
    public id: string,
    public title: string,
    public description: string | null,
    public categoryId: string,
    public buildingId: string,
    public foundLocation: string | null,
    public foundDate: Date,
    public status: ItemStatus,
    public plannedDestination: DispositionType | null,
    public createdBy: string,
    public createdAt: Date,
    public updatedAt: Date,
  ) {}
}
