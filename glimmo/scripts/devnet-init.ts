// Создаёт игру в devnet (или обновляет параметры, если она уже создана).
// Запуск: ANCHOR_PROVIDER_URL=<devnet RPC> ANCHOR_WALLET=~/.config/solana/id.json npm run devnet:init
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { Glimmo } from "../target/types/glimmo";

// Параметры подобраны для живого показа: всё происходит за минуты, а не за дни
const params = {
  eggPrice: new BN(0.05 * LAMPORTS_PER_SOL),
  hatchSeconds: new BN(60), // яйцо — 1 минута
  decaySeconds: new BN(300), // −1 сытости раз в 5 минут
  foodPerClaim: new BN(10),
  foodCooldown: new BN(600), // кормушка раз в 10 минут
  playCooldown: new BN(15),
  breedCooldown: new BN(600),
  breedFoodCost: new BN(3),
  xpPerLevel: 20,
  teenLevel: 3,
  adultLevel: 5,
};

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Glimmo as Program<Glimmo>;
  const pda = (s: string) => PublicKey.findProgramAddressSync([Buffer.from(s)], program.programId)[0];
  const config = pda("config");
  const treasury = pda("treasury");
  const foodMint = pda("food");

  const existing = await program.account.config.fetchNullable(config);
  let sig: string;
  if (existing) {
    sig = await program.methods.updateParams(params).accountsPartial({ admin: provider.wallet.publicKey, config }).rpc();
    console.log("Игра уже создана — параметры обновлены:", sig);
  } else {
    sig = await program.methods.initialize(params).accountsPartial({ admin: provider.wallet.publicKey, config, treasury, foodMint }).rpc();
    console.log("Игра создана:", sig);
  }

  const out = {
    cluster: "devnet",
    programId: program.programId.toBase58(),
    config: config.toBase58(),
    treasury: treasury.toBase58(),
    foodMint: foodMint.toBase58(),
    admin: provider.wallet.publicKey.toBase58(),
    initTx: sig,
    explorer: `https://explorer.solana.com/address/${program.programId.toBase58()}?cluster=devnet`,
  };
  fs.mkdirSync(path.join(__dirname, "../deployments"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "../deployments/devnet.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
