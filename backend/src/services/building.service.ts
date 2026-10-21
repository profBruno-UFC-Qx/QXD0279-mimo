import { Building } from '../models/building.js';
import { BuildingRepository, type CreateBuildingData } from '../repository/building.repository.js';

export class BuildingService {
  constructor(private readonly repository = new BuildingRepository()) {}

  async create(data: CreateBuildingData): Promise<Building> {
    return this.repository.create(data);
  }

  async getById(id: number): Promise<Building | null> {
    return this.repository.getById(id);
  }
}