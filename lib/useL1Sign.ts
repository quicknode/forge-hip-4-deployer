'use client';

import { deployerSigner } from './agent';
import type { SignTypedDataFn } from './hl';

/**
 * Deployer-class actions (deploy, settle, activate) must be signed by the
 * deployer ACCOUNT — Hyperliquid does not accept agent signatures for them,
 * and browser wallets reject the phantom chainId-1337 domain. The local
 * deployer key signs as its own funded account.
 */
export function useL1Sign(): SignTypedDataFn {
  return deployerSigner();
}
