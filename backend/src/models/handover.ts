export class Handover {
  constructor(
    public id: string,
    public itemId: string,
    public withdrawnName: string,
    public withdrawnCpf: string,
    public withdrawnUserId: string | null,
    public adminId: string,
    public handedAt: Date,
  ) {}
}
