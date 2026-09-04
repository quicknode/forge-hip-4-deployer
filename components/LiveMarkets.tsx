'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';

import { useL1Sign } from '../lib/useL1Sign';

import { friendlyError } from '../lib/errors';
import {
  buildSettleAction,
  cleanLabel,
  fetchOutcomeMeta,
  isJunkMarket,
  isLowQuality,
  marketCategory,
  sendExchange,
  stampToMs,
  stampToUtcLabel,
  type OutcomeMetaEntry,
} from '../lib/hl';

import MarketModal from './MarketModal';
import QMark from './QMark';
import type { ForgedMarket } from './MarketWizard';

type OracleCheck = {
  value: number;
  threshold: number;
  verdict: 'YES' | 'NO';
  upstream: string;
  responseSha256: string;
  basis: 'current-price' | 'settlement-time';
};

/** Live markets: the whole testnet board plus this browser's deployments. */
export default function LiveMarkets({
  mine,
  onIdFound,
}: {
  mine: ForgedMarket[];
  onIdFound: (deployedAt: string, id: number) => void;
}) {
  const [view, setView] = useState<'all' | 'mine'>(mine.length > 0 ? 'mine' : 'all');
  const [outcomes, setOutcomes] = useState<OutcomeMetaEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(36);
  const [open, setOpen] = useState<OutcomeMetaEntry | null>(null);
  const [retry, setRetry] = useState(0);
  const [showJunk, setShowJunk] = useState(false);
  const [sort, setSort] = useState<'new' | 'old' | 'az'>('new');
  const [category, setCategory] = useState<string>('all');

  useEffect(() => {
    setError(null);
    fetchOutcomeMeta()
      .then((m) => setOutcomes([...m.outcomes].reverse()))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [retry]);

  const curated = useMemo(() => {
    if (!outcomes) return { shownList: [] as OutcomeMetaEntry[], junkCount: 0 };
    const junkCount = outcomes.filter(isJunkMarket).length;
    const base = showJunk ? outcomes : outcomes.filter((o) => !isJunkMarket(o));
    // real questions first (each group stays newest-first), test leftovers after
    const good = base.filter((o) => !isLowQuality(o));
    const rest = base.filter(isLowQuality);
    return { shownList: [...good, ...rest], junkCount };
  }, [outcomes, showJunk]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of curated.shownList) {
      const c = marketCategory(o);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [curated]);

  const filtered = useMemo(() => {
    let base = curated.shownList;
    if (category !== 'all') base = base.filter((o) => marketCategory(o) === category);
    const needle = q.trim().toLowerCase();
    if (needle) {
      base = base.filter(
        (o) =>
          o.name.toLowerCase().includes(needle) ||
          o.description.toLowerCase().includes(needle) ||
          String(o.outcome).includes(needle)
      );
    }
    if (sort === 'old') base = [...base].reverse();
    else if (sort === 'az')
      base = [...base].sort((a, b) => cleanLabel(a.name).localeCompare(cleanLabel(b.name)));
    return base;
  }, [curated, q, sort, category]);

  const closeModal = useCallback(() => setOpen(null), []);

  // a fresh deploy should land the user on their own market
  const prevMine = useRef(mine.length);
  useEffect(() => {
    if (mine.length > prevMine.current) setView('mine');
    prevMine.current = mine.length;
  }, [mine.length]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="control-row">
        <div className="navtabs">
          <button className="navtab" data-active={view === 'all'} onClick={() => setView('all')}>
            All {outcomes ? `(${outcomes.length})` : ''}
          </button>
          <button className="navtab" data-active={view === 'mine'} onClick={() => setView('mine')}>
            Mine ({mine.length})
          </button>
        </div>
        {view === 'all' && (
          <>
            <input
              placeholder="Search markets"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setShown(36);
              }}
              style={{ width: 240 }}
            />
            <select
              className="sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as 'new' | 'old' | 'az')}
              aria-label="Sort markets"
            >
              <option value="new">Newest first</option>
              <option value="old">Oldest first</option>
              <option value="az">A to Z</option>
            </select>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12.5, color: 'var(--ink-40)', whiteSpace: 'nowrap' }}>
              {Math.min(shown, filtered.length)} of {filtered.length}
            </span>
            {curated.junkCount > 0 && (
              <button className="linkbtn" onClick={() => setShowJunk((v) => !v)}>
                {showJunk ? 'hide' : 'show'} {curated.junkCount} test markets
              </button>
            )}
          </>
        )}
        {view === 'mine' && (
          <span style={{ fontSize: 12.5, color: 'var(--ink-40)' }}>deployed from this browser</span>
        )}
      </div>

      {view === 'all' && categories.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['all', ...categories].map((c) => (
            <button
              key={c}
              className="navtab"
              data-active={category === c}
              style={{ border: '1px solid var(--qn-border)', borderRadius: 'var(--qn-radius-sm)', padding: '4px 12px', fontSize: 12 }}
              onClick={() => {
                setCategory(c);
                setShown(36);
              }}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div hidden={view !== 'all'}>
        <AllMarkets
          outcomes={outcomes}
          error={error}
          filtered={filtered}
          shown={shown}
          onMore={() => setShown((n) => n + 48)}
          onOpen={setOpen}
          onRetry={() => setRetry((n) => n + 1)}
        />
      </div>
      <div hidden={view !== 'mine'}>
        <MineMarkets mine={mine} outcomes={outcomes} onIdFound={onIdFound} onOpen={setOpen} />
      </div>

      {open && <MarketModal market={open} onClose={closeModal} />}
    </div>
  );
}

function AllMarkets({
  outcomes,
  error,
  filtered,
  shown,
  onMore,
  onOpen,
  onRetry,
}: {
  outcomes: OutcomeMetaEntry[] | null;
  error: string | null;
  filtered: OutcomeMetaEntry[];
  shown: number;
  onMore: () => void;
  onOpen: (o: OutcomeMetaEntry) => void;
  onRetry: () => void;
}) {
  if (error)
    return (
      <div className="card-soft" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ color: 'var(--red)' }}>Could not load the board.</span>
        <button className="btn-line" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  if (!outcomes)
    return <div className="card-soft" style={{ padding: 24, color: 'var(--ink-60)' }}>Loading the board…</div>;
  if (filtered.length === 0)
    return (
      <div className="card-soft" style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <QMark size={52} strokeOpacity={0.45} />
        <span style={{ color: 'var(--ink-60)' }}>Nothing matches.</span>
      </div>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14 }}>
        {filtered.slice(0, shown).map((o, i) => (
          <button
            key={o.outcome}
            className="mktcard rise"
            style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}
            onClick={() => onOpen(o)}
          >
            <div className="body">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <span className="mono" style={{ color: 'var(--ink-40)' }}>#{o.outcome}</span>
                <span className="mono" style={{ color: 'var(--ink-40)' }}>{o.quoteToken}</span>
              </div>
              <span className="question">{cleanLabel(o.name) || `Market #${o.outcome}`}</span>
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', alignItems: 'center' }}>
                <span className="odd" data-side="yes">{cleanLabel(o.sideSpecs[0]?.name ?? '') || 'Yes'}</span>
                <span className="odd" data-side="no">{cleanLabel(o.sideSpecs[1]?.name ?? '') || 'No'}</span>
                <span style={{ flex: 1 }} />
                <span className="mono" style={{ color: 'var(--ink-40)' }}>peek →</span>
              </div>
            </div>
          </button>
        ))}
      </div>
      {filtered.length > shown && (
        <button className="btn-line" style={{ alignSelf: 'center' }} onClick={onMore}>
          Show more
        </button>
      )}
    </div>
  );
}

function MineMarkets({
  mine,
  outcomes,
  onIdFound,
  onOpen,
}: {
  mine: ForgedMarket[];
  outcomes: OutcomeMetaEntry[] | null;
  onIdFound: (deployedAt: string, id: number) => void;
  onOpen: (o: OutcomeMetaEntry) => void;
}) {
  const { isConnected } = useAccount();
  const signL1 = useL1Sign();
  const [checks, setChecks] = useState<Record<string, OracleCheck | { error: string }>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [armed, setArmed] = useState<string | null>(null);
  const [settling, setSettling] = useState<string | null>(null);
  const [settleResults, setSettleResults] = useState<Record<string, { ok: boolean; text: string; raw?: string }>>({});
  const armTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (armTimer.current) window.clearTimeout(armTimer.current);
    },
    []
  );

  async function check(m: ForgedMarket) {
    const key = m.deployedAt;
    const coin = m.values.perp;
    const threshold = Number((m.values.threshold ?? m.values.target ?? '').replace(/,/g, ''));
    if (!coin || !Number.isFinite(threshold)) {
      setChecks((s) => ({ ...s, [key]: { error: 'This market type has no price threshold to check.' } }));
      return;
    }
    const stamp = m.values.time ? stampToMs(m.values.time) : null;
    const due = stamp !== null && Date.now() >= stamp;
    try {
      const res = await fetch('/api/oracle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coin, threshold, ...(due ? { atMs: stamp } : {}) }),
      });
      const body = await res.json();
      setChecks((s) => ({ ...s, [key]: res.ok ? body : { error: body?.error ?? 'oracle unavailable' } }));
    } catch (e) {
      setChecks((s) => ({ ...s, [key]: { error: e instanceof Error ? e.message : String(e) } }));
    }
  }

  async function settle(m: ForgedMarket, fraction: '0' | '1') {
    if (m.outcomeId === undefined || settling) return;
    const armKey = `${m.deployedAt}:${fraction}`;
    if (armed !== armKey) {
      setArmed(armKey);
      if (armTimer.current) window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => setArmed((a) => (a === armKey ? null : a)), 6000);
      return;
    }
    setArmed(null);
    setSettling(m.deployedAt);
    const c = checks[m.deployedAt];
    const details =
      c && 'responseSha256' in c
        ? `Settled per Quicknode ${c.basis} read: ${c.value} vs ${c.threshold} (sha256 ${c.responseSha256.slice(0, 16)})`
        : 'Settled by deployer';
    const action = buildSettleAction(m.outcomeId, fraction, details, [m.title, m.description], m.sideNames);
    try {
      const res = await sendExchange(signL1, action);
      const raw = JSON.stringify(res.body);
      setSettleResults((s) => ({
        ...s,
        [m.deployedAt]: res.ok
          ? { ok: true, text: `Settled ${fraction === '1' ? m.sideNames[0] : m.sideNames[1]}.` }
          : { ok: false, text: friendlyError(raw), raw },
      }));
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setSettleResults((s) => ({ ...s, [m.deployedAt]: { ok: false, text: friendlyError(raw), raw } }));
    } finally {
      setSettling(null);
    }
  }

  function findId(m: ForgedMarket) {
    const match = outcomes?.find((o) => o.name === m.title);
    if (match) {
      onIdFound(m.deployedAt, match.outcome);
      setNotes((s) => ({ ...s, [m.deployedAt]: `Found: market #${match.outcome}.` }));
    } else {
      setNotes((s) => ({
        ...s,
        [m.deployedAt]: 'No live market with this exact title found yet. Try again in a minute.',
      }));
    }
  }

  if (mine.length === 0) {
    return (
      <div className="card-soft" style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <QMark size={52} strokeOpacity={0.45} />
        <p style={{ color: 'var(--ink-60)' }}>Nothing here yet.</p>
        <p style={{ fontSize: 13, color: 'var(--ink-40)', marginTop: -6 }}>
          Deploy a market from the Create tab and it appears here for settlement.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {mine.map((m) => {
        const c = checks[m.deployedAt];
        const stamp = m.values.time ? stampToMs(m.values.time) : null;
        const beforeTime = stamp !== null && Date.now() < stamp;
        const sr = settleResults[m.deployedAt];
        const live = outcomes?.find((o) => o.outcome === m.outcomeId);
        const isSettling = settling === m.deployedAt;
        return (
          <div key={m.deployedAt} className="card-soft" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16 }}>{m.title}</span>
              {live ? (
                <button className="linkbtn" style={{ color: 'var(--yes)', whiteSpace: 'nowrap' }} onClick={() => onOpen(live)}>
                  #{m.outcomeId} · view →
                </button>
              ) : (
                <span className="mono" style={{ color: 'var(--ink-40)', whiteSpace: 'nowrap' }}>
                  {m.outcomeId !== undefined ? `#${m.outcomeId}` : 'id pending'}
                </span>
              )}
            </div>

            {m.values.time && (
              <span style={{ fontSize: 12.5, color: beforeTime ? 'var(--ink-60)' : 'var(--yes)' }}>
                {beforeTime
                  ? `Settles ${stampToUtcLabel(m.values.time)} · locked until then`
                  : `Past settlement time (${stampToUtcLabel(m.values.time)}) · ready to settle`}
              </span>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-line" onClick={() => check(m)}>
                {beforeTime ? 'Check price now' : 'Check settlement price'}
              </button>
              {m.outcomeId === undefined && (
                <button className="btn-line" onClick={() => findId(m)}>
                  Find market id
                </button>
              )}
              {(['1', '0'] as const).map((f) => {
                const side = f === '1' ? m.sideNames[0] : m.sideNames[1];
                const isArmed = armed === `${m.deployedAt}:${f}`;
                return (
                  <button
                    key={f}
                    className={isArmed ? 'btn-line btn-armed' : 'btn-line'}
                    disabled={m.outcomeId === undefined || !isConnected || beforeTime || !!settling}
                    title={beforeTime ? 'Settlement unlocks at the market time' : undefined}
                    onClick={() => settle(m, f)}
                  >
                    {isSettling ? 'Waiting for signature…' : isArmed ? `Confirm: settle ${side}` : `Settle ${side}`}
                  </button>
                );
              })}
            </div>

            {armed?.startsWith(m.deployedAt) && (
              <span style={{ fontSize: 12.5, color: 'var(--red)' }}>
                Settlement is final. Wrong settlements can slash your stake.
              </span>
            )}

            {notes[m.deployedAt] && (
              <span style={{ fontSize: 12.5, color: 'var(--ink-60)' }}>{notes[m.deployedAt]}</span>
            )}

            {c && (
              <div className="card-soft" style={{ padding: 12, background: 'var(--card-2)' }}>
                {'error' in c ? (
                  <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{c.error}</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 13 }}>
                      {c.basis === 'settlement-time' ? 'Price at settlement time' : 'Current price'}{' '}
                      {c.value.toLocaleString('en-US')} vs {c.threshold.toLocaleString('en-US')} →{' '}
                      <strong style={{ color: 'var(--yes)' }}>{c.verdict}</strong>
                      {c.basis === 'current-price' && (
                        <span style={{ color: 'var(--ink-60)' }}> · indicative only, not the settlement value</span>
                      )}
                    </span>
                    <span className="data" style={{ color: 'var(--ink-40)' }}>
                      via {c.upstream} · sha256 {c.responseSha256.slice(0, 20)}…
                    </span>
                  </div>
                )}
              </div>
            )}

            {sr && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 13, color: sr.ok ? 'var(--yes)' : 'var(--red)' }}>{sr.text}</span>
                {sr.raw && (
                  <details>
                    <summary className="mono" style={{ cursor: 'pointer', color: 'var(--ink-40)' }}>
                      raw response
                    </summary>
                    <span className="data" style={{ color: 'var(--ink-60)' }}>{sr.raw.slice(0, 400)}</span>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
