import { LostReportStatus } from './enums.js';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn} from 'typeorm';
import { IsDate, IsEnum, IsInt, IsOptional, IsPositive, IsString, Length } from 'class-validator';
import { User } from './user.js';
import { Category } from './category.js';
import { Building } from './building.js';

@Index('IDX_lost_reports_status', ['status'])
@Entity('lost_reports')
export class LostReport {
  @PrimaryGeneratedColumn('increment')
  @IsOptional()
  @IsInt()
  @IsPositive()
  id: number;

  @Column({ type: 'int', name: 'user_id' })
  @IsInt()
  @IsPositive()
  userId: number;

  @ManyToOne(() => User, (user) => user.lostReports)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'int', name: 'category_id' })
  @IsInt()
  @IsPositive()
  categoryId: number;

  @ManyToOne(() => Category, (category) => category.lostReports)
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ type: 'int', nullable: true, name: 'building_id' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  buildingId: number | null;

  @ManyToOne(() => Building, (building) => building.lostReports, { nullable: true })
  @JoinColumn({ name: 'building_id' })
  building: Building | null;

  @Column({ type: 'text' })
  @IsString()
  @Length(10, 2000, { message: 'description deve ter entre 10 e 2000 caracteres.' })
  description: string;

  @Column({ type: 'date', name: 'loss_date' })
  @IsDate()
  lossDate: Date;

  @Column({ type: 'simple-enum', enum: LostReportStatus, default: LostReportStatus.OPEN })
  @IsEnum(LostReportStatus)
  status: LostReportStatus;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
