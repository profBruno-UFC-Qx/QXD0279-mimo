var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { IsDate, IsInt, IsOptional, IsPositive, IsString, Length, Matches } from 'class-validator';
import { Item } from './item.js';
import { User } from './user.js';
let Handover = class Handover {
    id;
    itemId;
    item;
    withdrawnName;
    withdrawnCpf;
    withdrawnUserId;
    withdrawnUser;
    adminId;
    admin;
    handedAt;
};
__decorate([
    PrimaryGeneratedColumn('increment'),
    IsOptional(),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], Handover.prototype, "id", void 0);
__decorate([
    Index(),
    Column({ type: 'int', name: 'item_id' }),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], Handover.prototype, "itemId", void 0);
__decorate([
    ManyToOne(() => Item, (item) => item.handovers),
    JoinColumn({ name: 'item_id' }),
    __metadata("design:type", Item)
], Handover.prototype, "item", void 0);
__decorate([
    Column({ type: 'varchar', length: 150 }),
    IsString(),
    Length(3, 150),
    __metadata("design:type", String)
], Handover.prototype, "withdrawnName", void 0);
__decorate([
    Column({ type: 'varchar', length: 14 }),
    Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, {
        message: 'withdrawnCpf inválido (formatos aceitos: 000.000.000-00 ou 00000000000).',
    }),
    __metadata("design:type", String)
], Handover.prototype, "withdrawnCpf", void 0);
__decorate([
    Column({ type: 'int', nullable: true, name: 'withdrawn_user_id' }),
    IsOptional(),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Object)
], Handover.prototype, "withdrawnUserId", void 0);
__decorate([
    ManyToOne(() => User, (user) => user.handoversAsWithdrawer, { nullable: true }),
    JoinColumn({ name: 'withdrawn_user_id' }),
    __metadata("design:type", Object)
], Handover.prototype, "withdrawnUser", void 0);
__decorate([
    Column({ type: 'int', name: 'admin_id' }),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], Handover.prototype, "adminId", void 0);
__decorate([
    ManyToOne(() => User, (user) => user.handoversAsAdmin),
    JoinColumn({ name: 'admin_id' }),
    __metadata("design:type", User)
], Handover.prototype, "admin", void 0);
__decorate([
    Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP', name: 'handed_at' }),
    IsDate(),
    __metadata("design:type", Date)
], Handover.prototype, "handedAt", void 0);
Handover = __decorate([
    Entity('handovers')
], Handover);
export { Handover };
