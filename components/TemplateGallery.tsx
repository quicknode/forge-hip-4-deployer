'use client';

import { useMemo } from 'react';

import type { OutcomeTemplate } from '../lib/hl';
import { exampleQuestion, groupTemplates, resolveSides, type TemplateFamily } from '../lib/templates';

const KIND_ORDER = ['price', 'sports', 'rates', 'numbers'];

/**
 * One card per market TYPE. The registry ships every historical variant
 * (binaryPrice..6, sportsContestWinner..7); groupTemplates collapses them and
 * picks the variant to deploy. Six families fill the grid in even rows, so
 * there are no orphan cards or half-empty sections.
 */
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
  const families = useMemo(() => {
    const fams = groupTemplates(templates);
    return fams.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  }, [templates]);

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
      {families.map((f) => (
        <FamilyCard key={f.key} family={f} onSelect={onSelect} />
      ))}
    </div>
  );
}

function FamilyCard({ family, onSelect }: { family: TemplateFamily; onSelect: (id: string) => void }) {
  const t = family.pick;
  return (
    <button className="mktcard" onClick={() => onSelect(t.id)}>
      <div className="body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17 }}>{family.name}</span>
          <span className="chip">{family.kind}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-60)' }}>
          {family.hint}
          {family.count > 1 ? ` · ${family.count} variants` : ''}
        </div>

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
  );
}
