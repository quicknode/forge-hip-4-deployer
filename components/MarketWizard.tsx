'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance } from 'wagmi';

import { useL1Sign } from '../lib/useL1Sign';

import {
  buildRegisterAction,
  fetchOutcomeMeta,
  renderTemplate,
  sendExchange,
  stampToUtcLabel,
  toTemplateStamp,
  type DeployerEntry,
  type OutcomeTemplate,
} from '../lib/hl';
import { invalidateWalletReadiness, useWalletReadiness } from '../lib/useWalletReadiness';
import { activateVenue, deriveDeployerKey, derivedFromAddress, exportDeployerKey, stakeAsDeployer, storedDeployerAddress } from '../lib/agent';
import { errText, friendlyError } from '../lib/errors';
import { startFaviconSpin, stopFaviconSpin } from '../lib/favicon';
import { fieldHelp, fieldLabel, friendlyName, normalizeValue, orderedKeywords, validateField } from '../lib/templates';

import Ticket from './Ticket';
import TimeField from './TimeField';

/** Walk the response for the first numeric "outcome" property. */
function deepFindOutcome(node: unknown): number | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const obj = node as Record<string, unknown>;
  if (typeof obj.outcome === 'number') return obj.outcome;
  for (const v of Object.values(obj)) {
    const found = deepFindOutcome(v);
    if (found !== undefined) return found;
  }
  return undefined;
}

export type ForgedMarket = {
  outcomeId?: number;
  templateId: string;
  title: string;
  description: string;
  sideNames: [string, string];
  values: Record<string, string>;
  deployedAt: string;
};

export default function MarketWizard({
  template,
  perps,
  onBack,
  onForged,
  onViewMine,
}: {
  template: OutcomeTemplate;
  perps: string[];
  onBack: () => void;
  onForged: (m: ForgedMarket) => void;
  onViewMine: () => void;
}) {
  const { isConnected, address, connector } = useAccount();
  const { openConnectModal } = useConnectModal();
  const signL1 = useL1Sign();

  const [values, setValues] = useState<Record<string, string>>({});
  const [feeScale, setFeeScale] = useState(0);
  const [deployers, setDeployers] = useState<DeployerEntry[] | null>(null);
  const [venue, setVenue] = useState('');
  const [setupMsg, setSetupMsg] = useState<{ ok: boolean; text: string; raw?: string } | null>(null);
  const [setupBusy, setSetupBusy] = useState<string | null>(null);
  const [metaRefresh, setMetaRefresh] = useState(0);
  // never touch localStorage during SSR; null = no deployer key derived yet
  const [depAddr, setDepAddr] = useState<string | null>(null);
  const [depSource, setDepSource] = useState<string | null>(null);
  useEffect(() => {
    setDepAddr(storedDeployerAddress());
    setDepSource(derivedFromAddress());
  }, []);
  const [deriving, setDeriving] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  function copyDeployerAddress() {
    if (!depAddr) return;
    void navigator.clipboard.writeText(depAddr);
    setCopied(true);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  }
  async function derive() {
    if (!address || !connector || deriving) return;
    // never silently replace a key that holds funds
    if (depAddr && depReadiness && (depReadiness.spotHype > 0.5 || depReadiness.stakedHype > 0.5) && depSource !== address.toLowerCase()) {
      setSetupMsg({ ok: false, text: 'The current deployer key holds funds. Back it up before deriving a new one from this wallet.' });
      return;
    }
    setDeriving(true);
    setSetupMsg(null);
    try {
      const provider = (await connector.getProvider()) as {
        request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
      };
      const a = await deriveDeployerKey(provider, address);
      setDepAddr(a);
      setDepSource(address.toLowerCase());
      invalidateWalletReadiness();
      setSetupMsg({ ok: true, text: 'Deployer derived. The same wallet re-derives this exact account anywhere.' });
    } catch (e) {
      setSetupMsg({ ok: false, text: friendlyError(errText(e)) });
    } finally {
      setDeriving(false);
    }
  }
  const readiness = useWalletReadiness(address).data;
  const depReadiness = useWalletReadiness(depAddr ?? undefined).data;
  const depFunded = !!depReadiness && (depReadiness.spotHype >= 100 || depReadiness.stakedHype >= 100);
  const depStaked = !!depReadiness && depReadiness.stakedHype >= 100;
  // 1 derive → 2 fund → 3 stake → 4 venue, advanced purely from chain state
  const setupStep = !depAddr ? 1 : !depFunded ? 2 : !depStaked ? 3 : 4;
  const [peek, setPeek] = useState<number | null>(null);
  useEffect(() => setPeek(null), [setupStep]);
  const shownStep = peek ?? setupStep;
  // HYPE on HyperEVM (chain 998 native token) is a SEPARATE ledger from
  // Hypercore spot; detecting it catches the classic "I have HYPE but the
  // exchange says I don't" confusion.
  const evmBalance = useBalance({ address });
  const evmHype = evmBalance.data ? Number(evmBalance.data.formatted) : 0;
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; raw?: string; id?: number } | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchOutcomeMeta()
      .then((m) => alive && setDeployers(m.deployers ?? []))
      .catch(() => alive && setDeployers(null));
    return () => {
      alive = false;
    };
  }, [metaRefresh]);

  async function runSetup(step: 'stake' | 'venue') {
    setSetupBusy(step);
    setSetupMsg(null);
    startFaviconSpin();
    try {
      if (step === 'stake') {
        const r = await stakeAsDeployer(100);
        if (r.ok) invalidateWalletReadiness();
        const raw = JSON.stringify(r.body);
        setSetupMsg({ ok: r.ok, text: r.ok ? '100 HYPE staked from the deployer key.' : friendlyError(raw), raw: r.ok ? undefined : raw });
      } else {
        if (!venue.trim()) {
          setSetupMsg({ ok: false, text: 'Pick a venue name first.' });
        } else {
          const r = await activateVenue(venue);
          const raw = JSON.stringify(r.body);
          setSetupMsg({ ok: r.ok, text: r.ok ? `Venue "${venue.trim().toLowerCase()}" claimed. You can deploy now.` : friendlyError(raw), raw: r.ok ? undefined : raw });
          if (r.ok) {
            setMetaRefresh((n) => n + 1);
            invalidateWalletReadiness();
          }
        }
      }
    } catch (e) {
      const raw = errText(e);
      setSetupMsg({ ok: false, text: friendlyError(raw), raw });
    } finally {
      setSetupBusy(null);
      stopFaviconSpin();
    }
  }

  const addressChip = depAddr ? (
    <span style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
      <span
        style={{
          display: 'flex',
          alignItems: 'stretch',
          border: '1px solid var(--qn-border)',
          borderRadius: 'var(--qn-radius-sm)',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <code className="data" style={{ padding: '7px 10px', userSelect: 'all', alignSelf: 'center' }}>{depAddr}</code>
        <button
          aria-label="Copy address"
          title={copied ? 'Copied' : 'Copy address'}
          onClick={copyDeployerAddress}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 10px',
            borderLeft: '1px solid var(--qn-border)',
            background: 'transparent',
            cursor: 'pointer',
            color: copied ? 'var(--highlight)' : 'var(--qn-foreground-medium)',
          }}
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M2.5 7.5 6 11l5.5-8" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <rect x="4.5" y="4.5" width="8" height="8" stroke="currentColor" strokeWidth="1.2" />
              <path d="M9.5 4.5v-3h-8v8h3" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>
      </span>
      <button
        className="btn-line"
        style={{ padding: '6px 12px', fontSize: 12.5 }}
        onClick={() => {
          if (window.confirm('Copy the deployer PRIVATE key to the clipboard? It controls the stake. Store it somewhere safe.'))
            navigator.clipboard.writeText(exportDeployerKey());
        }}
      >
        Backup key
      </button>
    </span>
  ) : null;

  const derivedNote = depAddr ? (
    <span style={{ color: 'var(--qn-foreground-light)' }}>
      {depSource
        ? `Derived from ${depSource.slice(0, 6)}…${depSource.slice(-4)}. Recoverable by re-signing with that wallet on any browser.`
        : 'Legacy random key: it exists only in this browser. Back it up, or derive a recoverable one from your wallet.'}
      {depSource && address && depSource !== address.toLowerCase() && (
        <strong style={{ color: 'var(--red)' }}> This deployer belongs to a different wallet than the one connected.</strong>
      )}
      {(!depSource || (address && depSource !== address.toLowerCase())) && (
        <>
          {' '}
          <button className="linkbtn" disabled={!isConnected || deriving} onClick={derive}>
            {deriving ? 'waiting for signature…' : 'derive from connected wallet instead'}
          </button>
        </>
      )}
    </span>
  ) : null;

  const registration = useMemo(() => {
    if (!depAddr || !deployers) return null;
    return deployers.find((d) => d.deployer.toLowerCase() === depAddr.toLowerCase()) ?? null;
  }, [depAddr, deployers]);

  const fieldErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    for (const [k, type] of template.keywords) {
      const e = validateField(values[k] ?? '', type);
      if (e) errs[k] = e;
    }
    return errs;
  }, [template, values]);

  const missing = useMemo(
    () => template.keywords.filter(([k]) => !(values[k] ?? '').length).map(([k, t]) => fieldLabel(k, t)),
    [template, values]
  );
  const complete = missing.length === 0 && Object.keys(fieldErrors).length === 0;

  const encodedValues = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, type] of template.keywords) {
      const raw = values[k] ?? '';
      out[k] = type === 'dateTime' && raw ? toTemplateStamp(raw) : normalizeValue(raw, type);
    }
    return out;
  }, [template, values]);

  // what people read: same values, but stamps like 20260911-2314 become
  // "2026-09-11 23:14 UTC". The chain action always uses encodedValues.
  const displayValues = useMemo(() => {
    const out: Record<string, string> = { ...encodedValues };
    for (const [k, type] of template.keywords) {
      if (type === 'dateTime' && out[k]) out[k] = stampToUtcLabel(out[k]);
    }
    return out;
  }, [template, encodedValues]);

  async function forge() {
    // connect first: the button says "Connect wallet" when disconnected,
    // so it must work regardless of form completeness
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (deployers !== null && !registration) return; // setup below first
    if (!complete) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setResult(null);
    startFaviconSpin();
    if (!registration) return;
    const action = buildRegisterAction(
      registration.venue,
      template.id,
      template.keywords.map(([k]) => [k, encodedValues[k]] as [string, string]),
      String(feeScale)
    );
    try {
      const res = await sendExchange(signL1, action);
      const bodyText = JSON.stringify(res.body);
      if (res.ok) {
        const structural = deepFindOutcome(res.body);
        const idMatch = bodyText.match(/"outcome"\s*:\s*(\d+)/);
        const id = structural ?? (idMatch ? Number(idMatch[1]) : undefined);
        onForged({
          outcomeId: id,
          templateId: template.id,
          title: renderTemplate(template.name, displayValues),
          description: renderTemplate(template.description, displayValues),
          sideNames: template.role.standaloneOutcome!.sideNames.map((n) =>
            renderTemplate(n, displayValues)
          ) as [string, string],
          values: encodedValues,
          deployedAt: new Date().toISOString(),
        });
        setResult({ ok: true, text: 'Market deployed.', raw: bodyText, id });
        invalidateWalletReadiness();
      } else {
        setResult({ ok: false, text: friendlyError(bodyText), raw: bodyText });
      }
    } catch (e) {
      const raw = errText(e);
      setResult({ ok: false, text: friendlyError(raw), raw });
    } finally {
      inFlight.current = false;
      setSending(false);
      stopFaviconSpin();
    }
  }

  return (
    <div>
      <button className="linkbtn" onClick={onBack} style={{ marginBottom: 18 }}>
        ← all templates
      </button>

      <div className="wizard-grid">
        {/* form card */}
        <div className="card-soft" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <span className="mono" style={{ color: 'var(--qn-foreground-light)' }}>step 2 of 3</span>
            <h2 style={{ fontSize: 22, textTransform: 'capitalize', marginTop: 4 }}>{friendlyName(template)}</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-60)', marginTop: 4 }}>
              Fill the blanks. The ticket on the right is exactly what goes on chain.
            </p>
          </div>

          {orderedKeywords(template.keywords).map(([k, type]) => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{fieldLabel(k, type)}</span>
              {type === 'hlPerp' ? (
                <select value={values[k] ?? ''} onChange={(e) => setValues((s) => ({ ...s, [k]: e.target.value }))}>
                  <option value="">Choose an asset</option>
                  {perps.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              ) : type === 'dateTime' ? (
                <TimeField value={values[k] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [k]: v }))} />
              ) : (
                <input
                  type="text"
                  inputMode={type === 'uDecimal' || type === 'uInt' ? 'decimal' : 'text'}
                  data-invalid={!!fieldErrors[k]}
                  placeholder={fieldLabel(k, type)}
                  value={values[k] ?? ''}
                  onChange={(e) => setValues((s) => ({ ...s, [k]: e.target.value }))}
                />
              )}
              {fieldErrors[k] ? (
                <span style={{ fontSize: 12, color: 'var(--red)' }}>{fieldErrors[k]}</span>
              ) : type === 'dateTime' && values[k] ? (
                <span style={{ fontSize: 12, color: 'var(--ink-60)' }}>
                  Settles {stampToUtcLabel(encodedValues[k])}
                </span>
              ) : fieldHelp(k, type) ? (
                <span style={{ fontSize: 12, color: 'var(--ink-40)' }}>{fieldHelp(k, type)}</span>
              ) : null}
            </label>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
            <button
              className="btn"
              disabled={
                sending ||
                (deployers !== null && !registration) ||
                (isConnected && !!registration && !complete)
              }
              title={
                deployers !== null && !registration
                  ? 'Complete the deployer setup below first'
                  : undefined
              }
              onClick={forge}
            >
              {sending
                ? 'Waiting…'
                : !isConnected
                  ? 'Connect wallet'
                  : deployers !== null && !registration
                    ? 'Finish setup below to deploy'
                    : 'Deploy market'}
            </button>
            {isConnected && !!registration && !complete && (
              <span style={{ fontSize: 12.5, color: 'var(--ink-40)' }}>
                {missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'Fix highlighted fields'}
              </span>
            )}
          </div>
          {/* preflight: what this deploy costs, earns, and commits you to */}
          <div className="card-soft" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="mono" style={{ color: 'var(--qn-foreground-light)' }}>before you sign</span>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
              <span style={{ color: 'var(--qn-foreground-medium)' }}>Deploy fee</span>
              <span style={{ fontWeight: 600 }}>Free</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
              <span style={{ color: 'var(--qn-foreground-medium)' }}>Stake required</span>
              <span style={{ fontWeight: 600, textAlign: 'right' }}>
                100 testnet HYPE, one time
                {registration && (
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--highlight)' }}>
                    deployer registered ("{registration.venue}")
                  </span>
                )}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
              <span style={{ color: 'var(--qn-foreground-medium)' }}>Capacity</span>
              <span style={{ fontWeight: 600 }}>1 of 10 active slots · counts toward 50/day</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', fontSize: 13 }}>
              <span style={{ color: 'var(--qn-foreground-medium)' }}>
                Your fee on closing trades
                <span style={{ display: 'block', fontSize: 12, color: 'var(--qn-foreground-light)' }}>
                  opens are free; closes pay (you + protocol) × 0.07% of notional
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  value={feeScale}
                  onChange={(e) => setFeeScale(Number(e.target.value))}
                  aria-label="Deployer fee scale"
                  style={{ width: 74 }}
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}x
                    </option>
                  ))}
                </select>
                <span className="num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {(feeScale * 0.07).toFixed(2)}%
                </span>
              </span>
            </div>

            <p style={{ fontSize: 12, color: 'var(--qn-foreground-light)', margin: 0 }}>
              You settle this market after {values.time ? stampToUtcLabel(encodedValues.time) : 'its deadline'}.
              Wrong settlements can slash your stake.
            </p>

            {deployers !== null && !registration && (
              <div style={{ borderTop: '1px solid var(--qn-border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="mono" style={{ color: 'var(--qn-foreground-light)' }}>become a deployer</span>
                  {depReadiness && (
                    <span className="data" style={{ color: 'var(--qn-foreground-medium)' }}>
                      deployer: spot {depReadiness.spotHype.toFixed(2)} · staked {depReadiness.stakedHype.toFixed(2)} HYPE
                    </span>
                  )}
                </div>

                {/* progress rail: done stations are peekable, the rest is status */}
                <div className="setup-rail" role="list" aria-label="Deployer setup progress">
                  {(['derive', 'fund', 'stake', 'venue'] as const).map((label, idx) => {
                    const n = idx + 1;
                    const state = n < setupStep ? 'done' : n === setupStep ? 'current' : 'future';
                    return (
                      <span key={label} style={{ display: 'contents' }}>
                        {idx > 0 && <span className="setup-link" data-done={n <= setupStep} />}
                        <button
                          className="setup-station"
                          data-state={state}
                          data-peeked={peek === n}
                          disabled={state === 'future'}
                          title={state === 'done' ? 'View this step' : undefined}
                          onClick={() => setPeek(n === setupStep ? null : state === 'done' ? n : null)}
                        >
                          <span className="disc">{state === 'done' ? '✓' : n}</span>
                          <span className="lbl">{label}</span>
                        </button>
                      </span>
                    );
                  })}
                </div>

                <div className="card-soft" style={{ padding: 14, background: 'var(--qn-background)', fontSize: 12.5, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {peek !== null && peek !== setupStep && (
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <span className="mono" style={{ color: 'var(--qn-foreground-light)' }}>step {peek} · done ✓</span>
                      <button className="linkbtn" onClick={() => setPeek(null)}>back to step {setupStep} →</button>
                    </span>
                  )}

                  {shownStep === 1 &&
                    (!depAddr ? (
                      <>
                        <span>
                          <strong>Create or recover your deployer.</strong> Hyperliquid requires deployer
                          actions to be signed by the deployer account itself, and browser wallets can't
                          produce those signatures. One ordinary signature derives a deployer account from
                          your wallet: the same wallet always re-derives the same account, on any browser.
                        </span>
                        <button className="btn-line" style={{ alignSelf: 'flex-start' }} disabled={!isConnected || deriving} onClick={derive}>
                          {deriving ? 'Waiting for signature…' : isConnected ? 'Create or recover deployer' : 'Connect wallet first'}
                        </button>
                      </>
                    ) : (
                      <>
                        <span><strong>Deployer derived.</strong></span>
                        {addressChip}
                        {derivedNote}
                      </>
                    ))}

                  {shownStep === 2 && (
                    <>
                      <span>
                        <strong>Fund the deployer.</strong> Send it <strong>100.5+ HYPE on Hypercore</strong>{' '}
                        (
                        <a href="https://app.hyperliquid-testnet.xyz/portfolio" target="_blank" rel="noreferrer" style={{ color: 'var(--highlight)' }}>
                          testnet app
                        </a>{' '}
                        → Portfolio → Send):
                      </span>
                      {addressChip}
                      {derivedNote}
                      {!depFunded && isConnected && readiness && evmHype > 0 && readiness.spotHype < 100 && (
                        <span style={{ color: 'var(--qn-foreground-medium)' }}>
                          Your wallet's {evmHype.toFixed(2)} HYPE is on HyperEVM, a separate ledger. On the{' '}
                          <a href="https://app.hyperliquid-testnet.xyz/portfolio" target="_blank" rel="noreferrer" style={{ color: 'var(--highlight)' }}>
                            testnet portfolio
                          </a>
                          , use Transfer → EVM to Core first.
                        </span>
                      )}
                      {!depFunded && isConnected && readiness && readiness.exists && readiness.spotHype < 100 && (
                        <span style={{ color: 'var(--qn-foreground-medium)' }}>
                          Short on HYPE? Get mock USDC from the{' '}
                          <a href="https://app.hyperliquid-testnet.xyz/drip" target="_blank" rel="noreferrer" style={{ color: 'var(--highlight)' }}>
                            faucet
                          </a>{' '}
                          and buy the rest on the{' '}
                          <a href="https://app.hyperliquid-testnet.xyz/trade" target="_blank" rel="noreferrer" style={{ color: 'var(--highlight)' }}>
                            spot market
                          </a>
                          .
                        </span>
                      )}
                      {depFunded && <span style={{ color: 'var(--highlight)' }}>✓ funded</span>}
                    </>
                  )}

                  {shownStep === 3 && (
                    <>
                      <span>
                        <strong>Stake 100 HYPE from the deployer.</strong> This is the deployer bond: it stays
                        yours, backs your settlements, and can be slashed for dishonest ones. Unstaking later
                        takes about 7 days. Signs silently.
                      </span>
                      <button
                        className="btn-line"
                        style={{ alignSelf: 'flex-start' }}
                        disabled={!!setupBusy || depStaked || !depReadiness || depReadiness.spotHype < 100}
                        onClick={() => runSetup('stake')}
                      >
                        {depStaked ? '✓ 100 HYPE staked' : setupBusy === 'stake' ? 'Staking…' : 'Stake 100 HYPE'}
                      </button>
                    </>
                  )}

                  {shownStep === 4 && (
                    <>
                      <span>
                        <strong>Claim your venue.</strong> 2 to 4 lowercase letters. It labels every market you
                        deploy on the public board, and it's permanent. Signs silently.
                      </span>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          placeholder="venue name"
                          value={venue}
                          maxLength={4}
                          onChange={(e) => setVenue(e.target.value.toLowerCase().replace(/[^a-z]/g, ''))}
                          style={{ width: 140, height: 36, padding: '0 10px' }}
                        />
                        <button
                          className="btn-line"
                          disabled={!!setupBusy || !depStaked || venue.length < 2}
                          onClick={() => runSetup('venue')}
                        >
                          {setupBusy === 'venue' ? 'Claiming…' : 'Claim venue'}
                        </button>
                      </span>
                    </>
                  )}
                </div>

                {setupMsg && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12.5, color: setupMsg.ok ? 'var(--highlight)' : 'var(--red)' }}>{setupMsg.text}</span>
                    {setupMsg.raw && (
                      <details>
                        <summary className="mono" style={{ cursor: 'pointer', color: 'var(--ink-40)' }}>raw response</summary>
                        <span className="data" style={{ color: 'var(--ink-60)' }}>{setupMsg.raw.slice(0, 400)}</span>
                      </details>
                    )}
                  </div>
                )}
                <span style={{ fontSize: 11.5, color: 'var(--qn-foreground-light)' }}>
                  Your wallet signs once to derive the deployer and once to fund it. Everything else signs silently.
                </span>
              </div>
            )}

            {registration && depAddr && (
              <div style={{ borderTop: '1px solid var(--qn-border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="mono" style={{ color: 'var(--qn-foreground-light)' }}>your deployer · venue "{registration.venue}"</span>
                  {depReadiness && (
                    <span className="data" style={{ color: 'var(--qn-foreground-medium)' }}>
                      spot {depReadiness.spotHype.toFixed(2)} · staked {depReadiness.stakedHype.toFixed(2)} HYPE
                    </span>
                  )}
                </div>
                {addressChip}
                {derivedNote}
              </div>
            )}

          </div>

          {result && (
            <div
              className="card-soft"
              style={{
                padding: 14,
                borderColor: result.ok ? 'var(--yes)' : 'var(--red)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span style={{ fontWeight: 600, color: result.ok ? 'var(--yes)' : 'var(--red)' }}>
                {result.ok ? `Market deployed${result.id !== undefined ? ` · #${result.id}` : ''}` : result.text}
              </span>
              {result.ok && (
                <>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-60)' }}>
                    Step 3 comes later: after the settlement time, come back and post the result.
                    Your market lives in Live markets → Mine until then.
                  </span>
                  <button className="btn-line" style={{ alignSelf: 'flex-start' }} onClick={onViewMine}>
                    View my market →
                  </button>
                </>
              )}
              {result.raw && (
                <details>
                  <summary className="mono" style={{ cursor: 'pointer', color: 'var(--ink-40)' }}>
                    raw response
                  </summary>
                  <span className="data" style={{ color: 'var(--ink-60)' }}>{result.raw.slice(0, 500)}</span>
                </details>
              )}
            </div>
          )}
        </div>

        {/* ticket */}
        <div style={{ position: 'sticky', top: 90 }}>
          <Ticket
            templateId={template.id}
            name={template.name}
            description={template.description}
            sideNames={template.role.standaloneOutcome!.sideNames}
            values={displayValues}
            complete={complete}
          />
        </div>
      </div>
    </div>
  );
}
