var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { DispositionType } from './enums.js';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { IsDate, IsEnum, IsInt, IsOptional, IsPositive, Matches } from 'class-validator';
import { Item } from './item.js';
import { User } from './user.js';
let Disposition = class Disposition {
    id;
    itemId;
    item;
    destination;
    adminId;
    admin;
    receiverDocument;
    executedAt;
};
__decorate([
    PrimaryGeneratedColumn('increment'),
    IsOptional(),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], Disposition.prototype, "id", void 0);
__decorate([
    Index(),
    Column({ type: 'int', name: 'item_id' }),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], Disposition.prototype, "itemId", void 0);
__decorate([
    ManyToOne(() => Item, (item) => item.dispositions),
    JoinColumn({ name: 'item_id' }),
    __metadata("design:type", Item)
], Disposition.prototype, "item", void 0);
__decorate([
    Column({ type: 'simple-enum', enum: DispositionType }),
    IsEnum(DispositionType),
    __metadata("design:type", String)
], Disposition.prototype, "destination", void 0);
__decorate([
    Column({ type: 'int', name: 'admin_id' }),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], Disposition.prototype, "adminId", void 0);
__decorate([
    ManyToOne(() => User, (user) => user.dispositionsExecuted),
    JoinColumn({ name: 'admin_id' }),
    __metadata("design:type", User)
], Disposition.prototype, "admin", void 0);
__decorate([
    Column({ type: 'varchar', length: 18 }),
    Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$|^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, {
        message: 'receiverDocument deve ser um CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00).',
    }),
    __metadata("design:type", String)
], Disposition.prototype, "receiverDocument", void 0);
__decorate([
    Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP', name: 'executed_at' }),
    IsDate(),
    __metadata("design:type", Date)
], Disposition.prototype, "executedAt", void 0);
Disposition = __decorate([
    Entity('dispositions')
], Disposition);
export { Disposition };
