import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, IsPositive, Length, MaxLength } from 'class-validator';
import { DispositionType, ItemStatus } from './enums.js';
import { Category } from './category.js';
import { Building } from './building.js';
import { User } from './user.js';
import { ItemPhoto } from './item-photo.js';
import { Handover } from './handover.js';
import { Disposition } from './disposition.js';

@Index('IDX_items_status_foundeddate', ['status', 'foundDate'])
@Entity('items')
export class Item {
  @PrimaryGeneratedColumn('increment')
  @IsOptional()
  @IsInt()
  @IsPositive()
  id: number;

  @Column({ type: 'varchar', length: 150 })
  @IsString()
  @Length(3, 150)
  title: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description: string | null;

  @Column({ type: 'int', name: 'category_id' })
  @IsInt()
  @IsPositive()
  categoryId: number;

  @ManyToOne(() => Category, (category) => category.items)
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ type: 'int', name: 'building_id' })
  @IsInt()
  @IsPositive()
  buildingId: number;

  @ManyToOne(() => Building, (building) => building.items)
  @JoinColumn({ name: 'building_id' })
  building: Building;

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'found_location' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  foundLocation: string | null;

  @Column({ type: 'date', name: 'found_date' })
  @IsDate()
  foundDate: Date;

  @Column({ type: 'simple-enum', enum: ItemStatus, default: ItemStatus.AVAILABLE })
  @IsEnum(ItemStatus)
  status: ItemStatus;

  @Column({ type: 'simple-enum', enum: DispositionType, nullable: true, name: 'planned_destination' })
  @IsOptional()
  @IsEnum(DispositionType)
  plannedDestination: DispositionType | null;

  @Column({ type: 'int', name: 'created_by' })
  @IsInt()
  @IsPositive()
  createdBy: number;

  @ManyToOne(() => User, (user) => user.createdItems)
  @JoinColumn({ name: 'created_by' })
  createdByUser: User;

  @OneToMany(() => ItemPhoto, (photo) => photo.item)
  photos: ItemPhoto[];

  @OneToMany(() => Handover, (handover) => handover.item)
  handovers: Handover[];

  @OneToMany(() => Disposition, (disposition) => disposition.item)
  dispositions: Disposition[];

  @CreateDateColumn({ type: 'datetime', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', name: 'updated_at' })
  updatedAt: Date;
}
