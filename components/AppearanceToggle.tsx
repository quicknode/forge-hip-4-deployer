'use client';

import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark';

function systemMode(): Mode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Minimal appearance toggle: a half-filled disc. Follows the OS until the
 * user picks a side; the choice persists. A pre-paint script in layout.tsx
 * applies the stored choice before hydration so there is no flash.
 */
export default function AppearanceToggle() {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('forge:appearance') as Mode | null;
    setMode(stored ?? systemMode());
  }, []);

  function toggle() {
    const next: Mode = (mode ?? systemMode()) === 'dark' ? 'light' : 'dark';
    setMode(next);
    localStorage.setItem('forge:appearance', next);
    document.documentElement.dataset.appearance = next;
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light and dark appearance"
      title="Light / dark"
      className="linkbtn"
      style={{ display: 'inline-flex', alignItems: 'center', padding: 6 }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.5 A6.5 6.5 0 0 1 8 14.5 Z" fill="currentColor" />
      </svg>
    </button>
  );
}
