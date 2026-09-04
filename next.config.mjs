/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Unused wallet connectors pulled in transitively declare optional imports
    // that aren't installed (Coinbase's @x402/*, MetaMask's React Native
    // storage, WalletConnect's pino-pretty). Stub them so the build is warning-free.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
      '@x402/evm/upto/client': false,
      '@x402/evm/exact/client': false,
      '@x402/core/client': false,
      '@x402/svm/exact/client': false,
      '@x402/evm': false,
      '@x402/svm': false,
      '@x402/core': false,
    };
    return config;
  },
};

export default nextConfig;
