import { AppDataSource } from '../data-source.js';
import { Item } from '../models/item.js';
import { DispositionRule } from '../models/disposition-rule.js';
import { ItemStatus } from '../models/enums.js';

export async function runDispositionEligibilityJob(): Promise<{ updatedCount: number }> {
  return await AppDataSource.transaction(async (manager) => {
    const itemRepo = manager.getRepository(Item);
    const ruleRepo = manager.getRepository(DispositionRule);

    const availableItems = await itemRepo.find({
      where: { status: ItemStatus.AVAILABLE },
    });

    const activeRules = await ruleRepo.find({
      where: { active: true },
      order: { days: 'DESC' },
    });

    if (availableItems.length === 0 || activeRules.length === 0) {
      return { updatedCount: 0 };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let updatedCount = 0;

    for (const item of availableItems) {
      const foundDate = new Date(item.foundDate);
      foundDate.setHours(0, 0, 0, 0);

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

      if (matchingRule) {
        item.status = ItemStatus.ELIGIBLE;
        item.plannedDestination = matchingRule.destination;
        await itemRepo.save(item);
        updatedCount++;
      }
    }

    return { updatedCount };
  });
}
