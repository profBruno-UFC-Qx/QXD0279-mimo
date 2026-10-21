import { DispositionType } from './enums.js';

export class Disposition {
  constructor(
    public id: string,
    public itemId: string,
    public destination: DispositionType,
    public adminId: string,
    public receiverDocument: string,
    public executedAt: Date,
  ) {}
}
