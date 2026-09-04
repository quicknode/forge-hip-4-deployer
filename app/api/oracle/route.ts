import { createHash } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

/**
 * The settle-check oracle, via the Quicknode Hyperliquid mainnet endpoint.
 * Two modes:
 *  - current price (allMids), basis "current-price" — indicative only
 *  - price at a past settlement time (1m candleSnapshot around atMs),
 *    basis "settlement-time" — what a settlement should be judged on
 * Every answer carries evidence: request, response hash, value, latency.
 */

const QN_MAINNET = process.env.FORGE_QN_ENDPOINT
  ? `${process.env.FORGE_QN_ENDPOINT.replace(/\/$/, '')}/info`
  : 'https://api.hyperliquid.xyz/info';

async function upstream(request: Record<string, unknown>) {
  const started = Date.now();
  const res = await fetch(QN_MAINNET, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  return { res, body, latencyMs: Date.now() - started };
}

export async function POST(req: NextRequest) {
  let coin: string;
  let threshold: number;
  let atMs: number | null;
  try {
    const body = (await req.json()) as { coin?: unknown; threshold?: unknown; atMs?: unknown };
    coin = typeof body.coin === 'string' ? body.coin.slice(0, 24) : '';
    threshold = Number(body.threshold);
    atMs = Number.isFinite(Number(body.atMs)) ? Number(body.atMs) : null;
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }
  if (!coin || !Number.isFinite(threshold)) {
    return NextResponse.json({ error: 'coin and threshold required' }, { status: 400 });
  }

  const settlementMode = atMs !== null && atMs <= Date.now();
  const request: Record<string, unknown> = settlementMode
    ? {
        type: 'candleSnapshot',
        req: { coin, interval: '1m', startTime: (atMs as number) - 180_000, endTime: (atMs as number) + 60_000 },
      }
    : { type: 'allMids' };

  let res: Response;
  let body: string;
  let latencyMs: number;
  try {
    ({ res, body, latencyMs } = await upstream(request));
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError';
    return NextResponse.json(
      { error: timeout ? 'upstream timeout' : 'upstream unreachable' },
      { status: 504 }
    );
  }
  if (!res.ok) return NextResponse.json({ error: `upstream ${res.status}` }, { status: 502 });

  let value: number;
  try {
    if (settlementMode) {
      const candles = JSON.parse(body) as Array<{ t: number; c: string }>;
      const eligible = candles.filter((c) => c.t <= (atMs as number));
      const last = eligible[eligible.length - 1];
      if (!last) {
        return NextResponse.json(
          { error: `no candle found for ${coin} at that time` },
          { status: 404 }
        );
      }
      value = Number(last.c);
    } else {
      const mids = JSON.parse(body) as Record<string, string>;
      value = Number(mids[coin]);
    }
  } catch {
    return NextResponse.json({ error: 'upstream returned non-JSON' }, { status: 502 });
  }
  if (!Number.isFinite(value)) {
    return NextResponse.json({ error: `no price for ${coin}` }, { status: 404 });
  }

  return NextResponse.json({
    source: 'quicknode-info-api',
    basis: settlementMode ? 'settlement-time' : 'current-price',
    upstream: 'quicknode',
    request,
    value,
    threshold,
    verdict: value > threshold ? 'YES' : 'NO',
    responseSha256: createHash('sha256').update(body).digest('hex'),
    latencyMs,
    evaluatedAt: new Date().toISOString(),
  });
}
