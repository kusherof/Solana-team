import * as fs from "fs";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("target/idl/profile.json", "utf8"));
  const program = new Program(idl, provider);

  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), provider.wallet.publicKey.toBuffer()],
    program.programId
  );

  console.log("pda", pda.toBase58(), "bump", bump);

  await program.methods
    .initialize("alice", "hello from week 6")
    .accounts({
      profile: pda,
      user: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const afterInit = await program.account.profile.fetch(pda);
  console.log("username", afterInit.username);
  console.log("bio", afterInit.bio);

  await program.methods
    .updateBio("updated bio")
    .accounts({
      profile: pda,
      authority: provider.wallet.publicKey,
    })
    .rpc();

  const afterUpd = await program.account.profile.fetch(pda);
  console.log("bio after update", afterUpd.bio);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
