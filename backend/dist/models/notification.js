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
import { IsDate, IsEnum, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { NotificationType } from './enums.js';
import { User } from './user.js';
let Notification = class Notification {
    id;
    userId;
    user;
    type;
    linkUrl;
    readAt;
    createdAt;
};
__decorate([
    PrimaryGeneratedColumn('increment'),
    IsOptional(),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], Notification.prototype, "id", void 0);
__decorate([
    Column({ type: 'int', name: 'user_id' }),
    IsInt(),
    IsPositive(),
    __metadata("design:type", Number)
], Notification.prototype, "userId", void 0);
__decorate([
    ManyToOne(() => User, (user) => user.notifications),
    JoinColumn({ name: 'user_id' }),
    __metadata("design:type", User)
], Notification.prototype, "user", void 0);
__decorate([
    Column({ type: 'simple-enum', enum: NotificationType }),
    IsEnum(NotificationType),
    __metadata("design:type", String)
], Notification.prototype, "type", void 0);
__decorate([
    Column({ type: 'varchar', length: 255 }),
    IsString(),
    IsNotEmpty(),
    MaxLength(255),
    __metadata("design:type", String)
], Notification.prototype, "linkUrl", void 0);
__decorate([
    Column({ type: 'datetime', nullable: true, name: 'read_at' }),
    IsOptional(),
    IsDate(),
    __metadata("design:type", Object)
], Notification.prototype, "readAt", void 0);
__decorate([
    CreateDateColumn({ type: 'datetime' }),
    __metadata("design:type", Date)
], Notification.prototype, "createdAt", void 0);
Notification = __decorate([
    Index('IDX_notifications_user_read', ['userId', 'readAt']),
    Entity('notifications')
], Notification);
export { Notification };
