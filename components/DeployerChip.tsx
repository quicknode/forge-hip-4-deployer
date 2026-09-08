'use client';

import { useEffect, useRef, useState } from 'react';

import { derivedFromAddress, exportDeployerKey, storedDeployerAddress } from '../lib/agent';

/**
 * Header access to the deployer key: address, copy, and private-key backup,
 * reachable from anywhere in the app once a key exists. The setup flow can
 * disappear after registration; this never does.
 */
export default function DeployerChip() {
  const [addr, setAddr] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'addr' | 'key' | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => setAddr(storedDeployerAddress()), []);

  useEffect(() => {
    if (!open) return;
    // re-read on open so a key derived this session appears without a reload
    setAddr(storedDeployerAddress());
    setSource(derivedFromAddress());
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function copy(kind: 'addr' | 'key', text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1600);
  }

  if (!addr) return null;

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <button
        className="chip hdr-balance"
        style={{ cursor: 'pointer' }}
        title="Deployer key"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
          <circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7.2 7.2 12 12M10 10l1.6-1.6M11.4 11.4 13 9.8" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        <span className="data" style={{ wordBreak: 'normal' }}>
          {addr.slice(0, 6)}…{addr.slice(-4)}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Deployer key"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 40,
            width: 320,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: 'color-mix(in oklch, var(--qn-background), var(--qn-foreground) 3%)',
            border: '1px solid var(--qn-border)',
            borderRadius: 'var(--qn-radius-md)',
            fontSize: 12.5,
            lineHeight: 1.55,
          }}
        >
          <span className="mono" style={{ color: 'var(--qn-foreground-light)' }}>deployer key</span>
          <code className="data" style={{ userSelect: 'all', overflowWrap: 'anywhere' }}>{addr}</code>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-line" style={{ padding: '5px 12px', fontSize: 12.5 }} onClick={() => copy('addr', addr)}>
              {copied === 'addr' ? '✓ copied' : 'Copy address'}
            </button>
            <button
              className="btn-line"
              style={{ padding: '5px 12px', fontSize: 12.5 }}
              onClick={() => {
                if (window.confirm('Copy the deployer PRIVATE key to the clipboard? It controls the stake. Store it somewhere safe.'))
                  copy('key', exportDeployerKey());
              }}
            >
              {copied === 'key' ? '✓ copied' : 'Backup private key'}
            </button>
          </div>
          <span style={{ color: 'var(--qn-foreground-light)' }}>
            {source
              ? `Derived from ${source.slice(0, 6)}…${source.slice(-4)}. Re-signing with that wallet recovers it on any browser.`
              : 'Random key: it exists only in this browser. Back it up.'}
          </span>
        </div>
      )}
    </div>
  );
}
