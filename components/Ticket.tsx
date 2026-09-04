'use client';

import { renderTemplate } from '../lib/hl';

/**
 * The betting slip: live preview of the market. Punch-hole perforations,
 * YES/NO odds chips, a rubber stamp when it's ready. The artifact people
 * screenshot.
 */
export default function Ticket({
  templateId,
  name,
  description,
  sideNames,
  values,
  complete,
  outcomeId,
  tilt = false,
}: {
  templateId: string;
  name: string;
  description: string;
  sideNames: [string, string];
  values: Record<string, string>;
  complete: boolean;
  outcomeId?: number;
  tilt?: boolean;
}) {
  const title = renderTemplate(name, values);
  const desc = renderTemplate(description, values);
  const filled = !title.includes('{');
  const displayTitle = title.replace(/\{\w+\}/g, '____');
  const displayDesc = desc.replace(/\{\w+\}/g, '____');
  const side = (i: 0 | 1) =>
    renderTemplate(sideNames[i], values).replace(/\{\w+\}/g, '____');

  return (
    <div
      className="card"
      style={{
        transform: tilt ? 'rotate(2deg)' : undefined,
        transition: 'transform 160ms ease',
        overflow: 'visible',
        position: 'relative',
      }}
    >
      {/* header strip */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 18px',
          borderRadius: '18px 18px 0 0',
          background: 'var(--card-2)',
        }}
      >
        <span className="mono" style={{ color: 'var(--ink-60)' }}>outcome market · testnet</span>
        {outcomeId !== undefined ? (
          <span className="stamp stamp-in" style={{ color: 'var(--yes)' }}>live #{outcomeId}</span>
        ) : complete ? (
          <span className="stamp" style={{ color: 'var(--yes)' }}>ready</span>
        ) : (
          <span className="mono" style={{ color: 'var(--ink-40)' }}>draft</span>
        )}
      </div>

      {/* the question */}
      <div style={{ padding: '20px 18px 16px' }}>
        <h2
          style={{
            fontSize: 23,
            color: filled ? 'var(--ink)' : 'var(--ink-40)',
            overflowWrap: 'anywhere',
          }}
        >
          {displayTitle}
        </h2>
        <p style={{ marginTop: 9, fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-60)', overflowWrap: 'anywhere' }}>
          {displayDesc}
        </p>
      </div>

      <div className="punchline" />

      {/* the two sides as odds chips */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 18px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="odd" data-side="yes">{side(0)} → $1</span>
        <span className="odd" data-side="no">{side(1)} → $1</span>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ color: 'var(--ink-40)' }}>{templateId}</span>
      </div>
    </div>
  );
}
