import { LostReportStatus } from './enums.js';

export class LostReport {
  constructor(
    public id: string,
    public userId: string,
    public categoryId: string,
    public buildingId: string | null,
    public description: string,
    public lossDate: Date,
    public status: LostReportStatus,
    public createdAt: Date,
  ) {}
}
