'use client';

import { hexlify, keccak256, toUtf8Bytes, Wallet } from 'ethers';

import { actionHash, AGENT_TYPES, L1_DOMAIN, splitSig } from './sign';
import type { SignTypedDataFn } from './hl';

/**
 * The deployer key. Hyperliquid only lets agents sign TRADING actions;
 * deployer-class actions (activateOutcomeDeployer, spotDeploy, settle) must
 * be signed by the deployer account itself — an agent-signed attempt comes
 * back as "Must deposit before performing actions. User: <agent>". Browser
 * wallets can't sign those either (they reject the phantom chainId-1337
 * domain). So Forge does what real HIP-4 operators do: a dedicated key IS
 * the deployer account. It lives in localStorage, you fund it once from any
 * wallet, and it signs everything silently. Testnet only — back it up.
 */

const KEY = 'forge:deployer-key';
const DERIVED_FROM = 'forge:deployer-derived-from';

const TESTNET_EXCHANGE = 'https://api.hyperliquid-testnet.xyz/exchange';

/**
 * The deployer key is DERIVED from one wallet signature over this fixed
 * message (RFC 6979 makes the signature deterministic), so the same wallet
 * always re-derives the same deployer account — any browser, any machine.
 * The wallet can't BE the deployer (it refuses the phantom L1 domain), so it
 * becomes the seed instead. localStorage is only a cache.
 */
export const DERIVE_MESSAGE =
  'Forge deployer key v1\n\n' +
  'Signing this derives your Forge deployer account on Hyperliquid TESTNET. ' +
  'The derived key can stake, deploy, and settle outcome markets. ' +
  'Only sign this on a Forge app you trust.';

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

export async function deriveDeployerKey(provider: Eip1193, master: string): Promise<string> {
  const sig = (await provider.request({
    method: 'personal_sign',
    params: [hexlify(toUtf8Bytes(DERIVE_MESSAGE)), master],
  })) as string;
  const pk = keccak256(sig);
  localStorage.setItem(KEY, pk);
  localStorage.setItem(DERIVED_FROM, master.toLowerCase());
  return new Wallet(pk).address;
}

export function getDeployerWallet(): Wallet {
  const pk = localStorage.getItem(KEY);
  if (!pk) throw new Error('NO_DEPLOYER_KEY');
  return new Wallet(pk);
}

/** Address of the stored deployer key, or null if none exists yet. */
export function storedDeployerAddress(): string | null {
  try {
    const pk = localStorage.getItem(KEY);
    return pk ? new Wallet(pk).address : null;
  } catch {
    return null;
  }
}

/** Wallet this key was derived from (null for legacy random keys). */
export function derivedFromAddress(): string | null {
  try {
    return localStorage.getItem(DERIVED_FROM);
  } catch {
    return null;
  }
}

/** Private key, for the backup affordance. It holds the stake — losing the
 * browser profile without a backup means losing access to the deployer. */
export function exportDeployerKey(): string {
  return getDeployerWallet().privateKey;
}

/** L1 signer backed by the deployer key — matches sendExchange's contract. */
export function deployerSigner(): SignTypedDataFn {
  return async ({ domain, types, message }) => {
    const wallet = getDeployerWallet();
    return wallet.signTypedData(domain, { Agent: [...types.Agent] }, message);
  };
}

async function postExchange(action: Record<string, unknown>, nonce: number, signature: unknown) {
  const res = await fetch(TESTNET_EXCHANGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature }),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  const ok = res.ok && !(typeof body === 'object' && body !== null && (body as { status?: string }).status === 'err');
  return { ok, body };
}

/**
 * User-signed action, signed BY the deployer key acting as its own account.
 * No wallet popup: the key signs typed data directly.
 */
async function deployerUserSigned(
  primaryType: string,
  fields: { name: string; type: string }[],
  actionBase: Record<string, unknown>
) {
  const wallet = getDeployerWallet();
  const chainId = 998; // HyperEVM testnet; any chain the signer picks is fine
  const nonce = Date.now();
  const action = {
    ...actionBase,
    signatureChainId: '0x3e6',
    hyperliquidChain: 'Testnet',
    nonce,
  };
  const sig = await wallet.signTypedData(
    {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    {
      [primaryType]: [
        { name: 'hyperliquidChain', type: 'string' },
        ...fields,
        { name: 'nonce', type: 'uint64' },
      ],
    },
    action
  );
  return postExchange(action, nonce, splitSig(sig));
}

/** Stake HYPE from the deployer key's spot balance (wei = HYPE x 1e8). */
export async function stakeAsDeployer(amountHype: number) {
  return deployerUserSigned(
    'HyperliquidTransaction:CDeposit',
    [{ name: 'wei', type: 'uint64' }],
    { type: 'cDeposit', wei: Math.round(amountHype * 1e8) }
  );
}

/** Claim a venue name (L1 action, signed by the deployer key as itself). */
export async function activateVenue(venueName: string) {
  const action = {
    type: 'activateOutcomeDeployer',
    activate: { venueName: venueName.trim().toLowerCase() },
  };
  const nonce = Date.now();
  const wallet = getDeployerWallet();
  const hash = actionHash(action, nonce) as `0x${string}`;
  const sig = await wallet.signTypedData(L1_DOMAIN, { Agent: [...AGENT_TYPES.Agent] }, {
    source: 'b',
    connectionId: hash,
  });
  return postExchange(action, nonce, splitSig(sig));
}
