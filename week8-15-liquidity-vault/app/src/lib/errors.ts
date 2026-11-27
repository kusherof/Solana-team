/**
 * Ошибки контракта, Raydium, кошелька и сети → понятный русский текст.
 * Коды контракта берём из IDL (порядок в errors.rs: 6000, 6001, …), к ним добавляем подсказку «что делать».
 */
import vaultIdl from "../../../sdk/liquidity_vault_idl.json";

type IdlError = { code: number; name: string; msg?: string };
const idlErrors: IdlError[] = (vaultIdl as any).errors ?? [];

/** Что делать пользователю, если контракт вернул эту ошибку. */
const HINTS: Record<string, string> = {
  VaultNotIdle: "Админ сейчас держит средства в Raydium. Дождитесь, пока он закроет позицию и обменяет B обратно в A.",
  DepositTooSmall: "Внесите хотя бы 1 токен.",
  AmountTooSmall: "Увеличьте сумму.",
  Unauthorized: "Это действие доступно только администратору vault.",
  CardNotEmpty: "Сначала выведите все share-токены.",
  SwapTooLarge: "Уменьшите сумму обмена до половины токена A в vault.",
  NoOpenPosition: "Сначала откройте позицию.",
  PositionAlreadyOpen: "Сначала закройте текущую позицию.",
};

/** Ошибки Raydium CLMM, которые встречаются в нашем сценарии (по имени: номера в devnet и localnet-сборке разные). */
const RAYDIUM: Record<string, string> = {
  TooLittleOutputReceived: "Пул отдал бы меньше минимума (slippage). Обновите курс или увеличьте допустимый slippage.",
  TooMuchInputPaid: "Списалось бы больше максимума (slippage). Обновите данные и попробуйте снова.",
  PriceSlippageCheck: "Цена в пуле изменилась сильнее допустимого. Обновите данные и попробуйте снова.",
  LiquidityInsufficient: "В пуле не хватает ликвидности для такого обмена.",
};

export function programErrorText(code: number): string | null {
  const e = idlErrors.find((x) => x.code === code);
  if (!e) return null;
  const hint = HINTS[e.name];
  return `${e.msg ?? e.name}${hint ? ". " + hint : ""}`;
}

function findCustomCode(text: string): number | null {
  const hex = text.match(/custom program error: 0x([0-9a-f]+)/i);
  if (hex) return parseInt(hex[1], 16);
  const num = text.match(/Error Number: (\d+)/);
  if (num) return Number(num[1]);
  const json = text.match(/"Custom":\s*(\d+)/);
  if (json) return Number(json[1]);
  return null;
}

export function describeError(e: unknown): string {
  const err: any = e ?? {};
  // AnchorError: e.error.errorCode.number
  const anchorCode: number | undefined = err?.error?.errorCode?.number;
  const logs: string[] = err?.logs ?? err?.transactionLogs ?? [];
  const text = [err?.message ?? String(e), ...logs].join("\n");

  // Anchor пишет в логи «Error Code: Имя». Сначала ищем по имени — так не спутаем ошибки Raydium и наши.
  const names = [...text.matchAll(/Error Code: (\w+)/g)].map((m) => m[1]);
  const anchorName: string | undefined = err?.error?.errorCode?.code;
  if (anchorName) names.unshift(anchorName);
  for (const n of names) {
    if (RAYDIUM[n]) return RAYDIUM[n];
    const own = idlErrors.find((x) => x.name === n);
    if (own) return programErrorText(own.code)!;
  }
  const code = anchorCode ?? findCustomCode(text);
  if (code !== null && code !== undefined) {
    const t = programErrorText(code);
    if (t) return t;
  }

  if (/User rejected|rejected the request|Transaction cancelled|declined/i.test(text)) return "Вы отменили подпись в кошельке.";
  if (/insufficient lamports|Attempt to debit an account but found no record of a prior credit|insufficient funds for fee/i.test(text))
    return "Не хватает SOL на комиссию. Попросите тестовые SOL у админа (npm run faucet) или на faucet.solana.com.";
  if (/insufficient funds/i.test(text)) return "Не хватает токенов на счёте.";
  if (/Blockhash not found|block height exceeded|expired/i.test(text)) return "Транзакция устарела, пока ждала подписи. Попробуйте ещё раз.";
  if (/429|Too Many Requests/i.test(text)) return "RPC devnet перегружен (429). Подождите минуту или укажите свой VITE_RPC_URL.";
  if (/Failed to fetch|NetworkError|ECONNREFUSED/i.test(text)) return "Нет связи с RPC. Проверьте интернет или VITE_RPC_URL.";
  if (/WalletNotConnected|wallet not connected/i.test(text)) return "Подключите кошелёк.";
  if (/AccountNotInitialized|3012/.test(text)) return "Аккаунт ещё не создан. Сначала откройте карточку.";
  return err?.error?.errorMessage ?? err?.message ?? String(e);
}
