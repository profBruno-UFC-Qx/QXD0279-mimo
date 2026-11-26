import { In } from 'typeorm';
import { AppDataSource } from '../data-source.js';
import { Item } from '../models/item.js';
import { DispositionRule } from '../models/disposition-rule.js';
import { ItemStatus } from '../models/enums.js';

function parseLocalMidnight(value: Date | string): Date {
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) {
      const [, year, month, day] = match;
      return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
    }
  }
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export async function runDispositionEligibilityJob(): Promise<{ updatedCount: number }> {
  return await AppDataSource.transaction(async (manager) => {
    const itemRepo = manager.getRepository(Item);
    const ruleRepo = manager.getRepository(DispositionRule);

    const candidateItems = await itemRepo.find({
      where: { status: In([ItemStatus.AVAILABLE, ItemStatus.ELIGIBLE]) },
    });

    const activeRules = await ruleRepo.find({
      where: { active: true },
      order: { days: 'DESC' },
    });

    if (candidateItems.length === 0 || activeRules.length === 0) {
      return { updatedCount: 0 };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let updatedCount = 0;

    for (const item of candidateItems) {
      const foundDate = parseLocalMidnight(item.foundDate);

      const diffTime = today.getTime() - foundDate.getTime();
      const daysElapsed = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

      // Encontrar a regra aplicável de maior prazo cumprido (days)
      let matchingRule: DispositionRule | null = null;
      for (const rule of activeRules) {
        if (daysElapsed >= rule.days) {
          matchingRule = rule; // Como activeRules está ordenado por days DESC, a primeira que atende é a maior
          break;
        }
      }

      if (
        matchingRule &&
        (item.status !== ItemStatus.ELIGIBLE || item.plannedDestination !== matchingRule.destination)
      ) {
        item.status = ItemStatus.ELIGIBLE;
        item.plannedDestination = matchingRule.destination;
        await itemRepo.save(item);
        updatedCount++;
      }
    }

    return { updatedCount };
  });
}
