import { AppDataSource } from '../data-source.js';
import { Building } from '../models/building.js';

export interface CreateBuildingData {
  name: string;
  address: string;
  pickupPoint: string;
  serviceHours: string;
}

export class BuildingRepository {
  async create(data: CreateBuildingData): Promise<Building> {
    const repository = AppDataSource.getRepository(Building);
    return repository.save(repository.create(data));
  }

  async getById(id: number): Promise<Building | null> {
    return AppDataSource.getRepository(Building).findOneBy({ id });
  }
}