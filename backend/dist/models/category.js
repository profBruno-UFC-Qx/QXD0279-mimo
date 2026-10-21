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
let Category = class Category {
    id;
    name;
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
], Category.prototype, "id", void 0);
__decorate([
    Index({ unique: true }),
    Column({ type: 'varchar', length: 100 }),
    IsString(),
    Length(2, 100),
    __metadata("design:type", String)
], Category.prototype, "name", void 0);
__decorate([
    OneToMany(() => Item, (item) => item.category),
    __metadata("design:type", Array)
], Category.prototype, "items", void 0);
__decorate([
    OneToMany(() => LostReport, (report) => report.category),
    __metadata("design:type", Array)
], Category.prototype, "lostReports", void 0);
__decorate([
    CreateDateColumn({ type: 'datetime' }),
    __metadata("design:type", Date)
], Category.prototype, "createdAt", void 0);
Category = __decorate([
    Entity('categories')
], Category);
export { Category };
