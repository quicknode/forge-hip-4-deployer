'use client';

import { connectorsForWallets, darkTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { injectedWallet, rabbyWallet } from '@rainbow-me/rainbowkit/wallets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { defineChain } from 'viem';

import '@rainbow-me/rainbowkit/styles.css';

/** HyperEVM testnet: connection target only; L1 actions sign typed data. */
const hyperliquidTestnet = defineChain({
  id: 998,
  name: 'Hyperliquid Testnet',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.hyperliquid-testnet.xyz/evm'] } },
});

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Wallets',
      // injectedWallet covers MetaMask when installed; metaMaskWallet is
      // excluded because without the extension it falls back to WalletConnect,
      // which needs a real projectId.
      wallets: [injectedWallet, rabbyWallet],
    },
  ],
  // projectId is only consumed by WalletConnect-based wallets, none present.
  { appName: 'Forge', projectId: 'forge-local' }
);

const config = createConfig({
  connectors,
  chains: [hyperliquidTestnet],
  transports: { [hyperliquidTestnet.id]: http() },
  ssr: true,
});

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#3ee148',
            accentColorForeground: '#05130a',
            borderRadius: 'medium',
            fontStack: 'system',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
