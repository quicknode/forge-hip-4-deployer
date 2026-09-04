'use client';

import { useMemo, useRef, useState } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

import { useL1Sign } from '../lib/useL1Sign';

import {
  buildRegisterAction,
  renderTemplate,
  sendExchange,
  stampToUtcLabel,
  toTemplateStamp,
  type OutcomeTemplate,
} from '../lib/hl';
import { friendlyError } from '../lib/errors';
import { fieldHelp, fieldLabel, friendlyName, normalizeValue, orderedKeywords, validateField } from '../lib/templates';

import Ticket from './Ticket';

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
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const signL1 = useL1Sign();

  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; raw?: string; id?: number } | null>(null);
  const inFlight = useRef(false);

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

  async function forge() {
    // connect first: the button says "Connect wallet" when disconnected,
    // so it must work regardless of form completeness
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!complete) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setResult(null);
    const action = buildRegisterAction(
      template.id,
      template.keywords.map(([k]) => [k, encodedValues[k]] as [string, string])
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
          title: renderTemplate(template.name, encodedValues),
          description: renderTemplate(template.description, encodedValues),
          sideNames: template.role.standaloneOutcome!.sideNames,
          values: encodedValues,
          deployedAt: new Date().toISOString(),
        });
        setResult({ ok: true, text: 'Market deployed.', raw: bodyText, id });
      } else {
        setResult({ ok: false, text: friendlyError(bodyText), raw: bodyText });
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setResult({ ok: false, text: friendlyError(raw), raw });
    } finally {
      inFlight.current = false;
      setSending(false);
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
                <input
                  type="datetime-local"
                  value={values[k] ?? ''}
                  onChange={(e) => setValues((s) => ({ ...s, [k]: e.target.value }))}
                />
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
            <button className="btn" disabled={(!complete && isConnected) || sending} onClick={forge}>
              {sending ? 'Waiting for signature…' : isConnected ? 'Deploy market' : 'Connect wallet'}
            </button>
            {!complete && (
              <span style={{ fontSize: 12.5, color: 'var(--ink-40)' }}>
                {missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'Fix highlighted fields'}
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-40)' }}>
            Deploying requires 100 testnet HYPE staked as an outcome deployer. You are responsible
            for settling this market honestly; wrong settlements can be slashed.
          </p>

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
            values={encodedValues}
            complete={complete}
          />
        </div>
      </div>
    </div>
  );
}
