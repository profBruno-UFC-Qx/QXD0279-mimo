import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { IsInt, IsOptional, IsPositive, IsString, Length } from 'class-validator';
import { Item } from './item.js';
import { LostReport } from './lost-report.js';

@Entity('buildings')
export class Building {
  @PrimaryGeneratedColumn('increment')
  @IsOptional() // O id é gerado pelo db, por isso está como optional
  @IsInt()
  @IsPositive()
  id: number;

  @Index({ unique: true }) // Garante que o nome do prédio seja único no db
  @Column({ type: 'varchar', length: 150 }) // descreve no schema do db
  @IsString()
  @Length(3, 150) // Valida no backe que o nome do prédio tenha entre 3 e 150 caracteres
  name: string;

  @Column({ type: 'varchar', length: 255 })
  @IsString()
  @Length(5, 255)
  address: string;

  @Column({ type: 'varchar', length: 200, name: 'pickup_point' })
  @IsString()
  @Length(3, 200)
  pickupPoint: string;

  @Column({ type: 'varchar', length: 200, name: 'service_hours' })
  @IsString()
  @Length(3, 200)
  serviceHours: string;

  @OneToMany(() => Item, (item) => item.building)
  items: Item[];

  @OneToMany(() => LostReport, (report) => report.building)
  lostReports: LostReport[];

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
