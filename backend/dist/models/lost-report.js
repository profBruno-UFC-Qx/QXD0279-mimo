var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { LostReportStatus } from './enums.js';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, } from 'typeorm';
import { IsDate, IsEnum, IsInt, IsOptional, IsPositive, IsString, Length } from 'class-validator';
import { User } from './user.js';
import { Category } from './category.js';
import { Building } from './building.js';
let LostReport = class LostReport {
    id;
    userId;
    user;
    categoryId;
    category;
    buildingId;
    building;
    description;
    lossDate;
    status;
    createdAt;
};
__decorate([
    PrimaryGeneratedColumn('increment'),
    IsOptional(),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], LostReport.prototype, "id", void 0);
__decorate([
    Column({ type: 'int', name: 'user_id' }),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], LostReport.prototype, "userId", void 0);
__decorate([
    ManyToOne(() => User, (user) => user.lostReports),
    JoinColumn({ name: 'user_id' }),
    __metadata("design:type", User)
], LostReport.prototype, "user", void 0);
__decorate([
    Column({ type: 'int', name: 'category_id' }),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], LostReport.prototype, "categoryId", void 0);
__decorate([
    ManyToOne(() => Category, (category) => category.lostReports),
    JoinColumn({ name: 'category_id' }),
    __metadata("design:type", Category)
], LostReport.prototype, "category", void 0);
__decorate([
    Column({ type: 'int', nullable: true, name: 'building_id' }),
    IsOptional(),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Object)
], LostReport.prototype, "buildingId", void 0);
__decorate([
    ManyToOne(() => Building, (building) => building.lostReports, { nullable: true }),
    JoinColumn({ name: 'building_id' }),
    __metadata("design:type", Object)
], LostReport.prototype, "building", void 0);
__decorate([
    Column({ type: 'text' }),
    IsString(),
    Length(10, 2000, { message: 'description deve ter entre 10 e 2000 caracteres.' }),
    __metadata("design:type", String)
], LostReport.prototype, "description", void 0);
__decorate([
    Column({ type: 'date', name: 'loss_date' }),
    IsDate(),
    __metadata("design:type", Date)
], LostReport.prototype, "lossDate", void 0);
__decorate([
    Column({ type: 'simple-enum', enum: LostReportStatus, default: LostReportStatus.OPEN }),
    IsEnum(LostReportStatus),
    __metadata("design:type", String)
], LostReport.prototype, "status", void 0);
__decorate([
    CreateDateColumn({ type: 'datetime' }),
    __metadata("design:type", Date)
], LostReport.prototype, "createdAt", void 0);
LostReport = __decorate([
    Index('IDX_lost_reports_status', ['status']),
    Entity('lost_reports')
], LostReport);
export { LostReport };
