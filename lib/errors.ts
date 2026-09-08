/** Serialize any thrown value into readable text (wallets throw objects). */
export function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Map raw exchange/wallet errors to plain sentences. */
export function friendlyError(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes('4001') || t.includes('user rejected') || t.includes('user denied'))
    return 'You dismissed the signature request. Nothing was sent.';
  if (t.includes('one_tap_required') || t.includes('chainid') || t.includes('chain id'))
    return 'Enable one-tap signing first. Modern wallets block Hyperliquid signing directly, so Forge signs with your approved session key instead.';
  if (t.includes('no_deployer_key'))
    return 'No deployer key yet. Create or recover it in the Create tab (step 1), then retry.';
  if (t.includes('must deposit'))
    return 'The signing account has no funds on Hyperliquid testnet yet. Fund the deployer key (step 1 below), then retry.';
  if (t.includes('does not exist'))
    return 'The exchange does not recognize the signing account. Fund the deployer key and finish setup, then retry.';
  if (t.includes('user rejected') || t.includes('user denied'))
    return 'You dismissed the signature request. Nothing was sent.';
  if (t.includes('stake') || t.includes('deployer'))
    return 'This wallet is not registered as an outcome deployer (100 testnet HYPE staked required).';
  if (t.includes('venue name'))
    return 'Venue names are 2 to 4 lowercase letters only (no digits or symbols).';
  if (t.includes('rate') || t.includes('limit')) return 'Rate limit hit. Try again later.';
  if (t.includes('insufficient')) return 'Insufficient balance on testnet for this action.';
  if (t.includes('already settled')) return 'This market is already settled.';
  return 'The exchange rejected the request.';
}
