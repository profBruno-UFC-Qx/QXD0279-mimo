import { DispositionType } from './enums.js';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IsDate, IsEnum, IsInt, IsOptional, IsPositive, Matches } from 'class-validator';
import { Item } from './item.js';
import { User } from './user.js';

@Entity('dispositions')
export class Disposition {
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

  @ManyToOne(() => Item, (item) => item.dispositions)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ type: 'simple-enum', enum: DispositionType })
  @IsEnum(DispositionType)
  destination: DispositionType;

  @Column({ type: 'int', name: 'admin_id' })
  @IsInt()
  @IsPositive()
  adminId: number;

  @ManyToOne(() => User, (user) => user.dispositionsExecuted)
  @JoinColumn({ name: 'admin_id' })
  admin: User;

  @Column({ type: 'varchar', length: 18 })
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$|^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, {
    message: 'receiverDocument deve ser um CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00).',
  })
  receiverDocument: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP', name: 'executed_at' })
  @IsDate()
  executedAt: Date;
}
