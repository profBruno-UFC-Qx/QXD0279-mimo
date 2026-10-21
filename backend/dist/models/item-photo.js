var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, } from 'typeorm';
import { IsInt, IsOptional, IsPositive, IsString, Length } from 'class-validator';
import { Item } from './item.js';
let ItemPhoto = class ItemPhoto {
    id;
    itemId;
    item;
    url;
    createdAt;
};
__decorate([
    PrimaryGeneratedColumn('increment'),
    IsOptional(),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], ItemPhoto.prototype, "id", void 0);
__decorate([
    Index(),
    Column({ type: 'int', name: 'item_id' }),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], ItemPhoto.prototype, "itemId", void 0);
__decorate([
    ManyToOne(() => Item, (item) => item.photos, { onDelete: 'CASCADE' }),
    JoinColumn({ name: 'item_id' }),
    __metadata("design:type", Item)
], ItemPhoto.prototype, "item", void 0);
__decorate([
    Column({ type: 'varchar', length: 500 }),
    IsString(),
    Length(1, 500),
    __metadata("design:type", String)
], ItemPhoto.prototype, "url", void 0);
__decorate([
    CreateDateColumn({ type: 'datetime' }),
    __metadata("design:type", Date)
], ItemPhoto.prototype, "createdAt", void 0);
ItemPhoto = __decorate([
    Entity('item_photos')
], ItemPhoto);
export { ItemPhoto };
