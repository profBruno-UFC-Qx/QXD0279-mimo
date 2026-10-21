import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from './models/user.js';
import { Notification } from './models/notification.js';
import { Building } from './models/building.js';
import { Category } from './models/category.js';
import { Item } from './models/item.js';
import { ItemPhoto } from './models/item-photo.js';
import { LostReport } from './models/lost-report.js';
import { Handover } from './models/handover.js';
import { DispositionRule } from './models/disposition-rule.js';
import { Disposition } from './models/disposition.js';
// Configuração do DataSource do TypeORM para o banco de dados SQLite
export const AppDataSource = new DataSource({
    type: 'sqlite',
    database: process.env.SQLITE_DB_PATH ?? 'data/achadex.sqlite',
    entities: [
        User,
        Notification,
        Building,
        Category,
        Item,
        ItemPhoto,
        LostReport,
        Handover,
        DispositionRule,
        Disposition,
    ],
    synchronize: true,
    logging: false,
});
