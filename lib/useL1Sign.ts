'use client';

import { useAccount } from 'wagmi';

import type { SignTypedDataFn } from './hl';

/**
 * Hyperliquid L1 actions sign against a phantom EIP-712 domain with
 * chainId 1337 regardless of the wallet's connected chain. viem (>=2.5x)
 * rejects that mismatch in wagmi's signTypedData, so we sign through the
 * connector's raw EIP-1193 provider with eth_signTypedData_v4, which
 * wallets accept without a chain switch.
 */
export function useL1Sign(): SignTypedDataFn {
  const { address, connector } = useAccount();

  return async ({ domain, types, primaryType, message }) => {
    if (!address || !connector) throw new Error('Wallet not connected.');
    const provider = (await connector.getProvider()) as {
      request: (args: { method: string; params: unknown[] }) => Promise<unknown>;
    };
    const payload = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        ...types,
      },
      primaryType,
      domain,
      message,
    };
    const sig = (await provider.request({
      method: 'eth_signTypedData_v4',
      params: [address, JSON.stringify(payload)],
    })) as string;
    return sig;
  };
}
