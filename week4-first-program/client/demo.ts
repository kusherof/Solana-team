/**
 * Клиент недели 4. Нужен Program Id после `solana program deploy`.
 *
 *   set PROGRAM_ID=...   (PowerShell: $env:PROGRAM_ID="...")
 *   npm run demo
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

function loadPayer(): Keypair {
  const p = join(homedir(), ".config", "solana", "id.json");
  if (!existsSync(p)) {
    throw new Error("Нет кошелька ~/.config/solana/id.json — сначала solana-keygen new");
  }
  const secret = JSON.parse(readFileSync(p, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const programIdRaw = process.env.PROGRAM_ID;
  if (!programIdRaw) {
    console.log("Поставь PROGRAM_ID после деплоя. Пример PowerShell:");
    console.log('  $env:PROGRAM_ID="ТвойProgramId"');
    console.log("  npm run demo");
    process.exit(1);
  }

  const programId = new PublicKey(programIdRaw);
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const payer = loadPayer();
  const counter = Keypair.generate();

  const bal = await connection.getBalance(payer.publicKey);
  if (bal < 0.05 * LAMPORTS_PER_SOL) {
    console.log("мало SOL, пробую airdrop...");
    const sig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }

  const initIx = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: counter.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([0]),
  });

  const incIx = new TransactionInstruction({
    programId,
    keys: [{ pubkey: counter.publicKey, isSigner: false, isWritable: true }],
    data: Buffer.from([1]),
  });

  const tx = new Transaction().add(initIx, incIx);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, counter]);

  const acc = await connection.getAccountInfo(counter.publicKey);
  const count = acc ? Number(acc.data.readBigUInt64LE(0)) : -1;

  writeFileSync(
    join(import.meta.dirname, "..", "last-counter.json"),
    JSON.stringify({ counter: counter.publicKey.toBase58(), signature: sig, count }, null, 2)
  );

  console.log("signature", sig);
  console.log("counter", counter.publicKey.toBase58());
  console.log("count", count);
  console.log(
    "explorer",
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
