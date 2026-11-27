/**
 * История депозитов и выводов пользователя.
 * Карточка (PDA) меняется в каждом депозите и выводе, поэтому getSignaturesForAddress(карточка)
 * даёт все транзакции пользователя с vault. Суммы берём из событий DepositEvent / WithdrawEvent в логах.
 */
import { BorshCoder, EventParser, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import vaultIdl from "../../../sdk/liquidity_vault_idl.json";

export type HistoryItem = {
  sig: string;
  time: number | null; // unix, секунды
  kind: "deposit" | "withdraw" | "other";
  amount?: bigint; // токены A
  shares?: bigint;
  failed: boolean;
};

const parser = (programId: PublicKey) => new EventParser(programId, new BorshCoder(vaultIdl as Idl));

/** Разобрать логи одной транзакции в запись истории (отдельно — чтобы проверить без сети). */
export function itemFromLogs(programId: PublicKey, sig: string, time: number | null, logs: string[], failed: boolean): HistoryItem {
  for (const ev of parser(programId).parseLogs(logs)) {
    const d: any = ev.data;
    const name = ev.name.charAt(0).toLowerCase() + ev.name.slice(1); // DepositEvent и depositEvent — одно и то же
    if (name === "depositEvent")
      return { sig, time, kind: "deposit", amount: BigInt(d.amount.toString()), shares: BigInt(d.shares.toString()), failed };
    if (name === "withdrawEvent")
      return { sig, time, kind: "withdraw", amount: BigInt(d.amount.toString()), shares: BigInt(d.shares.toString()), failed };
  }
  return { sig, time, kind: "other", failed };
}

export async function loadHistory(connection: Connection, programId: PublicKey, card: PublicKey, limit = 20): Promise<HistoryItem[]> {
  const sigs = await connection.getSignaturesForAddress(card, { limit }, "confirmed");
  if (sigs.length === 0) return [];
  const txs = await connection.getTransactions(
    sigs.map((s) => s.signature),
    { commitment: "confirmed", maxSupportedTransactionVersion: 0 },
  );
  return sigs.map((s, i) =>
    itemFromLogs(programId, s.signature, s.blockTime ?? null, txs[i]?.meta?.logMessages ?? [], !!s.err),
  );
}
