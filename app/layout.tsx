import type { Metadata } from 'next';

import Providers from './providers';
import './globals.css';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5210';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'Forge: got a question? Make it a market.',
  description:
    'Deploy HIP-4 outcome markets on Hyperliquid testnet. Pick a validator-approved format, fill in the blanks, sign with your wallet, and the crowd trades yes against no until you settle it. Chain reads served by Quicknode.',
  openGraph: {
    title: 'Forge: got a question? Make it a market.',
    description:
      'Deploy HIP-4 outcome markets on Hyperliquid testnet. Fill in the blanks, sign, and the crowd trades the answer.',
    siteName: 'Forge',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Forge: got a question? Make it a market.',
    description:
      'Deploy HIP-4 outcome markets on Hyperliquid testnet. Fill in the blanks, sign, and the crowd trades the answer.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
