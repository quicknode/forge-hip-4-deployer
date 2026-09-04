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
export const fetchOutcomeMeta = () =>
  fetchInfo<{ outcomes: OutcomeMetaEntry[] }>({ type: 'outcomeMeta' });

/** Deploy action: instantiate a standalone-outcome template. */
export function buildRegisterAction(
  templateId: string,
  keywordToValue: [string, string][],
  deployerFeeScale = '0'
) {
  return {
    type: 'spotDeploy',
    outcome: {
      registerStandaloneOutcomeFromTemplate: {
        id: templateId,
        // Protocol expects byte-order lexicographic keywords (not locale collation).
        keywordToValue: [...keywordToValue].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
        deployerFeeScale,
      },
    },
  };
}

/** Settlement action for a standalone outcome. settleFraction "1" = YES wins. */
export function buildSettleAction(
  outcome: number,
  settleFraction: '0' | '1',
  details: string,
  nameAndDescription: [string, string],
  sideNames: [string, string]
) {
  return {
    type: 'spotDeploy',
    outcome: {
      settleOutcome: { outcome, settleFraction, details, nameAndDescription, sideNames },
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
