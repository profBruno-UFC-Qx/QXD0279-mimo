import { AppDataSource } from '../data-source.js';
import { DispositionRule } from '../models/disposition-rule.js';
import { DispositionType } from '../models/enums.js';
import { Not, type FindOptionsWhere } from 'typeorm';

export interface CreateDispositionRuleData {
  days: number;
  destination: DispositionType;
}

export interface UpdateDispositionRuleData {
  days?: number;
  destination?: DispositionType;
  active?: boolean;
  locked?: boolean;
}

export type CreateDispositionRuleResult =
  | { type: 'created'; rule: DispositionRule }
  | { type: 'duplicate_days' }
  | { type: 'duplicate_destination' };

export type UpdateDispositionRuleResult =
  | { type: 'updated'; rule: DispositionRule }
  | { type: 'not_found' }
  | { type: 'locked' }
  | { type: 'conflict' }
  | { type: 'duplicate_days' }
  | { type: 'duplicate_destination' };

export type RemoveDispositionRuleResult = 'removed' | 'not_found' | 'locked' | 'conflict';

let dispositionRuleTxQueue: Promise<void> = Promise.resolve();

function serializeDispositionRuleTransaction<T>(work: () => Promise<T>): Promise<T> {
  const run = dispositionRuleTxQueue.then(work, work);
  dispositionRuleTxQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export class DispositionRuleRepository {
  async list(active?: boolean): Promise<DispositionRule[]> {
    const where: FindOptionsWhere<DispositionRule> =
      active === undefined ? {} : { active };
    return AppDataSource.getRepository(DispositionRule).find({
      where,
      order: { days: 'ASC', id: 'ASC' },
    });
  }

  async getById(id: number): Promise<DispositionRule | null> {
    return AppDataSource.getRepository(DispositionRule).findOneBy({ id });
  }

  async create(data: CreateDispositionRuleData, createdBy: number): Promise<CreateDispositionRuleResult> {
    return serializeDispositionRuleTransaction(() =>
      AppDataSource.transaction(async (manager) => {
        const repository = manager.getRepository(DispositionRule);
        if (await repository.findOneBy({ days: data.days })) {
          return { type: 'duplicate_days' };
        }
        if (await repository.findOneBy({ destination: data.destination })) {
          return { type: 'duplicate_destination' };
        }

        const rule = await repository.save(repository.create({
          days: data.days,
          destination: data.destination,
          active: true,
          locked: false,
          createdBy,
        }));
        return { type: 'created', rule };
      }),
    );
  }

  async update(
    id: number,
    data: UpdateDispositionRuleData,
    canEditLocked: boolean,
  ): Promise<UpdateDispositionRuleResult> {
    return serializeDispositionRuleTransaction(() =>
      AppDataSource.transaction(async (manager) => {
        const repository = manager.getRepository(DispositionRule);
        const current = await repository.findOneBy({ id });
        if (!current) return { type: 'not_found' };
        if (!canEditLocked && current.locked) return { type: 'locked' };

        if (data.days !== undefined) {
          if (await repository.findOneBy({ days: data.days, id: Not(id) })) {
            return { type: 'duplicate_days' };
          }
        }
        if (data.destination !== undefined) {
          if (await repository.findOneBy({ destination: data.destination, id: Not(id) })) {
            return { type: 'duplicate_destination' };
          }
        }

        const result = await repository.update(
          canEditLocked ? { id } : { id, locked: false },
          data,
        );

        if (result.affected === 1) {
          const rule = await repository.findOneBy({ id });
          return rule ? { type: 'updated', rule } : { type: 'not_found' };
        }

        const fresh = await repository.findOneBy({ id });
        if (!fresh) return { type: 'not_found' };
        if (!canEditLocked && fresh.locked) return { type: 'locked' };
        return { type: 'conflict' };
      }),
    );
  }

  async remove(id: number, canEditLocked: boolean): Promise<RemoveDispositionRuleResult> {
    const repository = AppDataSource.getRepository(DispositionRule);
    const result = await repository.delete(canEditLocked ? { id } : { id, locked: false });
    if (result.affected === 1) return 'removed';

    const current = await repository.findOneBy({ id });
    if (!current) return 'not_found';
    if (!canEditLocked && current.locked) return 'locked';
    return 'conflict';
  }
}
