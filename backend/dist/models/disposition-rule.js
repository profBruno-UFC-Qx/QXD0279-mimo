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
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, } from 'typeorm';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsPositive, Min } from 'class-validator';
import { User } from './user.js';
let DispositionRule = class DispositionRule {
    id;
    days;
    destination;
    active;
    locked;
    createdBy;
    createdByUser;
    createdAt;
    updatedAt;
};
__decorate([
    PrimaryGeneratedColumn('increment'),
    IsOptional(),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], DispositionRule.prototype, "id", void 0);
__decorate([
    Column({ type: 'int' }),
    IsInt(),
    Min(1, { message: 'days deve ser >= 1 (prazo contado de foundDate).' }),
    __metadata("design:type", Number)
], DispositionRule.prototype, "days", void 0);
__decorate([
    Column({ type: 'simple-enum', enum: DispositionType }),
    IsEnum(DispositionType),
    __metadata("design:type", String)
], DispositionRule.prototype, "destination", void 0);
__decorate([
    Column({ type: 'boolean', default: true }),
    IsBoolean(),
    __metadata("design:type", Boolean)
], DispositionRule.prototype, "active", void 0);
__decorate([
    Column({ type: 'boolean', default: false }),
    IsBoolean(),
    __metadata("design:type", Boolean)
], DispositionRule.prototype, "locked", void 0);
__decorate([
    Column({ type: 'int', name: 'created_by' }),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], DispositionRule.prototype, "createdBy", void 0);
__decorate([
    ManyToOne(() => User, (user) => user.dispositionRulesCreated),
    JoinColumn({ name: 'created_by' }),
    __metadata("design:type", User)
], DispositionRule.prototype, "createdByUser", void 0);
__decorate([
    CreateDateColumn({ type: 'datetime' }),
    __metadata("design:type", Date)
], DispositionRule.prototype, "createdAt", void 0);
__decorate([
    UpdateDateColumn({ type: 'datetime' }),
    __metadata("design:type", Date)
], DispositionRule.prototype, "updatedAt", void 0);
DispositionRule = __decorate([
    Index('IDX_disposition_rules_active', ['active']),
    Entity('disposition_rules')
], DispositionRule);
export { DispositionRule };
