import { AppDataSource } from '../data-source.js';
import { Building } from '../models/building.js';
import { Item } from '../models/item.js';
import { LostReport } from '../models/lost-report.js';

export interface CreateBuildingData {
  name: string;
  address: string;
  pickupPoint: string;
  serviceHours: string;
}

export type DeleteBuildingResult = 'deleted' | 'not_found' | 'linked';

export class BuildingRepository {
  async create(data: CreateBuildingData): Promise<Building> {
    const repository = AppDataSource.getRepository(Building);
    return repository.save(repository.create(data));
  }

  async getById(id: number): Promise<Building | null> {
    return AppDataSource.getRepository(Building).findOneBy({ id });
  }

  async list(): Promise<Building[]> {
    return AppDataSource.getRepository(Building).find({ order: { name: 'ASC' } });
  }

  async update(id: number, data: Partial<CreateBuildingData>): Promise<Building | null> {
    const repository = AppDataSource.getRepository(Building);
    await repository.update(id, data);
    return repository.findOneBy({ id });
  }

  async deleteIfUnlinked(id: number): Promise<DeleteBuildingResult> {
    return AppDataSource.transaction(async (manager) => {
      const buildings = manager.getRepository(Building);
      if (!(await buildings.findOneBy({ id }))) return 'not_found';

      const items = manager.getRepository(Item);
      const lostReports = manager.getRepository(LostReport);
      if ((await items.countBy({ buildingId: id })) > 0) return 'linked';
      if ((await lostReports.countBy({ buildingId: id })) > 0) return 'linked';

      const result = await buildings.delete({ id });
      return result.affected ? 'deleted' : 'not_found';
    });
  }
}
