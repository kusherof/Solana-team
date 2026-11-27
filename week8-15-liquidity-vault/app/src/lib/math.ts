/**
 * Те же формулы, что в контракте (programs/liquidity-vault/src/math.rs), — для подсказки «получите ≈ …».
 * Округление вниз, как в контракте.
 */
export const MIN_DEPOSIT_TOKENS = 1n; // constants.rs: MIN_DEPOSIT_TOKENS
export const MAX_SWAP_BPS = 5000n; // constants.rs: MAX_SWAP_BPS (50%)

export function previewShares(amount: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  if (amount <= 0n) return 0n;
  if (totalShares === 0n || totalAssets === 0n) return amount;
  return (amount * totalShares) / totalAssets;
}

export function previewWithdraw(shares: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  if (shares <= 0n || totalShares === 0n || shares > totalShares) return 0n;
  return (shares * totalAssets) / totalShares;
}

export const minDeposit = (decimals: number) => MIN_DEPOSIT_TOKENS * 10n ** BigInt(decimals);

export const maxSwapIn = (vaultA: bigint) => (vaultA * MAX_SWAP_BPS) / 10_000n;

/** Доля пользователя в процентах с двумя знаками, без float до последнего шага. */
export function sharePercent(shares: bigint, totalShares: bigint): string {
  if (totalShares === 0n) return "—";
  const bp = (shares * 10_000n) / totalShares; // сотые доли процента
  return `${bp / 100n},${(bp % 100n).toString().padStart(2, "0")}%`;
}
