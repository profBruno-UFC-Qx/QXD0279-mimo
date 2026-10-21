export class ItemPhoto {
  constructor(
    public id: string,
    public itemId: string,
    public url: string,
    public createdAt: Date,
  ) {}
}
