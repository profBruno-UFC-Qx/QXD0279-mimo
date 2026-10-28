import { Building } from '../models/building.js';
import {
  BuildingRepository,
  type CreateBuildingData,
  type DeleteBuildingResult,
} from '../repository/building.repository.js';

export class BuildingService {
  constructor(private readonly repository = new BuildingRepository()) {}

  async create(data: CreateBuildingData): Promise<Building> {
    return this.repository.create(data);
  }

  async getById(id: number): Promise<Building | null> {
    return this.repository.getById(id);
  }

  async list(): Promise<Building[]> {
    return this.repository.list();
  }

  async update(id: number, data: Partial<CreateBuildingData>): Promise<Building | null> {
    if (!(await this.repository.getById(id))) return null;
    return this.repository.update(id, data);
  }

  async delete(id: number): Promise<DeleteBuildingResult> {
    return this.repository.deleteIfUnlinked(id);
  }
}
