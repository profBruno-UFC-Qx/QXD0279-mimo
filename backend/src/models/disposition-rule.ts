import { DispositionType } from './enums.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsPositive, Min } from 'class-validator';
import { User } from './user.js';

@Index('IDX_disposition_rules_active', ['active'])
@Entity('disposition_rules')
export class DispositionRule {
  @PrimaryGeneratedColumn('increment')
  @IsOptional()
  @IsInt()
  @IsPositive()
  id: number;

  @Column({ type: 'int' })
  @IsInt()
  @Min(1, { message: 'days deve ser >= 1 (prazo contado de foundDate).' })
  days: number;

  @Column({ type: 'simple-enum', enum: DispositionType })
  @IsEnum(DispositionType)
  destination: DispositionType;

  @Column({ type: 'boolean', default: true })
  @IsBoolean()
  active: boolean;

  @Column({ type: 'boolean', default: false })
  @IsBoolean()
  locked: boolean;

  @Column({ type: 'int', name: 'created_by' })
  @IsInt()
  @IsPositive()
  createdBy: number;

  @ManyToOne(() => User, (user) => user.dispositionRulesCreated)
  @JoinColumn({ name: 'created_by' })
  createdByUser: User;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
