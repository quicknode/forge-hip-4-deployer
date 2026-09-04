/** Map raw exchange/wallet errors to plain sentences. */
export function friendlyError(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes('user rejected') || t.includes('user denied'))
    return 'You dismissed the signature request. Nothing was sent.';
  if (t.includes('stake') || t.includes('deployer'))
    return 'This wallet is not registered as an outcome deployer (100 testnet HYPE staked required).';
  if (t.includes('rate') || t.includes('limit')) return 'Rate limit hit. Try again later.';
  if (t.includes('insufficient')) return 'Insufficient balance on testnet for this action.';
  if (t.includes('already settled')) return 'This market is already settled.';
  return 'The exchange rejected the request.';
}
