import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IsInt, IsOptional, IsPositive, IsString, Length } from 'class-validator';
import { Item } from './item.js';

@Entity('item_photos')
export class ItemPhoto {
  @PrimaryGeneratedColumn('increment')
  @IsOptional()
  @IsInt()
  @IsPositive()
  id: number;

  @Index()
  @Column({ type: 'int', name: 'item_id' })
  @IsInt()
  @IsPositive()
  itemId: number;

  @ManyToOne(() => Item, (item) => item.photos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ type: 'varchar', length: 500 })
  @IsString()
  @Length(1, 500)
  url: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
