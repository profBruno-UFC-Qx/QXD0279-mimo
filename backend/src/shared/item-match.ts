export interface MatchableItem {
  title: string;
  description: string | null;
  buildingId: number;
  foundLocation: string | null;
  foundDate: Date | string;
}

export interface MatchableLostReport {
  buildingId: number | null;
  description: string;
  lossDate: Date | string;
}

const stopWords = new Set([
  'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'na', 'nas',
  'no', 'nos', 'para', 'por', 'um', 'uma', 'uns', 'umas', 'objeto',
]);

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !stopWords.has(token)),
  );
}

function toDateKey(value: Date | string): number | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function dateProximityScore(foundDate: Date | string, lossDate: Date | string): number {
  const foundKey = toDateKey(foundDate);
  const lossKey = toDateKey(lossDate);
  if (foundKey === null || lossKey === null) return 0;

  const daysAfterLoss = (foundKey - lossKey) / (24 * 60 * 60 * 1000);
  if (daysAfterLoss < -7) return 0;
  if (daysAfterLoss <= 7) return 25;
  if (daysAfterLoss <= 30) return 20;
  if (daysAfterLoss <= 60) return 12;
  if (daysAfterLoss <= 180) return 5;
  return 0;
}

function tokensMatch(reportToken: string, itemTokens: Set<string>): boolean {
  if (itemTokens.has(reportToken)) return true;
  if (reportToken.length < 4) return false;
  for (const itemToken of itemTokens) {
    if (
      itemToken.length >= 4 &&
      (itemToken.startsWith(reportToken) ||
        reportToken.startsWith(itemToken) ||
        itemToken.includes(reportToken) ||
        reportToken.includes(itemToken) ||
        (reportToken.length >= 5 &&
          itemToken.length >= 5 &&
          reportToken.slice(0, 5) === itemToken.slice(0, 5)))
    ) {
      return true;
    }
  }
  return false;
}

function textSimilarityScore(
  itemText: string,
  reportText: string,
): number {
  const itemTokens = tokenize(itemText);
  const reportTokens = tokenize(reportText);
  if (itemTokens.size === 0 || reportTokens.size === 0) return 0;

  let matches = 0;
  for (const token of reportTokens) {
    if (tokensMatch(token, itemTokens)) matches++;
  }

  const coverage = matches / reportTokens.size;
  return Math.round(coverage * 50);
}

export function isRelevantItemMatch(
  item: MatchableItem,
  report: MatchableLostReport,
): boolean {
  const itemText = [
    item.title,
    item.description ?? '',
    item.foundLocation ?? '',
  ].join(' ');

  if (textSimilarityScore(itemText, report.description) > 0) {
    return true;
  }

  const foundKey = toDateKey(item.foundDate);
  const lossKey = toDateKey(report.lossDate);
  if (foundKey === null || lossKey === null) return false;

  const daysAfterLoss = (foundKey - lossKey) / (24 * 60 * 60 * 1000);
  if (daysAfterLoss < -3 || daysAfterLoss > 30) return false;

  if (report.buildingId !== null && item.buildingId !== report.buildingId) {
    return false;
  }

  return true;
}

export function getItemMatchScore(
  item: MatchableItem,
  report: MatchableLostReport,
): number {
  const buildingScore = report.buildingId === null || report.buildingId === item.buildingId ? 25 : 0;
  const dateScore = dateProximityScore(item.foundDate, report.lossDate);
  const itemText = [
    item.title,
    item.description ?? '',
    item.foundLocation ?? '',
  ].join(' ');

  return buildingScore
    + dateScore
    + textSimilarityScore(itemText, report.description);
}
