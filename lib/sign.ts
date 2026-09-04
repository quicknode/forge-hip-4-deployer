import { encode } from '@msgpack/msgpack';
import { keccak256 } from 'ethers';

/**
 * Hyperliquid L1 action signing primitives: keccak(msgpack(action) ||
 * nonce_u64_be || 0x00) becomes the connectionId of a phantom Agent,
 * signed via EIP-712 on chainId 1337. Source "b" selects testnet.
 * The wallet (via wagmi signTypedData) produces the signature.
 */

export type L1Signature = { r: string; s: string; v: number };

export const L1_DOMAIN = {
  name: 'Exchange',
  version: '1',
  chainId: 1337,
  verifyingContract: '0x0000000000000000000000000000000000000000',
} as const;

export const AGENT_TYPES = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
} as const;

export function actionHash(action: unknown, nonce: number): string {
  const packed = encode(action);
  const data = new Uint8Array(packed.length + 9);
  data.set(packed);
  const view = new DataView(data.buffer);
  view.setBigUint64(packed.length, BigInt(nonce), false);
  data[packed.length + 8] = 0x00; // no vault address
  return keccak256(data);
}

export function splitSig(sig: string): L1Signature {
  if (typeof sig !== 'string' || sig.length !== 132 || !sig.startsWith('0x')) {
    throw new Error(`unexpected signature format (length ${sig?.length})`);
  }
  let v = parseInt(sig.slice(130, 132), 16);
  if (v < 27) v += 27; // some wallets return 0/1
  return {
    r: sig.slice(0, 66),
    s: '0x' + sig.slice(66, 130),
    v,
  };
}
