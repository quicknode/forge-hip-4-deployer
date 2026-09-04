import { NextRequest, NextResponse } from 'next/server';

/**
 * Info proxy to the Quicknode Hyperliquid testnet endpoint. The endpoint URL
 * (with its token) stays server-side. The upstream body is REBUILT from a
 * per-type field whitelist, so only known request shapes are relayed.
 */

const TESTNET_INFO = process.env.FORGE_QN_TESTNET_ENDPOINT
  ? `${process.env.FORGE_QN_TESTNET_ENDPOINT.replace(/\/$/, '')}/info`
  : 'https://api.hyperliquid-testnet.xyz/info';

const MAX_BODY = 512;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: 'body too large' }, { status: 400 });
  }
  let payload: { type?: unknown; coin?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }

  // Rebuild the upstream request per type; nothing else is forwarded.
  let forwarded: Record<string, unknown> | null = null;
  switch (payload?.type) {
    case 'outcomeTemplates':
    case 'outcomeMeta':
    case 'meta':
      forwarded = { type: payload.type };
      break;
    case 'l2Book':
      if (typeof payload.coin === 'string' && payload.coin.length <= 24) {
        forwarded = { type: 'l2Book', coin: payload.coin };
      }
      break;
  }
  if (!forwarded) {
    return NextResponse.json(
      { error: 'type must be one of: outcomeTemplates, outcomeMeta, meta, l2Book (with coin)' },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(TESTNET_INFO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forwarded),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `upstream ${res.status}: ${body.slice(0, 200)}` },
        { status: 502 }
      );
    }
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-forge-upstream': 'quicknode',
      },
    });
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError';
    return NextResponse.json(
      { error: timeout ? 'upstream timeout' : 'upstream unreachable' },
      { status: 504 }
    );
  }
}
