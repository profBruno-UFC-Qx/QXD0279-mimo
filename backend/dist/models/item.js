var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn, } from 'typeorm';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, IsPositive, Length, MaxLength, } from 'class-validator';
import { DispositionType, ItemStatus } from './enums.js';
import { Category } from './category.js';
import { Building } from './building.js';
import { User } from './user.js';
import { ItemPhoto } from './item-photo.js';
import { Handover } from './handover.js';
import { Disposition } from './disposition.js';
let Item = class Item {
    id;
    title;
    description;
    categoryId;
    category;
    buildingId;
    building;
    foundLocation;
    foundDate;
    status;
    plannedDestination;
    createdBy;
    createdByUser;
    photos;
    handovers;
    dispositions;
    createdAt;
    updatedAt;
};
__decorate([
    PrimaryGeneratedColumn('increment'),
    IsOptional(),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], Item.prototype, "id", void 0);
__decorate([
    Column({ type: 'varchar', length: 150 }),
    IsString(),
    Length(3, 150),
    __metadata("design:type", String)
], Item.prototype, "title", void 0);
__decorate([
    Column({ type: 'text', nullable: true }),
    IsOptional(),
    IsString(),
    MaxLength(2000),
    __metadata("design:type", Object)
], Item.prototype, "description", void 0);
__decorate([
    Column({ type: 'int', name: 'category_id' }),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], Item.prototype, "categoryId", void 0);
__decorate([
    ManyToOne(() => Category, (category) => category.items),
    JoinColumn({ name: 'category_id' }),
    __metadata("design:type", Category)
], Item.prototype, "category", void 0);
__decorate([
    Column({ type: 'int', name: 'building_id' }),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], Item.prototype, "buildingId", void 0);
__decorate([
    ManyToOne(() => Building, (building) => building.items),
    JoinColumn({ name: 'building_id' }),
    __metadata("design:type", Building)
], Item.prototype, "building", void 0);
__decorate([
    Column({ type: 'varchar', length: 200, nullable: true, name: 'found_location' }),
    IsOptional(),
    IsString(),
    MaxLength(200),
    __metadata("design:type", Object)
], Item.prototype, "foundLocation", void 0);
__decorate([
    Column({ type: 'date', name: 'found_date' }),
    IsDate(),
    __metadata("design:type", Date)
], Item.prototype, "foundDate", void 0);
__decorate([
    Column({ type: 'simple-enum', enum: ItemStatus, default: ItemStatus.AVAILABLE }),
    IsEnum(ItemStatus),
    __metadata("design:type", String)
], Item.prototype, "status", void 0);
__decorate([
    Column({ type: 'simple-enum', enum: DispositionType, nullable: true, name: 'planned_destination' }),
    IsOptional(),
    IsEnum(DispositionType),
    __metadata("design:type", Object)
], Item.prototype, "plannedDestination", void 0);
__decorate([
    Column({ type: 'int', name: 'created_by' }),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], Item.prototype, "createdBy", void 0);
__decorate([
    ManyToOne(() => User, (user) => user.createdItems),
    JoinColumn({ name: 'created_by' }),
    __metadata("design:type", User)
], Item.prototype, "createdByUser", void 0);
__decorate([
    OneToMany(() => ItemPhoto, (photo) => photo.item),
    __metadata("design:type", Array)
], Item.prototype, "photos", void 0);
__decorate([
    OneToMany(() => Handover, (handover) => handover.item),
    __metadata("design:type", Array)
], Item.prototype, "handovers", void 0);
__decorate([
    OneToMany(() => Disposition, (disposition) => disposition.item),
    __metadata("design:type", Array)
], Item.prototype, "dispositions", void 0);
__decorate([
    CreateDateColumn({ type: 'datetime', name: 'created_at' }),
    __metadata("design:type", Date)
], Item.prototype, "createdAt", void 0);
__decorate([
    UpdateDateColumn({ type: 'datetime', name: 'updated_at' }),
    __metadata("design:type", Date)
], Item.prototype, "updatedAt", void 0);
Item = __decorate([
    Index('IDX_items_status_foundeddate', ['status', 'foundDate']),
    Entity('items')
], Item);
export { Item };
