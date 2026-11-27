import { describe, expect, it } from "vitest";
import { formatAmount, parseAmount, toInput, U64_MAX } from "./amount";

describe("parseAmount", () => {
  it("переводит «1,5» и «1.5» в 1 500 000 при 6 знаках", () => {
    expect(parseAmount("1,5", 6)).toEqual({ ok: true, raw: 1_500_000n });
    expect(parseAmount("1.5", 6)).toEqual({ ok: true, raw: 1_500_000n });
    expect(parseAmount(" 100 ", 6)).toEqual({ ok: true, raw: 100_000_000n });
    expect(parseAmount(".5", 6)).toEqual({ ok: true, raw: 500_000n });
  });
  it("без потерь там, где float ошибается (0.1 + 0.2, 1.005)", () => {
    expect(parseAmount("0.3", 6)).toEqual({ ok: true, raw: 300_000n });
    expect(parseAmount("1.005", 6)).toEqual({ ok: true, raw: 1_005_000n });
    expect(parseAmount("0.000001", 6)).toEqual({ ok: true, raw: 1n });
    expect(parseAmount("123456789.123456", 6)).toEqual({ ok: true, raw: 123_456_789_123_456n });
  });
  it("отклоняет мусор, лишние знаки и переполнение u64", () => {
    for (const bad of ["", "abc", "1,2,3", "-1", "1e3", ".", "1.0000001"]) expect(parseAmount(bad, 6).ok).toBe(false);
    expect(parseAmount((U64_MAX + 1n).toString(), 0).ok).toBe(false);
    expect(parseAmount(U64_MAX.toString(), 0)).toEqual({ ok: true, raw: U64_MAX });
  });
});

describe("formatAmount", () => {
  it("форматирует по-русски и убирает хвостовые нули", () => {
    expect(formatAmount(1_500_000n, 6)).toBe("1,5");
    expect(formatAmount(1_234_567_000_000n, 6)).toBe("1 234 567");
    expect(formatAmount(1n, 6)).toBe("0,000001");
    expect(formatAmount(1_234_567n, 6, 2)).toBe("1,23");
    expect(formatAmount(0n, 6)).toBe("0");
  });
  it("toInput → parseAmount возвращает то же число", () => {
    for (const raw of [0n, 1n, 1_500_000n, 1_234_567_891_234n]) {
      expect(parseAmount(toInput(raw, 6), 6)).toEqual({ ok: true, raw });
    }
  });
});
