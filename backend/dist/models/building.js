var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { IsInt, IsOptional, IsPositive, IsString, Length } from 'class-validator';
import { Item } from './item.js';
import { LostReport } from './lost-report.js';
let Building = class Building {
    id;
    name;
    address;
    pickupPoint;
    serviceHours;
    items;
    lostReports;
    createdAt;
};
__decorate([
    PrimaryGeneratedColumn('increment'),
    IsOptional(),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], Building.prototype, "id", void 0);
__decorate([
    Index({ unique: true }),
    Column({ type: 'varchar', length: 150 }),
    IsString(),
    Length(3, 150),
    __metadata("design:type", String)
], Building.prototype, "name", void 0);
__decorate([
    Column({ type: 'varchar', length: 255 }),
    IsString(),
    Length(5, 255),
    __metadata("design:type", String)
], Building.prototype, "address", void 0);
__decorate([
    Column({ type: 'varchar', length: 200, name: 'pickup_point' }),
    IsString(),
    Length(3, 200),
    __metadata("design:type", String)
], Building.prototype, "pickupPoint", void 0);
__decorate([
    Column({ type: 'varchar', length: 200, name: 'service_hours' }),
    IsString(),
    Length(3, 200),
    __metadata("design:type", String)
], Building.prototype, "serviceHours", void 0);
__decorate([
    OneToMany(() => Item, (item) => item.building),
    __metadata("design:type", Array)
], Building.prototype, "items", void 0);
__decorate([
    OneToMany(() => LostReport, (report) => report.building),
    __metadata("design:type", Array)
], Building.prototype, "lostReports", void 0);
__decorate([
    CreateDateColumn({ type: 'datetime' }),
    __metadata("design:type", Date)
], Building.prototype, "createdAt", void 0);
Building = __decorate([
    Entity('buildings')
], Building);
export { Building };
