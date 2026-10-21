import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { IsDate, IsInt, IsOptional, IsPositive, IsString, Length, Matches } from 'class-validator';
import { Item } from './item.js';
import { User } from './user.js';

@Entity('handovers')
export class Handover {
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

  @ManyToOne(() => Item, (item) => item.handovers)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ type: 'varchar', length: 150 })
  @IsString()
  @Length(3, 150)
  withdrawnName: string;

  @Column({ type: 'varchar', length: 14 })
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, {
    message: 'withdrawnCpf inválido (formatos aceitos: 000.000.000-00 ou 00000000000).',
  })
  withdrawnCpf: string;

  @Column({ type: 'int', nullable: true, name: 'withdrawn_user_id' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  withdrawnUserId: number | null;

  @ManyToOne(() => User, (user) => user.handoversAsWithdrawer, { nullable: true })
  @JoinColumn({ name: 'withdrawn_user_id' })
  withdrawnUser: User | null;

  @Column({ type: 'int', name: 'admin_id' })
  @IsInt()
  @IsPositive()
  adminId: number;

  @ManyToOne(() => User, (user) => user.handoversAsAdmin)
  @JoinColumn({ name: 'admin_id' })
  admin: User;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP', name: 'handed_at' })
  @IsDate()
  handedAt: Date;
}
