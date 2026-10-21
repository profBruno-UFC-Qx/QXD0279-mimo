import {Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn} from 'typeorm';
import { IsDate, IsEnum, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { NotificationType } from './enums.js';
import { User } from './user.js';

@Index('IDX_notifications_user_read', ['userId', 'readAt'])
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('increment')
  @IsOptional()
  @IsInt()
  @IsPositive()
  id: number;

  @Column({ type: 'int', name: 'user_id' })
  @IsInt()
  @IsPositive()
  userId: number;

  @ManyToOne(() => User, (user) => user.notifications)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'simple-enum', enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  linkUrl: string;

  @Column({ type: 'datetime', nullable: true, name: 'read_at' })
  @IsOptional()
  @IsDate()
  readAt: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}