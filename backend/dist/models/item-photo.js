export class ItemPhoto {
    id;
    itemId;
    url;
    createdAt;
    constructor(id, itemId, url, createdAt) {
        this.id = id;
        this.itemId = itemId;
        this.url = url;
        this.createdAt = createdAt;
    }
}
