'use client';

import { useMemo, useState } from 'react';

/**
 * Settlement-time picker. The native datetime-local calendar is unstylable
 * browser chrome, so this replaces it with two themed selects (day + time,
 * 30-minute grid, past slots for today omitted) and quick-fill chips for the
 * times people actually pick. Value stays in datetime-local format
 * ("YYYY-MM-DDTHH:mm") so the template-stamp encoding is untouched.
 */

const DAYS_AHEAD = 14;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toDatePart(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function roundUpToHalfHour(d: Date): Date {
  const r = new Date(d);
  r.setSeconds(0, 0);
  const m = r.getMinutes();
  if (m === 0 || m === 30) return r;
  if (m < 30) r.setMinutes(30);
  else {
    r.setMinutes(0);
    r.setHours(r.getHours() + 1);
  }
  return r;
}

export default function TimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [datePart, timePart] = value ? value.split('T') : ['', ''];
  const [custom, setCustom] = useState(false);

  const days = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const name = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const prefix = i === 0 ? 'Today · ' : i === 1 ? 'Tomorrow · ' : '';
      out.push({ value: toDatePart(d), label: `${prefix}${name}` });
    }
    // keep a previously chosen day even if it fell out of the window
    if (datePart && !out.some((d) => d.value === datePart)) {
      out.unshift({ value: datePart, label: datePart });
    }
    return out;
  }, [datePart]);

  const times = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    const isToday = datePart === toDatePart(now);
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        if (isToday && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes()))) continue;
        out.push(`${pad(h)}:${pad(m)}`);
      }
    }
    // chip-set or hand-set values may be off the 30-minute grid
    if (timePart && !out.includes(timePart)) out.unshift(timePart);
    return out;
  }, [datePart, timePart]);

  function setFrom(d: Date) {
    onChange(`${toDatePart(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }

  const chips: { label: string; pick: () => Date }[] = [
    { label: 'in 1 hour', pick: () => roundUpToHalfHour(new Date(Date.now() + 60 * 60 * 1000)) },
    {
      label: 'midnight UTC',
      pick: () => {
        const d = new Date();
        d.setUTCHours(24, 0, 0, 0);
        return d;
      },
    },
    { label: 'in 24 hours', pick: () => roundUpToHalfHour(new Date(Date.now() + 24 * 60 * 60 * 1000)) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select
          aria-label="Settlement day"
          value={datePart}
          onChange={(e) => onChange(`${e.target.value}T${timePart || '12:00'}`)}
          style={{ flex: '1 1 150px', minWidth: 150 }}
        >
          <option value="" disabled>
            day
          </option>
          {days.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Settlement time"
          value={timePart}
          onChange={(e) => onChange(`${datePart || toDatePart(new Date())}T${e.target.value}`)}
          style={{ flex: '0 1 110px', minWidth: 96 }}
        >
          <option value="" disabled>
            time
          </option>
          {times.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            className="linkbtn"
            style={{
              border: '1px solid var(--qn-border)',
              borderRadius: 'var(--qn-radius-sm)',
              padding: '3px 10px',
              fontSize: 12,
            }}
            onClick={() => setFrom(c.pick())}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          className="linkbtn"
          style={{
            border: '1px solid var(--qn-border)',
            borderRadius: 'var(--qn-radius-sm)',
            padding: '3px 10px',
            fontSize: 12,
            background: custom ? 'var(--qn-hover)' : undefined,
          }}
          onClick={() => setCustom((v) => !v)}
        >
          custom…
        </button>
      </div>
      {custom && (
        <input
          type="datetime-local"
          aria-label="Custom settlement time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ maxWidth: 260 }}
        />
      )}
    </div>
  );
}
