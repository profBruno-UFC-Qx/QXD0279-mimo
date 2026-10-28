import { AppDataSource } from '../data-source.js';
import { Category } from '../models/category.js';
import { Item } from '../models/item.js';
import { LostReport } from '../models/lost-report.js';

export type DeleteCategoryResult = 'deleted' | 'not_found' | 'linked';

export class CategoryRepository {
  async list(): Promise<Category[]> {
    return AppDataSource.getRepository(Category).find({ order: { name: 'ASC' } });
  }

  async create(name: string): Promise<Category> {
    const repository = AppDataSource.getRepository(Category);
    return repository.save(repository.create({ name }));
  }

  async update(id: number, name: string): Promise<Category | null> {
    const repository = AppDataSource.getRepository(Category);
    await repository.update(id, { name });
    return repository.findOneBy({ id });
  }

  async deleteIfUnlinked(id: number): Promise<DeleteCategoryResult> {
    return AppDataSource.transaction(async (manager) => {
      const categories = manager.getRepository(Category);
      if (!(await categories.existsBy({ id }))) return 'not_found';

      if (await manager.getRepository(Item).existsBy({ categoryId: id })) return 'linked';
      if (await manager.getRepository(LostReport).existsBy({ categoryId: id })) return 'linked';

      const result = await categories.delete({ id });
      return result.affected ? 'deleted' : 'not_found';
    });
  }
}
