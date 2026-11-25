/**
 * Хелперы для Raydium CLMM: адреса PDA, математика тиков и цен, подбор tick arrays.
 * Используются в тестах, devnet-скриптах и веб-интерфейсе.
 */
import { PublicKey, Connection } from "@solana/web3.js";
import BN from "bn.js";
import Decimal from "decimal.js";

Decimal.set({ precision: 60 });

export const CLMM_PROGRAM_ID = {
  localnet: new PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"),
  mainnet: new PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"),
  devnet: new PublicKey("DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH"),
};

export const TICK_ARRAY_SIZE = 60;
export const MIN_TICK = -443636;
export const MAX_TICK = 443636;
/** Предельные sqrt-цены Raydium (MIN_SQRT_PRICE_X64 + 1 / MAX_SQRT_PRICE_X64 - 1) */
export const MIN_SQRT_PRICE_X64 = new BN("4295048016");
export const MAX_SQRT_PRICE_X64 = new BN("79226673521066979257578248091");

const i32be = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n, 0);
  return b;
};
const u16be = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n, 0);
  return b;
};

export function sortMints(a: PublicKey, b: PublicKey): [PublicKey, PublicKey] {
  return Buffer.compare(a.toBuffer(), b.toBuffer()) < 0 ? [a, b] : [b, a];
}

export const pda = {
  ammConfig: (programId: PublicKey, index: number) =>
    PublicKey.findProgramAddressSync([Buffer.from("amm_config"), u16be(index)], programId)[0],
  pool: (programId: PublicKey, ammConfig: PublicKey, mint0: PublicKey, mint1: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), ammConfig.toBuffer(), mint0.toBuffer(), mint1.toBuffer()],
      programId,
    )[0],
  poolVault: (programId: PublicKey, pool: PublicKey, mint: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("pool_vault"), pool.toBuffer(), mint.toBuffer()], programId)[0],
  observation: (programId: PublicKey, pool: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("observation"), pool.toBuffer()], programId)[0],
  bitmapExtension: (programId: PublicKey, pool: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("pool_tick_array_bitmap_extension"), pool.toBuffer()],
      programId,
    )[0],
  tickArray: (programId: PublicKey, pool: PublicKey, startIndex: number) =>
    PublicKey.findProgramAddressSync([Buffer.from("tick_array"), pool.toBuffer(), i32be(startIndex)], programId)[0],
  personalPosition: (programId: PublicKey, nftMint: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("position"), nftMint.toBuffer()], programId)[0],
  protocolPosition: (programId: PublicKey, pool: PublicKey, tickLower: number, tickUpper: number) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("position"), pool.toBuffer(), i32be(tickLower), i32be(tickUpper)],
      programId,
    )[0],
};

// ---------- цены и тики ----------
// В CLMM цена = сколько token_1 за 1 token_0 (в «сырых» единицах, без decimals).
// price(tick) = 1.0001^tick, sqrtPriceX64 = sqrt(price) * 2^64.

const Q64 = new Decimal(2).pow(64);

/** Человеческая цена (token1 за token0) → «сырая» цена с учётом decimals */
export function toRawPrice(price: number | string, decimals0: number, decimals1: number): Decimal {
  return new Decimal(price).mul(new Decimal(10).pow(decimals1 - decimals0));
}

export function priceToSqrtPriceX64(price: number | string, decimals0: number, decimals1: number): BN {
  const raw = toRawPrice(price, decimals0, decimals1);
  return new BN(raw.sqrt().mul(Q64).floor().toFixed());
}

export function sqrtPriceX64ToPrice(sqrtPriceX64: BN, decimals0: number, decimals1: number): number {
  const sp = new Decimal(sqrtPriceX64.toString()).div(Q64);
  return sp.pow(2).mul(new Decimal(10).pow(decimals0 - decimals1)).toNumber();
}

export function priceToTick(price: number | string, decimals0: number, decimals1: number): number {
  const raw = toRawPrice(price, decimals0, decimals1);
  return Math.floor(raw.ln().div(new Decimal(1.0001).ln()).toNumber());
}

export function tickToPrice(tick: number, decimals0: number, decimals1: number): number {
  return new Decimal(1.0001).pow(tick).mul(new Decimal(10).pow(decimals0 - decimals1)).toNumber();
}

/** Округлить тик вниз до кратного tickSpacing */
export function alignTick(tick: number, tickSpacing: number): number {
  return Math.floor(tick / tickSpacing) * tickSpacing;
}

/** Стартовый индекс tick array, в который попадает тик */
export function tickArrayStartIndex(tick: number, tickSpacing: number): number {
  const span = TICK_ARRAY_SIZE * tickSpacing;
  return Math.floor(tick / span) * span;
}

/**
 * Сколько ликвидности L можно положить, имея amount0 и amount1,
 * при текущей цене внутри диапазона [tickLower, tickUpper].
 *   L0 = amount0 * sqrtP * sqrtPu / (sqrtPu - sqrtP)
 *   L1 = amount1 / (sqrtP - sqrtPl)
 * Берём минимум — тогда хватит обоих токенов.
 */
export function liquidityFromAmounts(
  sqrtPriceX64: BN,
  tickLower: number,
  tickUpper: number,
  amount0: BN,
  amount1: BN,
): BN {
  const sp = new Decimal(sqrtPriceX64.toString()).div(Q64);
  const sl = new Decimal(1.0001).pow(tickLower).sqrt();
  const su = new Decimal(1.0001).pow(tickUpper).sqrt();
  const a0 = new Decimal(amount0.toString());
  const a1 = new Decimal(amount1.toString());
  let L: Decimal;
  if (sp.lte(sl)) {
    L = a0.mul(sl).mul(su).div(su.minus(sl));
  } else if (sp.gte(su)) {
    L = a1.div(su.minus(sl));
  } else {
    const l0 = a0.mul(sp).mul(su).div(su.minus(sp));
    const l1 = a1.div(sp.minus(sl));
    L = Decimal.min(l0, l1);
  }
  return new BN(L.floor().toFixed());
}

/** Сколько токенов соответствует ликвидности L (для оценки / минимумов при закрытии) */
export function amountsFromLiquidity(
  sqrtPriceX64: BN,
  tickLower: number,
  tickUpper: number,
  liquidity: BN,
): { amount0: BN; amount1: BN } {
  const sp = new Decimal(sqrtPriceX64.toString()).div(Q64);
  const sl = new Decimal(1.0001).pow(tickLower).sqrt();
  const su = new Decimal(1.0001).pow(tickUpper).sqrt();
  const L = new Decimal(liquidity.toString());
  let a0 = new Decimal(0);
  let a1 = new Decimal(0);
  if (sp.lte(sl)) {
    a0 = L.mul(su.minus(sl)).div(sl.mul(su));
  } else if (sp.gte(su)) {
    a1 = L.mul(su.minus(sl));
  } else {
    a0 = L.mul(su.minus(sp)).div(sp.mul(su));
    a1 = L.mul(sp.minus(sl));
  }
  return { amount0: new BN(a0.floor().toFixed()), amount1: new BN(a1.floor().toFixed()) };
}

/**
 * Подобрать tick arrays для обмена (remaining accounts).
 * Raydium проходит по ним по порядку в сторону движения цены.
 */
export async function getSwapTickArrays(
  connection: Connection,
  programId: PublicKey,
  pool: PublicKey,
  tickCurrent: number,
  tickSpacing: number,
  zeroForOne: boolean,
  count = 5,
): Promise<PublicKey[]> {
  const span = TICK_ARRAY_SIZE * tickSpacing;
  const start = tickArrayStartIndex(tickCurrent, tickSpacing);
  const candidates: PublicKey[] = [];
  for (let i = 0; i < 20; i++) {
    const idx = zeroForOne ? start - i * span : start + i * span;
    candidates.push(pda.tickArray(programId, pool, idx));
  }
  const infos = await connection.getMultipleAccountsInfo(candidates);
  return candidates.filter((_, i) => infos[i] !== null).slice(0, count);
}
