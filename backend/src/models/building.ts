export class Building {
  constructor(
    public id: string,
    public name: string,
    public address: string,
    public pickupPoint: string,
    public serviceHours: string,
    public createdAt: Date,
  ) {}
}
