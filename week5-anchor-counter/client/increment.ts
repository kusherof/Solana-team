/**
 * Клиент недели 5: initialize + increment через Anchor.
 * Перед запуском: anchor build && anchor deploy
 * Потом подставь свой program id в Anchor.toml и в lib.rs (declare_id!).
 */
import * as fs from "fs";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("target/idl/counter.json", "utf8"));
  const program = new Program(idl, provider);

  const counter = Keypair.generate();

  await program.methods
    .initialize()
    .accounts({
      counter: counter.publicKey,
      user: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([counter])
    .rpc();

  console.log("created", counter.publicKey.toBase58());

  await program.methods
    .increment()
    .accounts({ counter: counter.publicKey })
    .rpc();

  const account = await program.account.counter.fetch(counter.publicKey);
  console.log("count =", account.count.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
