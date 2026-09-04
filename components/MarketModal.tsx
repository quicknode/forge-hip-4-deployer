'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cleanDescription, cleanLabel, fetchInfo, type OutcomeMetaEntry } from '../lib/hl';

type Level = { px: string; sz: string };
type Book = { bids: Level[]; asks: Level[] };

const REFRESH_MS = 5000;
const DEPTH = 4;

/**
 * Market detail: both sides' implied odds, the live depth ladder, and how it
 * settles — enough to decide whether to trade. Polls the YES-side book
 * (asset "#" + outcomeId*10) every 5s.
 */
export default function MarketModal({
  market,
  onClose,
}: {
  market: OutcomeMetaEntry;
  onClose: () => void;
}) {
  const [book, setBook] = useState<Book | null>(null);
  const [bookError, setBookError] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // esc, scroll lock, focus trap + restore
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    // lock scroll without a layout shift: compensate the scrollbar width
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], input, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, []);

  // poll the full book while open
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const b = await fetchInfo<{ levels?: [Level[], Level[]] }>({
          type: 'l2Book',
          coin: `#${market.outcome * 10}`,
        });
        if (!alive) return;
        setBook({ bids: b.levels?.[0] ?? [], asks: b.levels?.[1] ?? [] });
        setBookError(false);
      } catch {
        if (alive) setBookError(true);
      }
    }
    void load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [market.outcome]);

  const bestBid = book?.bids[0] ? Number(book.bids[0].px) : null;
  const bestAsk = book?.asks[0] ? Number(book.asks[0].px) : null;
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : bestBid ?? bestAsk;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const yesName = cleanLabel(market.sideSpecs[0]?.name ?? '') || 'Yes';
  const noName = cleanLabel(market.sideSpecs[1]?.name ?? '') || 'No';
  const maxSz = Math.max(
    1,
    ...(book ? [...book.bids, ...book.asks].slice(0, DEPTH * 2).map((l) => Number(l.sz)) : [1])
  );

  return createPortal(
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={market.name}>
      <div className="modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: '20px 22px 14px' }}>
          <div>
            <span className="mono" style={{ color: 'var(--qn-foreground-light)' }}>
              market #{market.outcome} · settles in {market.quoteToken}
            </span>
            <h2 style={{ fontSize: 21, marginTop: 6 }}>{cleanLabel(market.name) || `Market #${market.outcome}`}</h2>
          </div>
          <button ref={closeRef} className="btn-line" onClick={onClose} aria-label="Close" style={{ padding: '5px 12px', flexShrink: 0 }}>
            ✕
          </button>
        </div>

        {/* implied odds: both sides */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 22px 8px' }}>
          {(
            [
              [yesName, mid, 'yes'],
              [noName, mid !== null ? 1 - mid : null, 'no'],
            ] as [string, number | null, string][]
          ).map(([label, p, side]) => (
            <div key={side} className="card-soft" style={{ padding: '12px 16px', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="odd" data-side={side}>{label}</span>
              <span className="num" style={{ fontSize: 24, fontWeight: 600 }}>
                {p !== null ? `${Math.round(p * 100)}%` : '—'}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--qn-foreground-light)' }}>
                {p !== null ? `buy at ~$${p.toFixed(2)}, wins $1` : 'no orders yet'}
              </span>
            </div>
          ))}
        </div>
        <div className="mono" style={{ padding: '0 22px 14px', color: 'var(--qn-foreground-light)' }}>
          {spread !== null ? `spread ${spread.toFixed(3)} · ` : ''}live from the {yesName.toLowerCase()} order book · refreshes every 5s
        </div>

        {/* depth ladder */}
        <div style={{ padding: '0 22px 16px' }}>
          {book && (book.bids.length > 0 || book.asks.length > 0) ? (
            <div className="card-soft" style={{ padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                {(
                  [
                    [`buying ${yesName}`, book.bids.slice(0, DEPTH), 'var(--yes)'],
                    [`selling ${yesName}`, book.asks.slice(0, DEPTH), 'var(--no)'],
                  ] as [string, Level[], string][]
                ).map(([title, levels, color]) => (
                  <div key={title}>
                    <div className="mono" style={{ color: 'var(--qn-foreground-light)', marginBottom: 8 }}>{title}</div>
                    {levels.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: 'var(--qn-foreground-light)' }}>none</div>
                    ) : (
                      levels.map((l, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span className="data" style={{ width: 46, flexShrink: 0 }}>{Number(l.px).toFixed(3)}</span>
                          <div style={{ flex: 1, height: 14, background: 'var(--qn-hover)', borderRadius: 3, overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${Math.max(4, (Number(l.sz) / maxSz) * 100)}%`,
                                background: color,
                                opacity: 0.75,
                              }}
                            />
                          </div>
                          <span className="data" style={{ width: 56, textAlign: 'right', color: 'var(--qn-foreground-medium)' }}>
                            {Number(l.sz).toLocaleString('en-US')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card-soft" style={{ padding: 16, fontSize: 13, color: 'var(--qn-foreground-medium)' }}>
              {bookError
                ? 'Could not reach the order book right now.'
                : book
                  ? 'The book is empty. The first order placed sets the odds.'
                  : 'Reading the order book…'}
            </div>
          )}
        </div>

        {/* how it settles */}
        {market.description && (
          <div style={{ padding: '0 22px 18px' }}>
            <div className="mono" style={{ color: 'var(--qn-foreground-light)', marginBottom: 6 }}>
              how it settles
            </div>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.6,
                color: 'var(--qn-foreground-medium)',
                ...(showFullDesc
                  ? {}
                  : {
                      display: '-webkit-box',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical' as const,
                      overflow: 'hidden',
                    }),
              }}
            >
              {cleanDescription(market.description)} Winning tokens redeem at $1; the losing side expires worthless.
            </p>
            {cleanDescription(market.description).length > 260 && (
              <button className="linkbtn" style={{ marginTop: 6 }} onClick={() => setShowFullDesc((v) => !v)}>
                {showFullDesc ? 'show less' : 'read the full criteria'}
              </button>
            )}
          </div>
        )}

        {/* trade CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', borderTop: '1px solid var(--qn-border)' }}>
          <a className="btn" style={{ textDecoration: 'none' }} href="https://app.hyperliquid-testnet.xyz/trade" target="_blank" rel="noreferrer">
            Trade on Hyperliquid testnet ↗
          </a>
          <span style={{ fontSize: 12, color: 'var(--qn-foreground-light)' }}>asset #{market.outcome * 10}</span>
        </div>
      </div>
    </div>
    ,
    document.body
  );
}
