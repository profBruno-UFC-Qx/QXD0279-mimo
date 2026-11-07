import { DispositionRule } from '../models/disposition-rule.js';
import { UserRole } from '../models/enums.js';
import { HttpError } from '../middlewares/http-error.js';
import {
  DispositionRuleRepository,
  type CreateDispositionRuleData,
  type UpdateDispositionRuleData,
} from '../repository/disposition-rule.repository.js';

export type {
  CreateDispositionRuleData,
  UpdateDispositionRuleData,
} from '../repository/disposition-rule.repository.js';

export class DispositionRuleService {
  constructor(private readonly repository = new DispositionRuleRepository()) {}

  async list(active?: boolean): Promise<DispositionRule[]> {
    return this.repository.list(active);
  }

  async getById(id: number): Promise<DispositionRule | null> {
    return this.repository.getById(id);
  }

  async create(data: CreateDispositionRuleData, createdBy: number): Promise<DispositionRule> {
    return this.repository.create(data, createdBy);
  }

  async update(
    id: number,
    data: UpdateDispositionRuleData,
    role: UserRole.ADMIN | UserRole.SUPERADMIN,
  ): Promise<DispositionRule> {
    if (role === UserRole.ADMIN && Object.hasOwn(data, 'locked')) {
      throw new HttpError(403, 'ADMIN não pode alterar o campo locked.');
    }

    const result = await this.repository.update(id, data, role === UserRole.SUPERADMIN);
    if (result.type === 'not_found') throw new HttpError(404, 'A regra de destinação não foi encontrada.');
    if (result.type === 'locked') {
      throw new HttpError(403, 'ADMIN não pode alterar uma regra travada.');
    }
    if (result.type === 'conflict') {
      throw new HttpError(409, 'A regra foi alterada simultaneamente; atualize e tente novamente.');
    }
    return result.rule;
  }

  async remove(
    id: number,
    role: UserRole.ADMIN | UserRole.SUPERADMIN,
  ): Promise<void> {
    const result = await this.repository.remove(id, role === UserRole.SUPERADMIN);
    if (result === 'not_found') throw new HttpError(404, 'A regra de destinação não foi encontrada.');
    if (result === 'locked') throw new HttpError(403, 'ADMIN não pode excluir uma regra travada.');
    if (result === 'conflict') {
      throw new HttpError(409, 'A regra foi alterada simultaneamente; atualize e tente novamente.');
    }
  }
}
