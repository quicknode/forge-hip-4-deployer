'use client';

import { useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

import LiveMarkets from '../components/LiveMarkets';
import MarketWizard, { type ForgedMarket } from '../components/MarketWizard';
import TemplateGallery from '../components/TemplateGallery';
import QMark from '../components/QMark';
import Ticket from '../components/Ticket';
import { fetchInfo, fetchTemplates, type OutcomeTemplate } from '../lib/hl';

const STORAGE = 'forge:markets';

function loadMarkets(): ForgedMarket[] {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m): m is ForgedMarket => {
      if (!m || typeof m !== 'object') return false;
      const f = m as ForgedMarket;
      return (
        typeof f.title === 'string' &&
        typeof f.deployedAt === 'string' &&
        Array.isArray(f.sideNames) &&
        f.sideNames.length === 2 &&
        !!f.values &&
        typeof f.values === 'object'
      );
    });
  } catch {
    return [];
  }
}

export default function Page() {
  const [tab, setTab] = useState<'create' | 'live'>('create');
  const [templates, setTemplates] = useState<OutcomeTemplate[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [perps, setPerps] = useState<string[]>([]);
  const [markets, setMarkets] = useState<ForgedMarket[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [templateRetry, setTemplateRetry] = useState(0);

  useEffect(() => {
    setMarkets(loadMarkets());
    setHydrated(true);
    fetchInfo<{ universe: { name: string }[] }>({ type: 'meta' })
      .then((m) => setPerps(m.universe.map((u) => u.name)))
      .catch(() => setPerps(['BTC', 'ETH', 'SOL', 'HYPE']));
  }, []);

  // template registry: transient upstream hiccups must not brick the app,
  // so retry twice with backoff before showing the error (which has Retry)
  useEffect(() => {
    let alive = true;
    setTemplatesError(null);
    async function load(attempt: number) {
      try {
        const all = await fetchTemplates();
        if (alive) setTemplates(all.filter((t) => t.role.standaloneOutcome));
      } catch (e) {
        if (!alive) return;
        if (attempt < 2) {
          setTimeout(() => alive && load(attempt + 1), 1200 * (attempt + 1));
        } else {
          setTemplatesError(e instanceof Error ? e.message : String(e));
        }
      }
    }
    void load(0);
    return () => {
      alive = false;
    };
  }, [templateRetry]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(markets));
    } catch {
      /* quota/private mode: in-memory only */
    }
  }, [markets, hydrated]);

  const template = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId]
  );

  function onForged(m: ForgedMarket) {
    setMarkets((prev) => [m, ...prev]);
  }

  function onIdFound(deployedAt: string, id: number) {
    setMarkets((prev) => prev.map((m) => (m.deployedAt === deployedAt ? { ...m, outcomeId: id } : m)));
  }

  return (
    <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 24px 80px' }}>
      {/* header */}
      <header
        className="appbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: 'color-mix(in oklch, var(--qn-background) 85%, transparent)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--qn-border)',
        }}
      >
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab('create');
          }}
          aria-label="Forge"
          style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 24,
            letterSpacing: '-0.03em',
            textDecoration: 'none',
            color: 'var(--qn-foreground)',
          }}
        >
          F
          <svg
            aria-hidden
            width="19"
            height="19"
            viewBox="0 0 20 20"
            style={{ margin: '0 1px', transform: 'rotate(-18deg) translateY(1.5px)' }}
          >
            <circle cx="10" cy="10" r="9" fill="var(--yes)" />
            <path d="M10 1 A9 9 0 0 1 10 19 Z" fill="var(--no)" />
            <circle cx="10" cy="10" r="9" fill="none" stroke="var(--qn-foreground)" strokeWidth="1.4" />
          </svg>
          rge
        </a>

        <div className="navtabs">
          <button
            className="navtab"
            data-active={tab === 'create'}
            onClick={() => {
              setTab('create');
              window.scrollTo({ top: 0 });
            }}
          >
            Create market
          </button>
          <button
            className="navtab"
            data-active={tab === 'live'}
            onClick={() => {
              setTab('live');
              window.scrollTo({ top: 0 });
            }}
          >
            Live markets
          </button>
        </div>

        <div style={{ flex: 1 }} />
        <span className="odd" data-side="ghost">● testnet</span>
        <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
      </header>

      <div hidden={tab !== 'create'}>
        <div className={tab === 'create' ? 'pane-in' : undefined}>
        <>
          {!template && (
            <section className="hero-grid">
              <div>
                <h1 className="hero-h1">
                  Got a question?
                  <br />
                  Make it a <span style={{ color: 'var(--yes)' }}>market</span>.
                </h1>
                <p style={{ marginTop: 16, fontSize: 15.5, color: 'var(--ink-60)', maxWidth: 440 }}>
                  Fill in the blanks, sign, and your question is live on a Hyperliquid order
                  book. The crowd trades <strong style={{ color: 'var(--yes)' }}>yes</strong> against{' '}
                  <strong style={{ color: 'var(--no)' }}>no</strong> until you call the result.
                </p>
                <div style={{ display: 'flex', gap: 0, marginTop: 26, flexWrap: 'wrap' }}>
                  {[
                    ['1', 'Create', 'pick a format, fill the blanks, sign'],
                    ['2', 'Trade', 'anyone buys Yes or No on the order book'],
                    ['3', 'Settle', 'after the deadline, you post the result'],
                  ].map(([n, t, d], i) => (
                    <div key={n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingRight: 16, marginRight: 16, borderRight: i < 2 ? '1px solid var(--qn-border)' : 'none', maxWidth: 158 }}>
                      <span className="mono" style={{ color: 'var(--qn-foreground-light)', paddingTop: 2 }}>{n}</span>
                      <span style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                        <strong>{t}</strong>
                        <br />
                        <span style={{ color: 'var(--qn-foreground-medium)' }}>{d}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div aria-hidden style={{ pointerEvents: 'none', position: 'relative' }}>
                <div style={{ position: 'absolute', right: -92, top: -118, transform: 'rotate(12deg)' }}>
                  <QMark size={210} strokeOpacity={0.12} />
                </div>
                <Ticket
                  tilt
                  templateId="binaryPrice2"
                  name="{perp} above {threshold} at {time}?"
                  description="If the {perp} mark price at time of settlement is above {threshold} at {time}, Yes tokens pay out $1 each. Otherwise, No tokens pay out $1 each."
                  sideNames={['Yes', 'No']}
                  values={{ perp: 'BTC', threshold: '80,000', time: 'Sep 1, 12:00 UTC' }}
                  complete
                />
              </div>
            </section>
          )}

          {template ? (
            <MarketWizard
              key={template.id}
              template={template}
              perps={perps}
              onBack={() => setSelectedId(null)}
              onForged={onForged}
              onViewMine={() => setTab('live')}
            />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                <span className="mono" style={{ color: 'var(--qn-foreground-light)' }}>step 1 of 3</span>
                <h2 style={{ fontSize: 22 }}>Pick a question format</h2>
                <span style={{ fontSize: 13, color: 'var(--ink-40)' }}>
                  validator-approved · read live from chain
                </span>
              </div>
              <TemplateGallery templates={templates} error={templatesError} onSelect={setSelectedId} onRetry={() => setTemplateRetry((n) => n + 1)} />
            </>
          )}
        </>
        </div>
      </div>
      <div hidden={tab !== 'live'} style={{ paddingTop: 24 }}>
        <div className={tab === 'live' ? 'pane-in' : undefined}>
          <LiveMarkets mine={markets} onIdFound={onIdFound} />
        </div>
      </div>

      <footer
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 64,
          paddingTop: 16,
          borderTop: '1px solid var(--line)',
          fontSize: 12.5,
          color: 'var(--ink-40)',
        }}
      >
        <span>Chain reads served by Quicknode. Price checks carry evidence hashes.</span>
        <span>Testnet only. Settle honestly.</span>
      </footer>
    </div>
  );
}
