import { Category } from '../models/category.js';
import {
  CategoryRepository,
  type DeleteCategoryResult,
} from '../repository/category.repository.js';

export class CategoryService {
  constructor(private readonly repository = new CategoryRepository()) {}

  async list(): Promise<Category[]> {
    return this.repository.list();
  }

  async create(name: string): Promise<Category> {
    return this.repository.create(name);
  }

  async update(id: number, name: string): Promise<Category | null> {
    return this.repository.update(id, name);
  }

  async delete(id: number): Promise<DeleteCategoryResult> {
    return this.repository.deleteIfUnlinked(id);
  }
}
