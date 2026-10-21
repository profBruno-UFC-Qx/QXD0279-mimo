import { AppDataSource } from '../data-source.js';
import { Building } from '../models/building.js';
export class BuildingRepository {
    async create(data) {
        const repository = AppDataSource.getRepository(Building);
        return repository.save(repository.create(data));
    }
    async getById(id) {
        return AppDataSource.getRepository(Building).findOneBy({ id });
    }
}
