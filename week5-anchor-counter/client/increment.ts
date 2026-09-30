/**
 * После anchor deploy подставь Program Id в lib.rs и Anchor.toml.
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

  await program.methods
    .increment()
    .accounts({
      counter: counter.publicKey,
      authority: provider.wallet.publicKey,
    })
    .rpc();

  const account = await program.account.counter.fetch(counter.publicKey);
  console.log("counter", counter.publicKey.toBase58());
  console.log("count", account.count.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
