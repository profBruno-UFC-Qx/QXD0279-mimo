export class Handover {
    id;
    itemId;
    withdrawnName;
    withdrawnCpf;
    withdrawnUserId;
    adminId;
    handedAt;
    constructor(id, itemId, withdrawnName, withdrawnCpf, withdrawnUserId, adminId, handedAt) {
        this.id = id;
        this.itemId = itemId;
        this.withdrawnName = withdrawnName;
        this.withdrawnCpf = withdrawnCpf;
        this.withdrawnUserId = withdrawnUserId;
        this.adminId = adminId;
        this.handedAt = handedAt;
    }
}
