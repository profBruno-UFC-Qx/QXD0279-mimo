var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { IsEmail, IsEnum, IsInt, IsOptional, IsPositive, IsString, Length, Matches } from 'class-validator';
import { UserRole } from './enums.js';
import { Notification } from './notification.js';
import { Item } from './item.js';
import { LostReport } from './lost-report.js';
import { Handover } from './handover.js';
import { DispositionRule } from './disposition-rule.js';
import { Disposition } from './disposition.js';
let User = class User {
    id;
    name;
    email;
    passwordHash;
    phone;
    role;
    notifications;
    createdItems;
    lostReports;
    handoversAsWithdrawer;
    handoversAsAdmin;
    dispositionRulesCreated;
    dispositionsExecuted;
    createdAt;
    updatedAt;
};
__decorate([
    PrimaryGeneratedColumn('increment'),
    IsOptional(),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], User.prototype, "id", void 0);
__decorate([
    Column({ type: 'varchar', length: 150, name: 'name' }),
    IsString(),
    Length(3, 150),
    __metadata("design:type", String)
], User.prototype, "name", void 0);
__decorate([
    Index({ unique: true }),
    Column({ type: 'varchar', length: 180, name: 'email' }),
    IsEmail({}, { message: 'E-mail inválido.' }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    Column({ type: 'varchar', length: 120, select: false, name: 'password_hash' }),
    IsString(),
    Length(60, 120, { message: 'passwordHash deve conter um hash de 60 a 120 caracteres.' }),
    __metadata("design:type", String)
], User.prototype, "passwordHash", void 0);
__decorate([
    Column({ type: 'varchar', length: 20, nullable: true }),
    IsOptional(),
    Matches(/^\+?[0-9()\s-]{8,20}$/, { message: 'Telefone inválido.' }),
    __metadata("design:type", Object)
], User.prototype, "phone", void 0);
__decorate([
    Column({ type: 'simple-enum', enum: UserRole, default: UserRole.USER }),
    IsEnum(UserRole),
    __metadata("design:type", String)
], User.prototype, "role", void 0);
__decorate([
    OneToMany(() => Notification, (notification) => notification.user),
    __metadata("design:type", Array)
], User.prototype, "notifications", void 0);
__decorate([
    OneToMany(() => Item, (item) => item.createdByUser),
    __metadata("design:type", Array)
], User.prototype, "createdItems", void 0);
__decorate([
    OneToMany(() => LostReport, (report) => report.user),
    __metadata("design:type", Array)
], User.prototype, "lostReports", void 0);
__decorate([
    OneToMany(() => Handover, (handover) => handover.withdrawnUser),
    __metadata("design:type", Array)
], User.prototype, "handoversAsWithdrawer", void 0);
__decorate([
    OneToMany(() => Handover, (handover) => handover.admin),
    __metadata("design:type", Array)
], User.prototype, "handoversAsAdmin", void 0);
__decorate([
    OneToMany(() => DispositionRule, (rule) => rule.createdByUser),
    __metadata("design:type", Array)
], User.prototype, "dispositionRulesCreated", void 0);
__decorate([
    OneToMany(() => Disposition, (disposition) => disposition.admin),
    __metadata("design:type", Array)
], User.prototype, "dispositionsExecuted", void 0);
__decorate([
    CreateDateColumn({ type: 'datetime' }),
    __metadata("design:type", Date)
], User.prototype, "createdAt", void 0);
__decorate([
    UpdateDateColumn({ type: 'datetime' }),
    __metadata("design:type", Date)
], User.prototype, "updatedAt", void 0);
User = __decorate([
    Entity('users')
], User);
export { User };
