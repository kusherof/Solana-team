import { describe, expect, it } from "vitest";
import { checkDeposit, checkWithdraw } from "./validate";

const fresh = { decimals: 6, totalAssets: 0n, totalShares: 0n };
const expensive = { decimals: 6, totalAssets: 2_000_000_000n, totalShares: 1_000_000_000n }; // 1 share = 2 A

describe("проверка ввода депозита", () => {
  it("свежий vault: 100,5 A → 100,5 share", () => {
    expect(checkDeposit("100,5", 1_000_000_000n, fresh)).toEqual({ raw: 100_500_000n, out: 100_500_000n });
  });
  it("больше, чем на балансе", () => {
    expect(checkDeposit("5", 1_000_000n, fresh).error).toMatch(/У вас только 1 A/);
  });
  it("меньше минимального депозита", () => {
    expect(checkDeposit("0.5", 10_000_000n, fresh).error).toMatch(/Минимальный депозит/);
  });
  it("ноль и мусор", () => {
    expect(checkDeposit("0", 1n, fresh).error).toMatch(/больше нуля/);
    expect(checkDeposit("abc", 1n, fresh).error).toBeTruthy();
  });
  it("дорогой share: считаем по формуле контракта", () => {
    expect(checkDeposit("3", 10_000_000n, expensive)).toEqual({ raw: 3_000_000n, out: 1_500_000n });
  });
});

describe("проверка ввода вывода", () => {
  it("40,25 share при цене 2 → 80,5 A", () => {
    expect(checkWithdraw("40,25", 100_000_000n, expensive)).toEqual({ raw: 40_250_000n, out: 80_500_000n });
  });
  it("больше share, чем есть", () => {
    expect(checkWithdraw("2", 1_000_000n, expensive).error).toMatch(/У вас только 1 share/);
  });
  it("слишком мало: 0 токенов на выходе", () => {
    const cheap = { decimals: 6, totalAssets: 1n, totalShares: 1_000_000n };
    expect(checkWithdraw("0.000001", 1_000_000n, cheap).error).toMatch(/получите 0/);
  });
});
