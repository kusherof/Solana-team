import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("profile pda", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = (anchor.workspace as any).Profile as Program;

  it("creates a profile at PDA(profile + user)", async () => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .initialize("bob", "on-chain profile")
      .accounts({
        profile: pda,
        user: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const profile = await program.account.profile.fetch(pda);
    assert.equal(profile.username, "bob");
    assert.equal(profile.authority.toBase58(), provider.wallet.publicKey.toBase58());
  });
});
