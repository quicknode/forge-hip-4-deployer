'use client';

import type { OutcomeTemplate } from '../lib/hl';
import { exampleQuestion, familyKind, friendlyHint, friendlyName, resolveSides } from '../lib/templates';

/** The template gallery: humanized, color-coded by family, zero {placeholders}. */
export default function TemplateGallery({
  templates,
  error,
  onSelect,
  onRetry,
}: {
  templates: OutcomeTemplate[];
  error: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="card-soft" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ color: 'var(--red)' }}>The template registry did not answer.</span>
        <button className="btn-line" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (templates.length === 0) {
    return (
      <div className="card-soft" style={{ padding: 24, color: 'var(--ink-60)' }}>
        Reading the registry from chain…
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
      {templates.map((t) => (
        <button key={t.id} className="mktcard" onClick={() => onSelect(t.id)}>
          <div className="body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17 }}>
                {friendlyName(t)}
              </span>
              <span className="chip">{familyKind(t.id)}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-60)' }}>{friendlyHint(t)}</div>

            <p className="question" style={{ fontWeight: 400, fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--ink-60)' }}>
              &ldquo;{exampleQuestion(t)}&rdquo;
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', alignItems: 'center' }}>
              <span className="odd" data-side="yes">{resolveSides(t)[0]}</span>
              <span className="odd" data-side="no">{resolveSides(t)[1]}</span>
              <span style={{ flex: 1 }} />
              <span className="mono" style={{ color: 'var(--ink-40)' }}>build it →</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
