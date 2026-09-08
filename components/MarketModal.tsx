'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cleanDescription, cleanLabel, fetchInfo, type OutcomeMetaEntry } from '../lib/hl';

type Level = { px: string; sz: string };
type Book = { bids: Level[]; asks: Level[] };

const REFRESH_MS = 5000;
const DEPTH = 6;

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
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // play the exit animation, THEN unmount; every close path goes through here
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onCloseRef.current();
      return;
    }
    setClosing(true);
    window.setTimeout(() => onCloseRef.current(), 150);
  }, []);

  // esc, scroll lock, focus trap + restore
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    // Scroll lock. overflow:hidden alone makes the viewport non-scrollable and
    // the browser clamps the scroll offset to 0, so the page visibly jumps to
    // the top behind the overlay and stays there after close. Freezing the
    // body at its current offset keeps every pixel where it was; the reserved
    // scrollbar gutter (html { scrollbar-gutter: stable }) prevents any
    // horizontal shift when the page scrollbar disappears.
    const scrollYAtOpen = window.scrollY;
    const bodyStyle = document.body.style;
    bodyStyle.position = 'fixed';
    bodyStyle.top = `-${scrollYAtOpen}px`;
    bodyStyle.left = '0';
    bodyStyle.right = '0';
    bodyStyle.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') requestClose();
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
      bodyStyle.position = '';
      bodyStyle.top = '';
      bodyStyle.left = '';
      bodyStyle.right = '';
      bodyStyle.overflow = '';
      window.scrollTo(0, scrollYAtOpen);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
    // requestClose is stable (useCallback with no deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className={closing ? 'overlay overlay-out' : 'overlay'} onClick={requestClose} role="dialog" aria-modal="true" aria-label={market.name}>
      <div className={closing ? 'modal modal-out' : 'modal'} ref={modalRef} onClick={(e) => e.stopPropagation()}>
        {/* header (fixed) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: '22px 26px 16px' }}>
          <div style={{ minWidth: 0 }}>
            <span className="mono" style={{ color: 'var(--qn-foreground-light)' }}>
              market #{market.outcome} · settles in {market.quoteToken}
            </span>
            <h2 style={{ fontSize: 24, lineHeight: 1.25, marginTop: 6 }}>
              {cleanLabel(market.name) || `Market #${market.outcome}`}
            </h2>
          </div>
          <button ref={closeRef} className="btn-line" onClick={requestClose} aria-label="Close" style={{ padding: '5px 12px', flexShrink: 0 }}>
            ✕
          </button>
        </div>
        <div className="punchline" style={{ margin: 0 }} />

        {/* body (scrolls only if it must) */}
        <div className="modal-body">
          <div className="modal-cols">
            {/* market side: odds + depth */}
            <div className="modal-mkt" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(
                  [
                    [yesName, mid, 'yes'],
                    [noName, mid !== null ? 1 - mid : null, 'no'],
                  ] as [string, number | null, string][]
                ).map(([label, p, side]) => (
                  <div key={side} className="card-soft" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span className="odd" data-side={side} style={{ alignSelf: 'flex-start' }}>{label}</span>
                    <span className="num" style={{ fontSize: 34, fontWeight: 600, lineHeight: 1 }}>
                      {p !== null ? `${Math.round(p * 100)}%` : '—'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--qn-foreground-light)' }}>
                      {p !== null ? `buy at ~$${p.toFixed(2)}, wins $1` : 'no orders yet'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mono" style={{ color: 'var(--qn-foreground-light)' }}>
                {spread !== null ? `spread ${spread.toFixed(3)} · ` : ''}live from the {yesName.toLowerCase()} order book · refreshes every 5s
              </div>

              {book && (book.bids.length > 0 || book.asks.length > 0) ? (
                <div className="card-soft" style={{ padding: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
                    {(
                      [
                        [`buying ${yesName}`, book.bids.slice(0, DEPTH), 'var(--yes)'],
                        [`selling ${yesName}`, book.asks.slice(0, DEPTH), 'var(--no)'],
                      ] as [string, Level[], string][]
                    ).map(([title, levels, color]) => (
                      <div key={title} style={{ minWidth: 0 }}>
                        <div className="mono" style={{ color: 'var(--qn-foreground-light)', marginBottom: 10 }}>{title}</div>
                        {levels.length === 0 ? (
                          <div style={{ fontSize: 12.5, color: 'var(--qn-foreground-light)' }}>none</div>
                        ) : (
                          levels.map((l, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                              <span className="data" style={{ width: 48, flexShrink: 0 }}>{Number(l.px).toFixed(3)}</span>
                              <div style={{ flex: 1, height: 16, background: 'var(--qn-hover)', borderRadius: 3, overflow: 'hidden' }}>
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${Math.max(4, (Number(l.sz) / maxSz) * 100)}%`,
                                    background: color,
                                    opacity: 0.75,
                                  }}
                                />
                              </div>
                              <span className="data" style={{ width: 58, textAlign: 'right', color: 'var(--qn-foreground-medium)' }}>
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
                <div className="card-soft" style={{ padding: 18, fontSize: 13, color: 'var(--qn-foreground-medium)' }}>
                  {bookError
                    ? 'Could not reach the order book right now.'
                    : book
                      ? 'The book is empty. The first order placed sets the odds.'
                      : 'Reading the order book…'}
                </div>
              )}
              {market.venue && (
                <div className="mono" style={{ color: 'var(--qn-foreground-light)' }}>
                  venue {market.venue}
                  {market.deployerFeeScale && Number(market.deployerFeeScale) > 0
                    ? ` · deployer fee scale ${market.deployerFeeScale}`
                    : ' · no deployer fee'}
                </div>
              )}
            </div>

            {/* criteria side: the full rules, no clamping */}
            <div className="modal-rules">
              <div className="mono" style={{ color: 'var(--qn-foreground-light)', marginBottom: 10 }}>
                how it settles
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--qn-foreground-medium)' }}>
                {market.description
                  ? cleanDescription(market.description)
                  : 'The deployer settles this market manually.'}{' '}
                Winning tokens redeem at $1; the losing side expires worthless.
              </p>
            </div>
          </div>
        </div>

        {/* footer (fixed) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 26px', borderTop: '1px solid var(--qn-border)', flexShrink: 0 }}>
          <a className="btn" style={{ textDecoration: 'none' }} href="https://app.hyperliquid-testnet.xyz/trade" target="_blank" rel="noreferrer">
            Trade on Hyperliquid testnet ↗
          </a>
          <span style={{ fontSize: 12, color: 'var(--qn-foreground-light)' }}>asset #{market.outcome * 10}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
