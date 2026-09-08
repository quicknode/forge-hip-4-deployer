'use client';

import { useEffect, useReducer } from 'react';

import { fetchWalletReadiness, type WalletReadiness } from './hl';

/**
 * Shared Hypercore balance state (spot + staked HYPE). One cache feeds both
 * the header chip and the wizard preflight so they can never disagree.
 * Fetches on connect/address change, refetches on window focus (30s stale),
 * never polls. Mutations call invalidateWalletReadiness().
 */

type Entry = {
  status: 'loading' | 'ok' | 'error';
  data: WalletReadiness | null;
  fetchedAt: number;
};

const cache = new Map<string, Entry>();
const subscribers = new Set<() => void>();
const inflight = new Set<string>();

const STALE_MS = 30_000;

function notify() {
  subscribers.forEach((fn) => fn());
}

async function load(address: string, force = false) {
  const key = address.toLowerCase();
  const existing = cache.get(key);
  if (inflight.has(key)) return;
  if (!force && existing?.status === 'ok' && Date.now() - existing.fetchedAt < STALE_MS) return;
  inflight.add(key);
  if (!existing) cache.set(key, { status: 'loading', data: null, fetchedAt: 0 });
  notify();
  try {
    const data = await fetchWalletReadiness(key);
    cache.set(key, { status: 'ok', data, fetchedAt: Date.now() });
  } catch {
    // keep last good data if we had it; otherwise mark error
    const prev = cache.get(key);
    cache.set(key, {
      status: prev?.data ? 'ok' : 'error',
      data: prev?.data ?? null,
      fetchedAt: prev?.fetchedAt ?? 0,
    });
  } finally {
    inflight.delete(key);
    notify();
  }
}

/** Call after any balance-moving mutation (stake, venue claim, deploy). */
export function invalidateWalletReadiness() {
  for (const key of cache.keys()) void load(key, true);
}

export function useWalletReadiness(address: string | undefined) {
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    subscribers.add(force);
    return () => {
      subscribers.delete(force);
    };
  }, []);

  useEffect(() => {
    if (!address) return;
    void load(address);
    const onFocus = () => void load(address);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [address]);

  const entry = address ? cache.get(address.toLowerCase()) : undefined;
  return {
    status: entry?.status ?? 'loading',
    data: entry?.data ?? null,
    refresh: () => address && void load(address, true),
  };
}
