// Работа с настоящей программой в devnet через Anchor и Phantom.
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_SLOT_HASHES_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import idl from "../idl/glimmo.json";
import type { Glimmo } from "../idl/glimmo";
import { Backend, GameState, Params, Pet, TxResult } from "./model";

export const RPC_URL: string = import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey((idl as any).address);
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;

const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const CONFIG = pda(Buffer.from("config"));
const TREASURY = pda(Buffer.from("treasury"));
const FOOD = pda(Buffer.from("food"));
const playerPda = (o: PublicKey) => pda(Buffer.from("player"), o.toBuffer());
const petMintPda = (id: number) => pda(Buffer.from("pet_mint"), new BN(id).toArrayLike(Buffer, "le", 8));
const petPda = (mint: PublicKey) => pda(Buffer.from("pet"), mint.toBuffer());
const petAta = (mint: PublicKey, o: PublicKey) =>
  getAssociatedTokenAddressSync(mint, o, false, TOKEN_2022_PROGRAM_ID);
const foodAta = (o: PublicKey) => getAssociatedTokenAddressSync(FOOD, o);

const ERRORS: Record<string, string> = {};
for (const e of (idl as any).errors ?? []) ERRORS[e.name] = e.msg;

function humanError(e: any): Error {
  const code = e?.error?.errorCode?.code;
  if (code && ERRORS[code]) return new Error(ERRORS[code]);
  const msg = String(e?.message ?? e);
  if (msg.includes("User rejected")) return new Error("Транзакция отменена в кошельке");
  if (msg.includes("insufficient")) return new Error("Недостаточно SOL или FOOD");
  if (msg.includes("Account does not exist") && msg.includes("config"))
    return new Error("Игра ещё не создана в devnet: запустите npm run devnet:init");
  return new Error(msg.length > 160 ? msg.slice(0, 160) + "…" : msg);
}

const toPet = (key: PublicKey, a: any): Pet => ({
  key: key.toBase58(),
  mint: a.mint.toBase58(),
  id: a.id.toNumber(),
  name: a.name,
  dna: Array.from(a.dna as number[]),
  generation: a.generation,
  parentA: a.parentA.equals(PublicKey.default) ? null : a.parentA.toBase58(),
  parentB: a.parentB.equals(PublicKey.default) ? null : a.parentB.toBase58(),
  bornAt: a.bornAt.toNumber(),
  hatchAt: a.hatchAt.toNumber(),
  hatched: a.hatched,
  level: a.level,
  xp: a.xp,
  satiety: a.satiety,
  mood: a.mood,
  lastTick: a.lastTick.toNumber(),
  lastPlay: a.lastPlay.toNumber(),
  lastBreed: a.lastBreed.toNumber(),
  timesFed: a.timesFed,
  timesPlayed: a.timesPlayed,
  children: a.children,
});

export class ChainBackend implements Backend {
  kind = "chain" as const;
  program: Program<Glimmo>;
  conn: Connection;
  owner: PublicKey;

  constructor(wallet: AnchorWallet) {
    this.conn = new Connection(RPC_URL, "confirmed");
    const provider = new AnchorProvider(this.conn, wallet, { commitment: "confirmed" });
    this.program = new Program<Glimmo>(idl as any, provider);
    this.owner = wallet.publicKey;
  }

  private async run(f: () => Promise<string>): Promise<TxResult> {
    try {
      return { sig: await f() };
    } catch (e) {
      throw humanError(e);
    }
  }

  async load(): Promise<GameState> {
    const cfg = await this.program.account.config.fetch(CONFIG).catch(() => null);
    if (!cfg) throw new Error("Игра ещё не создана в devnet: запустите npm run devnet:init");
    const p = cfg.params;
    const params: Params = {
      eggPrice: p.eggPrice.toNumber(),
      hatchSeconds: p.hatchSeconds.toNumber(),
      decaySeconds: p.decaySeconds.toNumber(),
      foodPerClaim: p.foodPerClaim.toNumber(),
      foodCooldown: p.foodCooldown.toNumber(),
      playCooldown: p.playCooldown.toNumber(),
      breedCooldown: p.breedCooldown.toNumber(),
      breedFoodCost: p.breedFoodCost.toNumber(),
      xpPerLevel: p.xpPerLevel,
      teenLevel: p.teenLevel,
      adultLevel: p.adultLevel,
    };

    // Ищем все NFT кошелька на Token-2022 и проверяем, есть ли у них Pet PDA
    const tokens = await this.conn.getParsedTokenAccountsByOwner(this.owner, {
      programId: TOKEN_2022_PROGRAM_ID,
    });
    const mints = tokens.value
      .map((t) => t.account.data.parsed.info)
      .filter((i) => i.tokenAmount.amount === "1" && i.tokenAmount.decimals === 0)
      .map((i) => new PublicKey(i.mint));
    const keys = mints.map(petPda);
    const accs = keys.length ? await this.program.account.pet.fetchMultiple(keys) : [];
    const pets = accs
      .map((a, i) => (a ? toPet(keys[i], a) : null))
      .filter(Boolean)
      .sort((a, b) => a!.id - b!.id) as Pet[];

    const [sol, food, player] = await Promise.all([
      this.conn.getBalance(this.owner),
      this.conn.getTokenAccountBalance(foodAta(this.owner)).catch(() => null),
      this.program.account.player.fetchNullable(playerPda(this.owner)),
    ]);
    return {
      pets,
      params,
      sol: sol / LAMPORTS_PER_SOL,
      food: food ? Number(food.value.amount) : 0,
      lastFoodClaim: player ? player.lastFoodClaim.toNumber() : 0,
      totalPets: cfg.totalPets.toNumber(),
    };
  }

  claimFood() {
    return this.run(() =>
      this.program.methods
        .claimFood()
        .accountsPartial({
          owner: this.owner,
          config: CONFIG,
          player: playerPda(this.owner),
          foodMint: FOOD,
          ownerFood: foodAta(this.owner),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc()
    );
  }

  async adopt(name: string): Promise<TxResult> {
    const cfg = await this.program.account.config.fetch(CONFIG);
    const mint = petMintPda(cfg.totalPets.toNumber());
    const r = await this.run(() =>
      this.program.methods
        .adoptEgg(name)
        .accountsPartial({
          owner: this.owner,
          config: CONFIG,
          treasury: TREASURY,
          player: playerPda(this.owner),
          petMint: mint,
          petToken: petAta(mint, this.owner),
          pet: petPda(mint),
          slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
        .rpc()
    );
    return { ...r, newPetKey: petPda(mint).toBase58() };
  }

  private petAccs(pet: Pet) {
    const mint = new PublicKey(pet.mint);
    return { owner: this.owner, config: CONFIG, pet: petPda(mint), petToken: petAta(mint, this.owner) };
  }

  hatch(pet: Pet) {
    return this.run(() => this.program.methods.hatch().accountsPartial(this.petAccs(pet)).rpc());
  }

  play(pet: Pet) {
    return this.run(() => this.program.methods.play().accountsPartial(this.petAccs(pet)).rpc());
  }

  feed(pet: Pet, amount: number) {
    return this.run(() =>
      this.program.methods
        .feed(amount)
        .accountsPartial({
          ...this.petAccs(pet),
          foodMint: FOOD,
          ownerFood: foodAta(this.owner),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc()
    );
  }

  rename(pet: Pet, name: string) {
    return this.run(() =>
      this.program.methods
        .rename(name)
        .accountsPartial({
          ...this.petAccs(pet),
          petMint: new PublicKey(pet.mint),
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .rpc()
    );
  }

  async breed(a: Pet, b: Pet, name: string): Promise<TxResult> {
    const cfg = await this.program.account.config.fetch(CONFIG);
    const childMint = petMintPda(cfg.totalPets.toNumber());
    const ma = new PublicKey(a.mint);
    const mb = new PublicKey(b.mint);
    const r = await this.run(() =>
      this.program.methods
        .breed(name)
        .accountsPartial({
          owner: this.owner,
          partner: this.owner, // в интерфейсе оба родителя ваши; два игрока — см. тесты
          config: CONFIG,
          player: playerPda(this.owner),
          parentA: petPda(ma),
          parentAToken: petAta(ma, this.owner),
          parentB: petPda(mb),
          parentBToken: petAta(mb, this.owner),
          foodMint: FOOD,
          ownerFood: foodAta(this.owner),
          childMint,
          childToken: petAta(childMint, this.owner),
          child: petPda(childMint),
          slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
        .rpc()
    );
    return { ...r, newPetKey: petPda(childMint).toBase58() };
  }
}
