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

function dateProximityScore(first: Date | string, second: Date | string): number {
  const firstKey = toDateKey(first);
  const secondKey = toDateKey(second);
  if (firstKey === null || secondKey === null) return 0;

  const differenceDays = Math.abs(firstKey - secondKey) / (24 * 60 * 60 * 1000);
  if (differenceDays <= 7) return 35;
  if (differenceDays <= 30) return 28;
  if (differenceDays <= 60) return 18;
  if (differenceDays <= 180) return 8;
  return 0;
}

function textSimilarityScore(
  itemText: string,
  reportText: string,
): number {
  const itemTokens = tokenize(itemText);
  const reportTokens = tokenize(reportText);
  if (itemTokens.size === 0 || reportTokens.size === 0) return 0;

  let matches = 0;
  for (const token of itemTokens) {
    if (reportTokens.has(token)) matches++;
  }

  const diceSimilarity = (2 * matches) / (itemTokens.size + reportTokens.size);
  return Math.round(diceSimilarity * 40);
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
