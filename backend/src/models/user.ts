import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn} from 'typeorm';
import { IsEmail,IsEnum, IsInt, IsOptional, IsPositive, IsString, Length, Matches } from 'class-validator';
import { UserRole } from './enums.js';
import { Notification } from './notification.js';
import { Item } from './item.js';
import { LostReport } from './lost-report.js';
import { Handover } from './handover.js';
import { DispositionRule } from './disposition-rule.js';
import { Disposition } from './disposition.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('increment')
  @IsOptional()
  @IsInt()
  @IsPositive()
  id: number;

  @Column({ type: 'varchar', length: 150, name: 'name' })
  @IsString()
  @Length(3, 150)
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 180, name: 'email' })
  @IsEmail({}, { message: 'E-mail inválido.' })
  email: string;

  @Column({ type: 'varchar', length: 120, select: false, name: 'password_hash' })
  @IsString()
  @Length(60, 120, { message: 'passwordHash deve conter um hash de 60 a 120 caracteres.' })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  @IsOptional()
  @Matches(/^\+?[0-9()\s-]{8,20}$/, { message: 'Telefone inválido.' })
  phone: string | null;

  @Column({ type: 'simple-enum', enum: UserRole, default: UserRole.USER })
  @IsEnum(UserRole)
  role: UserRole;

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications: Notification[];

  @OneToMany(() => Item, (item) => item.createdByUser)
  createdItems: Item[];

  @OneToMany(() => LostReport, (report) => report.user)
  lostReports: LostReport[];

  @OneToMany(() => Handover, (handover) => handover.withdrawnUser)
  handoversAsWithdrawer: Handover[];

  @OneToMany(() => Handover, (handover) => handover.admin)
  handoversAsAdmin: Handover[];

  @OneToMany(() => DispositionRule, (rule) => rule.createdByUser)
  dispositionRulesCreated: DispositionRule[];

  @OneToMany(() => Disposition, (disposition) => disposition.admin)
  dispositionsExecuted: Disposition[];

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
