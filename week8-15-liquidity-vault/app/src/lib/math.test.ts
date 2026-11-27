import { describe, expect, it } from "vitest";
import { maxSwapIn, minDeposit, previewShares, previewWithdraw, sharePercent } from "./math";

// Те же примеры, что в unit-тестах контракта (programs/liquidity-vault/src/math.rs)
describe("формулы vault — как в контракте", () => {
  it("первый вкладчик получает 1:1", () => {
    expect(previewShares(1_000n, 0n, 0n)).toBe(1_000n);
  });
  it("пример из методички: 1100 в vault, 1000 share → за 110 дают 100 share", () => {
    expect(previewShares(110n, 1_100n, 1_000n)).toBe(100n);
  });
  it("вывод пропорционален доле", () => {
    expect(previewWithdraw(100n, 1_210n, 1_100n)).toBe(110n);
    expect(previewWithdraw(1_000n, 1_234n, 1_000n)).toBe(1_234n);
  });
  it("округление вниз — в пользу vault", () => {
    const s = previewShares(7n, 1_003n, 1_000n);
    expect(previewWithdraw(s, 1_010n, 1_000n + s) <= 7n).toBe(true);
    expect(previewShares(1n, 2_000n, 1_000n)).toBe(0n); // «пыль» → 0 share
  });
  it("нельзя вывести больше share, чем выпущено", () => {
    expect(previewWithdraw(1_001n, 1_000n, 1_000n)).toBe(0n);
  });
  it("большие числа без переполнения (bigint)", () => {
    const half = (1n << 63n) - 1n;
    expect(previewShares(half, half, half)).toBe(half);
  });
  it("минимальный депозит и лимит обмена", () => {
    expect(minDeposit(6)).toBe(1_000_000n);
    expect(maxSwapIn(1_101n)).toBe(550n);
  });
  it("доля в процентах", () => {
    expect(sharePercent(1n, 3n)).toBe("33,33%");
    expect(sharePercent(5n, 5n)).toBe("100,00%");
    expect(sharePercent(0n, 0n)).toBe("—");
  });
});
