/**
 * Неделя 14. Тестовые токены для нового пользователя сайта.
 * Админ (тот, кто запускал 01-setup-pool, — он mint authority токена A) выдаёт пользователю:
 *   - N токенов A (по умолчанию 1000) — аккаунт токена создаётся, если его ещё нет;
 *   - 0.02 SOL, если у пользователя меньше 0.01 SOL (хватает на карточку, аккаунты токенов и комиссии).
 *
 * Запуск: npm run faucet -- <адрес кошелька> [сколько токенов A]
 */
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { parseAmount } from "../../sdk/amount";
import { assertCluster, explorerTx, loadDeployment, pk, setup } from "./common";

const MIN_SOL = 0.01 * LAMPORTS_PER_SOL;
const SEND_SOL = 0.02 * LAMPORTS_PER_SOL;

async function main() {
  const [address, amountArg = "1000"] = process.argv.slice(2);
  if (!address) throw new Error("Укажите адрес: npm run faucet -- <адрес кошелька> [сколько токенов A]");
  let user: PublicKey;
  try {
    user = new PublicKey(address);
  } catch {
    throw new Error(`«${address}» — не адрес Solana`);
  }

  const { wallet, connection } = setup();
  await assertCluster(connection); // до любой транзакции: точно devnet, а не mainnet
  const d = loadDeployment();
  const mintA = pk(d.mintA);
  const mint = await getMint(connection, mintA, "confirmed");
  if (!mint.mintAuthority?.equals(wallet.publicKey)) {
    throw new Error(
      `Печатать токен A может только ${mint.mintAuthority?.toBase58() ?? "никто (authority снят)"}. ` +
        `Запустите скрипт кошельком, который создавал токены (01-setup-pool).`,
    );
  }
  const parsed = parseAmount(amountArg, mint.decimals);
  if (!parsed.ok || parsed.raw === 0n) throw new Error(`Сумма «${amountArg}»: ${parsed.ok ? "должна быть больше нуля" : parsed.error}`);

  const ata = getAssociatedTokenAddressSync(mintA, user, true);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, ata, user, mintA),
    createMintToInstruction(mintA, ata, wallet.publicKey, parsed.raw),
  );
  const sol = await connection.getBalance(user, "confirmed");
  if (sol < MIN_SOL) tx.add(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: user, lamports: SEND_SOL }));

  const sig = await sendAndConfirmTransaction(connection, tx, [wallet], { commitment: "confirmed" });
  console.log(`Пользователь ${user.toBase58()}:`);
  console.log(`  + ${amountArg} токенов A${sol < MIN_SOL ? ` и ${SEND_SOL / LAMPORTS_PER_SOL} SOL` : ""}`);
  console.log(`  ${explorerTx(sig)}`);
}

main().catch((e) => {
  console.error("Ошибка:", e.message ?? e);
  process.exit(1);
});
