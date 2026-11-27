/**
 * Суммы токенов: «1,5» ↔ 1500000 (при 6 знаках). Только bigint, без float:
 * у float 0.1 + 0.2 = 0.30000000000000004, а с деньгами так нельзя.
 */
export const U64_MAX = (1n << 64n) - 1n;

export type Parsed = { ok: true; raw: bigint; error?: undefined } | { ok: false; raw?: undefined; error: string };

/** Строка пользователя → целое число минимальных единиц токена. */
export function parseAmount(input: string, decimals: number): Parsed {
  const s = input.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return { ok: false, error: "Введите сумму" };
  if (!/^\d*\.?\d*$/.test(s) || s === ".") return { ok: false, error: "Только цифры и одна точка или запятая, например 1,5" };
  const [whole = "", frac = ""] = s.split(".");
  if (frac.length > decimals) return { ok: false, error: `Не больше ${decimals} знаков после запятой` };
  const raw = BigInt((whole || "0") + frac.padEnd(decimals, "0"));
  if (raw > U64_MAX) return { ok: false, error: "Слишком большая сумма" };
  return { ok: true, raw };
}

/** Целое число минимальных единиц → «1 234,5» (без потерь точности). */
export function formatAmount(raw: bigint, decimals: number, maxFraction = decimals): string {
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = (v / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  let frac = (v % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return (neg ? "-" : "") + whole + (frac ? "," + frac : "");
}

/** Для поля ввода: без пробелов-разделителей, с точкой — чтобы parseAmount принял обратно. */
export function toInput(raw: bigint, decimals: number): string {
  return formatAmount(raw, decimals).replace(/ /g, "").replace(",", ".");
}
