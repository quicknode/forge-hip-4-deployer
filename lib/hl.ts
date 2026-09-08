import { actionHash, AGENT_TYPES, L1_DOMAIN, splitSig } from './sign';

/**
 * A typed-data signer: wagmi's signTypedDataAsync matches this shape, so the
 * connected wallet (RainbowKit) does all signing.
 */
export type SignTypedDataFn = (args: {
  domain: typeof L1_DOMAIN;
  types: typeof AGENT_TYPES;
  primaryType: 'Agent';
  message: { source: string; connectionId: `0x${string}` };
}) => Promise<string>;

/**
 * Hyperliquid testnet client. Info reads go through our /api/info proxy
 * (which routes them to the Quicknode testnet endpoint server-side).
 * Exchange sends go to the public testnet API directly from the browser:
 * the signed payload is public information, the key never leaves the page.
 */

const TESTNET_EXCHANGE = 'https://api.hyperliquid-testnet.xyz/exchange';

export type TemplateKeywordType = 'hlPerp' | 'string' | 'dateTime' | 'uDecimal' | 'uInt' | 'shortString' | (string & {});

export type OutcomeTemplate = {
  id: string;
  role: {
    standaloneOutcome?: { sideNames: [string, string] };
    question?: unknown;
    questionOutcome?: unknown;
  };
  name: string;
  description: string;
  keywords: [string, TemplateKeywordType][];
};

export type OutcomeMetaEntry = {
  outcome: number;
  name: string;
  description: string;
  sideSpecs: { name: string }[];
  quoteToken: string;
  venue?: string;
  deployerFeeScale?: string;
};

export async function fetchInfo<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`info ${payload.type}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const fetchTemplates = () => fetchInfo<OutcomeTemplate[]>({ type: 'outcomeTemplates' });
export type DeployerEntry = { deployer: string; venue: string; subDeployers: string[] };

export type WalletReadiness = {
  exists: boolean;
  spotHype: number;
  stakedHype: number; // delegated + undelegated
};

export async function fetchWalletReadiness(user: string): Promise<WalletReadiness> {
  const [spot, staking] = await Promise.all([
    fetchInfo<{ balances: Array<{ coin: string; total: string }> }>({
      type: 'spotClearinghouseState',
      user,
    }),
    fetchInfo<{ delegated: string; undelegated: string }>({ type: 'delegatorSummary', user }),
  ]);
  const balances = spot.balances ?? [];
  const hype = balances.find((b) => b.coin === 'HYPE');
  const spotHype = hype ? Number(hype.total) : 0;
  const stakedHype = Number(staking.delegated ?? 0) + Number(staking.undelegated ?? 0);
  return {
    exists: balances.length > 0 || spotHype > 0 || stakedHype > 0,
    spotHype,
    stakedHype,
  };
}

export type ExtraAgent = { name: string; address: string; validUntil: number };
export const fetchExtraAgents = (user: string) =>
  fetchInfo<ExtraAgent[]>({ type: 'extraAgents', user });

export const fetchOutcomeMeta = () =>
  fetchInfo<{ outcomes: OutcomeMetaEntry[]; deployers?: DeployerEntry[] }>({ type: 'outcomeMeta' });

/**
 * Deploy action: instantiate a standalone-outcome template. Field order
 * mirrors the protocol struct (type, venue, operation) — the signature is
 * over the MessagePack bytes, so order is part of the hash.
 */
export function buildRegisterAction(
  venue: string,
  templateId: string,
  keywordToValue: [string, string][],
  deployerFeeScale = '0'
) {
  return {
    type: 'outcomeDeploy',
    venue: venue.trim().toLowerCase(),
    operation: {
      registerStandaloneOutcomeFromTemplate: {
        id: templateId,
        // sorted lexicographically by keyword (byte order, not locale)
        keywordToValue: [...keywordToValue].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
        deployerFeeScale,
      },
    },
  };
}

/** Settlement action for a standalone outcome. settleFraction "1" = YES wins. */
/**
 * Settle action. `details` must be the empty string (the exchange refuses
 * anything else) and nameAndDescription/sideNames must echo the outcome's
 * RAW on-chain values, not display-rendered ones.
 */
export function buildSettleAction(
  venue: string,
  outcome: number,
  settleFraction: '0' | '1',
  nameAndDescription: [string, string],
  sideNames: [string, string]
) {
  return {
    type: 'outcomeDeploy',
    venue: venue.trim().toLowerCase(),
    operation: {
      settleOutcome: { outcome, settleFraction, details: '', nameAndDescription, sideNames },
    },
  };
}

export type ExchangeResult = { ok: boolean; status: number; body: unknown };

export async function sendExchange(sign: SignTypedDataFn, action: unknown): Promise<ExchangeResult> {
  const nonce = Date.now();
  const hash = actionHash(action, nonce) as `0x${string}`;
  const rawSig = await sign({
    domain: L1_DOMAIN,
    types: AGENT_TYPES,
    primaryType: 'Agent',
    message: { source: 'b', connectionId: hash }, // "b" = testnet
  });
  const signature = splitSig(rawSig);
  const res = await fetch(TESTNET_EXCHANGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature }),
  });
  let body: unknown;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  const ok =
    res.ok && !(typeof body === 'object' && body !== null && (body as { status?: string }).status === 'err');
  return { ok, status: res.status, body };
}

/** Strip junk artifacts from on-chain labels (test markets, raw braces). */
export function cleanLabel(s: string): string {
  return s.replace(/^template:/i, '').replace(/[{}]/g, '').trim();
}

/** Category from the machine metadata tail, else a name heuristic. */
export function marketCategory(o: OutcomeMetaEntry): string {
  const m = o.description.match(/metadata=category:(\w+)/);
  if (m) return m[1].toLowerCase();
  if (/\b(above|below|touches|from [\d,.]+ to)\b/i.test(o.name)) return 'price';
  return 'other';
}

/** Descriptions sometimes carry a machine "metadata=..." tail; drop it. */
export function cleanDescription(s: string): string {
  return s.replace(/\s*metadata=\S+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Testnet is full of throwaway markets named "template:..." with unfilled
 * {placeholder} sides. Hide them from the default board view.
 */
export function isJunkMarket(o: OutcomeMetaEntry): boolean {
  const fields = [o.name, o.description, ...o.sideSpecs.map((x) => x.name)];
  return (
    !o.name ||
    /^template:/i.test(o.name) ||
    fields.some((f) => f.includes('{') || f.includes('}'))
  );
}

/** Real question, or a leftover test deployment? Used to rank the board. */
export function isLowQuality(o: OutcomeMetaEntry): boolean {
  return /^(recurring|fallback|template|test)\b/i.test(o.name.trim()) || o.description.trim().length < 20;
}

/** Render a template's {keyword} name with current form values. */
export type HydratedOutcome = OutcomeMetaEntry & {
  /** settlement time if the market carries one; null = undated */
  timeMs: number | null;
  fromTemplate?: string;
  /** the exchange's stored values, needed verbatim for settlement */
  rawName: string;
  rawDescription: string;
  rawSideNames: [string, string];
};

/** "k:v|k:v" template-value payloads (how the exchange stores from-template deploys). */
function parseKeywordValues(desc: string): Record<string, string> | null {
  if (!desc || !desc.includes(':')) return null;
  const out: Record<string, string> = {};
  for (const part of desc.split('|')) {
    const i = part.indexOf(':');
    if (i <= 0) return null;
    out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

/**
 * The exchange stores from-template markets as name "template:<id>" plus a
 * keyword payload in the description; render them back into the question the
 * deployer actually meant. Anything unrenderable passes through untouched.
 */
export function hydrateOutcome(
  o: OutcomeMetaEntry,
  templates: Map<string, OutcomeTemplate>
): HydratedOutcome {
  const ref = o.name.match(/^template:([\w-]+)$/i);
  const t = ref ? templates.get(ref[1]) : undefined;
  const kv = ref ? parseKeywordValues(o.description) : null;
  if (ref && t && kv) {
    const display: Record<string, string> = {};
    for (const [k, v] of Object.entries(kv)) {
      display[k] = stampToMs(v) !== null ? stampToUtcLabel(v) : v;
    }
    // some templates write "{time} UTC" and our stamp label already ends in UTC
    const dedupeUtc = (x: string) => x.replace(/\bUTC(\s+UTC)+\b/g, 'UTC');
    return {
      ...o,
      rawName: o.name,
      rawDescription: o.description,
      rawSideNames: [o.sideSpecs[0]?.name ?? '', o.sideSpecs[1]?.name ?? ''] as [string, string],
      name: dedupeUtc(renderTemplate(t.name, display)),
      description: dedupeUtc(renderTemplate(t.description, display)),
      sideSpecs: o.sideSpecs.map((sp, i) => ({
        // side names can themselves be placeholders, e.g. "template:{shortNameA}"
        name:
          cleanLabel(renderTemplate(sp.name.replace(/^template:/i, ''), kv)) ||
          t.role.standaloneOutcome?.sideNames[i] ||
          (i === 0 ? 'Yes' : 'No'),
      })),
      timeMs: stampToMs(kv.time ?? kv.resolutionDeadline ?? kv.scheduledStart ?? ''),
      fromTemplate: ref[1],
    };
  }
  return {
    ...o,
    timeMs: null,
    rawName: o.name,
    rawDescription: o.description,
    rawSideNames: [o.sideSpecs[0]?.name ?? '', o.sideSpecs[1]?.name ?? ''] as [string, string],
  };
}

export function renderTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] || `{${k}}`);
}

/**
 * "20260901-1200" template timestamp (UTC) from a datetime-local input value.
 * The input is the user's LOCAL wall time; convert to UTC properly.
 */
export function toTemplateStamp(datetimeLocal: string): string {
  const d = new Date(datetimeLocal);
  if (Number.isNaN(d.getTime())) return datetimeLocal;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

/** Human-readable UTC rendering of a template stamp. */
export function stampToUtcLabel(stamp: string): string {
  const m = stamp.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!m) return stamp;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} UTC`;
}

/** Epoch ms for a template stamp (UTC). */
export function stampToMs(stamp: string): number | null {
  const m = stamp.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}
