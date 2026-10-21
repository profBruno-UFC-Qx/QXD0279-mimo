import { DispositionType } from './enums.js';

export class DispositionRule {
  constructor(
    public id: string,
    public days: number,
    public destination: DispositionType,
    public active: boolean,
    public locked: boolean,
    public createdBy: string,
    public createdAt: Date,
    public updatedAt: Date,
  ) {}
}
