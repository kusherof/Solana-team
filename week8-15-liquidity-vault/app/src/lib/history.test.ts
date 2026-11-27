import { describe, expect, it } from "vitest";
import { BN, BorshCoder, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "../../../sdk/liquidity_vault_idl.json";
import { itemFromLogs } from "./history";

const programId = new PublicKey((idl as any).address);
const coder = new BorshCoder(idl as Idl);

/** Собираем логи так же, как их пишет emit!: «Program data: <base64>». */
function logsWith(name: string, data: Record<string, unknown>) {
  const disc = Buffer.from((idl as any).events.find((e: any) => e.name === name).discriminator);
  const body = (coder.types as any).encode(name, data);
  return [
    `Program ${programId.toBase58()} invoke [1]`,
    `Program data: ${Buffer.concat([disc, body]).toString("base64")}`,
    `Program ${programId.toBase58()} success`,
  ];
}

describe("история операций по событиям в логах", () => {
  const base = { vault: PublicKey.default, user: PublicKey.default, totalAssetsAfter: new BN(0), totalSharesAfter: new BN(0) };
  it("депозит", () => {
    const logs = logsWith("DepositEvent", { ...base, amount: new BN(5_000_000), shares: new BN(4_000_000) });
    expect(itemFromLogs(programId, "sig", 1, logs, false)).toEqual({
      sig: "sig", time: 1, kind: "deposit", amount: 5_000_000n, shares: 4_000_000n, failed: false,
    });
  });
  it("вывод", () => {
    const logs = logsWith("WithdrawEvent", { ...base, shares: new BN(1), amount: new BN(2) });
    expect(itemFromLogs(programId, "s", null, logs, false)).toMatchObject({ kind: "withdraw", amount: 2n, shares: 1n });
  });
  it("транзакция без событий (открыть карточку)", () => {
    expect(itemFromLogs(programId, "s", null, ["Program log: hi"], false).kind).toBe("other");
  });
});
