import type { OutcomeTemplate, TemplateKeywordType } from './hl';

/**
 * Humanized presentation for every template in the registry. Users never see
 * {placeholder} syntax. Curated for all known standalone ids; unknown future
 * ids get a sensible generic fallback.
 */

const FRIENDLY: Record<string, { name: string; hint: string }> = {
  binaryPrice: { name: 'Price target', hint: 'mark price · free-text threshold' },
  binaryPrice2: { name: 'Price target', hint: 'mark price · numeric threshold' },
  binaryPrice3: { name: 'Price target', hint: 'candle close at settlement' },
  binaryPrice4: { name: 'Price target · averaged', hint: 'TWAP over a window · resists wicks' },
  binaryPrice5: { name: 'Price target', hint: 'newest variant' },
  priceTouch2: { name: 'Price touch', hint: 'newest variant' },
  scalePrice2: { name: 'Price range', hint: 'newest variant' },
  priceTouch: { name: 'Price touch', hint: 'resolves the moment a level trades' },
  scalePrice: { name: 'Price range', hint: 'linear payout between a low and a high' },
  sportsContestWinner: { name: 'Match winner', hint: 'full participant names' },
  sportsContestWinner2: { name: 'Match winner', hint: 'legacy variant' },
  sportsContestWinner3: { name: 'Match winner', hint: 'with ticker-style short names' },
  sportsScalarMarket: { name: 'Over / under', hint: 'any verifiable number · linear payout' },
};

export function friendlyName(t: OutcomeTemplate): string {
  return FRIENDLY[t.id]?.name ?? t.id.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
}

export function friendlyHint(t: OutcomeTemplate): string {
  return FRIENDLY[t.id]?.hint ?? `${t.keywords.length} inputs`;
}

/** Example values per keyword, keyword name first, then type fallback. */
const EXAMPLE_BY_KEYWORD: Record<string, string> = {
  perp: 'BTC',
  threshold: '80,000',
  target: '80,000',
  low: '70,000',
  high: '90,000',
  time: 'Sep 1, 12:00 UTC',
  seconds: '60',
  priceDescription: 'the mark price',
  competition: 'Premier League',
  stage: 'Final',
  participantA: 'Arsenal',
  participantB: 'Chelsea',
  participant: 'Arsenal',
  sport: 'football',
  season: '2026/27',
  contestType: 'match',
  officialSource: 'premierleague.com',
  scheduledStart: 'Sep 1, 15:00 UTC',
  resolutionDeadline: 'Sep 2, 12:00 UTC',
  shortNameA: 'ARS',
  shortNameB: 'CHE',
  measure: 'total goals scored',
  institution: 'Federal Reserve',
  decisionLabel: 'September 2026',
  policyMeasure: 'federal funds target rate',
  decisionDeadline: 'Sep 18, 20:00 UTC',
  scheduledDecision: 'Sep 18, 18:00 UTC',
};

function exampleValue(keyword: string, type: TemplateKeywordType): string {
  if (EXAMPLE_BY_KEYWORD[keyword]) return EXAMPLE_BY_KEYWORD[keyword];
  if (type === 'hlPerp') return 'BTC';
  if (type === 'dateTime') return 'Sep 1, 12:00 UTC';
  if (type === 'uInt') return '60';
  if (type === 'uDecimal') return '80,000';
  if (type === 'shortString') return 'ABC';
  return '…';
}

/** Render a template's question with example fills — no {braces} visible. */
export function exampleQuestion(t: OutcomeTemplate): string {
  return t.name.replace(/\{(\w+)\}/g, (_, k: string) => {
    const kw = t.keywords.find(([key]) => key === k);
    return exampleValue(k, kw?.[1] ?? 'string');
  });
}

/** Human labels for wizard fields. */
const LABELS: Record<string, string> = {
  perp: 'Asset',
  threshold: 'Target price (USD)',
  target: 'Touch price (USD)',
  time: 'Settlement time',
  seconds: 'Averaging window (seconds)',
  priceDescription: 'Price wording',
  low: 'Range low',
  high: 'Range high',
  competition: 'Competition',
  stage: 'Stage',
  participantA: 'Participant A',
  participantB: 'Participant B',
  sport: 'Sport',
  season: 'Season',
  contestType: 'Contest type',
  officialSource: 'Official source',
  scheduledStart: 'Scheduled start',
  resolutionDeadline: 'Resolution deadline',
  shortNameA: 'Short name A',
  shortNameB: 'Short name B',
  measure: 'What is measured',
};

export function fieldLabel(keyword: string, type: TemplateKeywordType): string {
  if (LABELS[keyword]) return LABELS[keyword];
  const spaced = keyword.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1) + (type === 'uDecimal' ? ' (number)' : '');
}

const HELP: Record<string, string> = {
  time: 'Your local time · stored and settled in UTC',
  scheduledStart: 'Your local time · stored in UTC',
  resolutionDeadline: 'Latest moment you will post the result · stored in UTC',
  decisionDeadline: 'Latest moment you will post the result · stored in UTC',
  scheduledDecision: 'Your local time · stored in UTC',
  priceDescription: 'Appears in the market description, e.g. "the mark price"',
  seconds: 'Settlement averages the price over this window',
  officialSource: 'Where anyone can verify the result, e.g. a league website',
  contestType: 'e.g. match, race, series',
  measure: 'A number anyone can verify, e.g. "total goals scored"',
  shortNameA: 'Up to 6 characters, shown on tickers',
  shortNameB: 'Up to 6 characters, shown on tickers',
};

export function fieldHelp(keyword: string, type: TemplateKeywordType): string | null {
  if (HELP[keyword]) return HELP[keyword];
  if (type === 'dateTime') return 'Your local time · stored as UTC';
  return null;
}

/**
 * Display order for wizard fields (registry order is alphabetical, which
 * reads wrong). Unlisted keywords keep registry order after listed ones.
 * Encoding order is unaffected: buildRegisterAction re-sorts lexicographically.
 */
const FIELD_ORDER = [
  'perp',
  'participantA',
  'participantB',
  'shortNameA',
  'shortNameB',
  'sport',
  'competition',
  'season',
  'stage',
  'contestType',
  'measure',
  'threshold',
  'target',
  'low',
  'high',
  'seconds',
  'priceDescription',
  'time',
  'scheduledStart',
  'resolutionDeadline',
  'officialSource',
];

export function orderedKeywords(
  keywords: [string, TemplateKeywordType][]
): [string, TemplateKeywordType][] {
  return [...keywords].sort((a, b) => {
    const ia = FIELD_ORDER.indexOf(a[0]);
    const ib = FIELD_ORDER.indexOf(b[0]);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

/** Side names with {placeholders} resolved via example fills (for gallery). */
export function resolveSides(t: OutcomeTemplate): [string, string] {
  const sides = t.role.standaloneOutcome?.sideNames ?? ['Yes', 'No'];
  const resolve = (side: string) =>
    side.replace(/\{(\w+)\}/g, (_, k: string) => {
      const kw = t.keywords.find(([key]) => key === k);
      return exampleValue(k, kw?.[1] ?? 'string');
    });
  return [resolve(sides[0]), resolve(sides[1])];
}

/** Family label for a template: informative, not decorative. */
export function familyKind(id: string): string {
  if (id.toLowerCase().includes('scalar')) return 'numbers';
  if (id.startsWith('sports')) return 'sports';
  return 'price';
}

/** Validation per keyword type. Returns an error string or null. */
export function validateField(value: string, type: TemplateKeywordType): string | null {
  if (!value) return null; // emptiness handled by completeness check
  if (type === 'uDecimal' && !/^\d+(\.\d+)?$/.test(value.replace(/,/g, '')))
    return 'Plain positive number, e.g. 80000';
  if (type === 'uInt' && !/^\d+$/.test(value)) return 'Whole number, e.g. 60';
  if (type === 'shortString' && value.length > 6) return 'Max 6 characters';
  return null;
}

/** Normalize a value before encoding into the action (strip commas etc). */
export function normalizeValue(value: string, type: TemplateKeywordType): string {
  if (type === 'uDecimal') return value.replace(/,/g, '');
  return value.trim();
}
