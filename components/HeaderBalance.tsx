'use client';

import { useAccount } from 'wagmi';

import { useWalletReadiness } from '../lib/useWalletReadiness';

function fmt(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(2);
}

/**
 * Hypercore spot HYPE, one glanceable chip. Staked lives in the tooltip;
 * the wizard preflight owns the full breakdown. Click refreshes.
 */
export default function HeaderBalance() {
  const { address, isConnected } = useAccount();
  const { status, data, refresh } = useWalletReadiness(address);

  if (!isConnected || status === 'error') return null;

  const loading = status === 'loading' || !data;
  return (
    <button
      className="chip hdr-balance"
      onClick={refresh}
      disabled={loading}
      aria-live="polite"
      title={
        !data
          ? 'Loading Hypercore balance'
          : data.exists
            ? `Hypercore spot ${data.spotHype.toFixed(2)} · staked ${data.stakedHype.toFixed(2)} HYPE. Click to refresh.`
            : 'No Hyperliquid testnet account yet. Open a template to see the funding steps.'
      }
      style={{
        cursor: 'pointer',
        color: data && !data.exists ? 'var(--qn-foreground-light)' : undefined,
      }}
    >
      <span className="data" style={{ wordBreak: 'normal' }}>
        {loading ? '·····' : fmt(data.spotHype)}
      </span>
      <span>HYPE</span>
    </button>
  );
}
