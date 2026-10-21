export class Building {
    id;
    name;
    address;
    pickupPoint;
    serviceHours;
    createdAt;
    constructor(id, name, address, pickupPoint, serviceHours, createdAt) {
        this.id = id;
        this.name = name;
        this.address = address;
        this.pickupPoint = pickupPoint;
        this.serviceHours = serviceHours;
        this.createdAt = createdAt;
    }
}
