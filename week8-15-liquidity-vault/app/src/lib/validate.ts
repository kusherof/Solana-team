/** Проверка ввода до отправки транзакции: кнопка выключена и видно почему. */
import { formatAmount, parseAmount } from "./amount";
import { minDeposit, previewShares, previewWithdraw } from "./math";

export type Check = { raw?: bigint; out?: bigint; error?: string };

type VaultNums = { decimals: number; totalAssets: bigint; totalShares: bigint };

export function checkDeposit(input: string, balance: bigint, v: VaultNums): Check {
  const p = parseAmount(input, v.decimals);
  if (!p.ok) return { error: p.error };
  const raw = p.raw!;
  if (raw === 0n) return { raw, error: "Сумма должна быть больше нуля" };
  if (raw < minDeposit(v.decimals)) return { raw, error: "Минимальный депозит — 1 токен" };
  if (raw > balance) return { raw, error: `У вас только ${formatAmount(balance, v.decimals)} A` };
  const out = previewShares(raw, v.totalAssets, v.totalShares);
  if (out === 0n) return { raw, out, error: "Слишком мало: за эту сумму вы получите 0 share" };
  return { raw, out };
}

export function checkWithdraw(input: string, shares: bigint, v: VaultNums): Check {
  const p = parseAmount(input, v.decimals);
  if (!p.ok) return { error: p.error };
  const raw = p.raw!;
  if (raw === 0n) return { raw, error: "Сумма должна быть больше нуля" };
  if (raw > shares) return { raw, error: `У вас только ${formatAmount(shares, v.decimals)} share` };
  const out = previewWithdraw(raw, v.totalAssets, v.totalShares);
  if (out === 0n) return { raw, out, error: "Слишком мало: за это количество share вы получите 0 токенов" };
  return { raw, out };
}
