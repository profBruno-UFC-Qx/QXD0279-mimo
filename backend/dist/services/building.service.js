import { Building } from '../models/building.js';
import { BuildingRepository } from '../repository/building.repository.js';
export class BuildingService {
    repository;
    constructor(repository = new BuildingRepository()) {
        this.repository = repository;
    }
    async create(data) {
        return this.repository.create(data);
    }
    async getById(id) {
        return this.repository.getById(id);
    }
}
