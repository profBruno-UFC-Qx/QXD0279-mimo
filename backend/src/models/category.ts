import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { IsInt, IsOptional, IsPositive, IsString, Length } from 'class-validator';
import { Item } from './item.js';
import { LostReport } from './lost-report.js';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('increment')
  @IsOptional()
  @IsInt()
  @IsPositive()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  @IsString()
  @Length(2, 100)
  name: string;

  @OneToMany(() => Item, (item) => item.category)
  items: Item[];

  @OneToMany(() => LostReport, (report) => report.category)
  lostReports: LostReport[];

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
