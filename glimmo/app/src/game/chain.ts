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
import { Backend, GameState, Params, Pet, TxResult, setClockOffset } from "./model";

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
  if (msg.includes("no record of prior credit"))
    return new Error("На кошельке нет devnet SOL — пополните на faucet.solana.com");
  if (msg.includes("insufficient")) return new Error("Недостаточно SOL или FOOD");
  if (msg.includes("Blockhash not found") || msg.includes("block height exceeded"))
    return new Error("Сеть не успела подтвердить транзакцию, попробуйте ещё раз");
  if (msg.includes("429")) return new Error("RPC перегружен (429). Укажите свой RPC в VITE_RPC_URL");
  if (code === "AccountNotInitialized" && msg.includes("player"))
    return new Error("Сначала заведите питомца: кормушка только для хозяев");
  return new Error(msg.length > 160 ? msg.slice(0, 160) + "…" : msg);
}

/** Коллизия номера питомца: кто-то купил яйцо в тот же момент. */
const isIdRace = (e: any) => /ConstraintSeeds|already in use/.test(String(e?.message ?? e) + (e?.error?.errorCode?.code ?? ""));

const toPet = (key: PublicKey, a: any, tokenAccount?: string): Pet => ({
  key: key.toBase58(),
  mint: a.mint.toBase58(),
  tokenAccount,
  id: a.id.toNumber(),
  name: a.name,
  dna: Array.from(a.dna as number[]),
  dnaB: Array.from(a.dnaB as number[]),
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
  bond: a.bond,
  streak: a.streak,
  lastCarePeriod: a.lastCarePeriod.toNumber(),
  careMistakes: a.careMistakes,
  form: a.form,
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
    const info = await this.conn.getAccountInfo(CONFIG);
    if (!info) throw new Error("Игра ещё не создана в devnet: запустите npm run devnet:init");
    const cfg = this.program.coder.accounts.decode("config", info.data);
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
      carePeriod: p.carePeriod.toNumber(),
    };

    // Сверяем часы с блокчейном, чтобы кнопки не загорались раньше времени
    try {
      const bt = await this.conn.getBlockTime(await this.conn.getSlot());
      if (bt) setClockOffset(bt - Math.floor(Date.now() / 1000));
    } catch {
      /* не страшно */
    }

    // Ищем все NFT кошелька на Token-2022 и проверяем, есть ли у них Pet PDA
    const tokens = await this.conn.getParsedTokenAccountsByOwner(this.owner, {
      programId: TOKEN_2022_PROGRAM_ID,
    });
    const held = tokens.value
      .map((t) => ({ acc: t.pubkey.toBase58(), info: t.account.data.parsed.info }))
      .filter(({ info }) => info.tokenAmount.amount === "1" && info.tokenAmount.decimals === 0);
    const keys = held.map(({ info }) => petPda(new PublicKey(info.mint)));
    const accs = keys.length ? await this.program.account.pet.fetchMultiple(keys) : [];
    const pets = accs
      .map((a, i) => (a ? toPet(keys[i], a, held[i].acc) : null))
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
      hasPlayer: !!player && (player.eggsAdopted > 0 || player.petsBred > 0),
    };
  }

  /** Рейтинг: все питомцы программы (getProgramAccounts). */
  async leaderboard(): Promise<Pet[]> {
    const all = await this.program.account.pet.all();
    return all.map((a) => toPet(a.publicKey, a.account)).filter((p) => p.hatched);
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
    for (let attempt = 0; ; attempt++) {
      const cfg = await this.program.account.config.fetch(CONFIG);
      const mint = petMintPda(cfg.totalPets.toNumber());
      try {
        const sig = await this.program.methods
          .adoptEgg(name)
          .accountsPartial({
            owner: this.owner,
            config: CONFIG,
            treasury: TREASURY,
            player: playerPda(this.owner),
            petMint: mint,
            petToken: petAta(mint, this.owner),
            pet: petPda(mint),
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })])
          .rpc();
        return { sig, newPetKey: petPda(mint).toBase58() };
      } catch (e) {
        if (attempt === 0 && isIdRace(e)) continue;
        throw humanError(e);
      }
    }
  }

  private petAccs(pet: Pet) {
    const mint = new PublicKey(pet.mint);
    const petToken = pet.tokenAccount ? new PublicKey(pet.tokenAccount) : petAta(mint, this.owner);
    return { owner: this.owner, config: CONFIG, pet: petPda(mint), petToken };
  }

  hatch(pet: Pet) {
    return this.run(() =>
      this.program.methods
        .hatch()
        .accountsPartial({
          ...this.petAccs(pet),
          petMint: new PublicKey(pet.mint),
          slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .rpc()
    );
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
    const ma = new PublicKey(a.mint);
    const mb = new PublicKey(b.mint);
    for (let attempt = 0; ; attempt++) {
      const cfg = await this.program.account.config.fetch(CONFIG);
      const childMint = petMintPda(cfg.totalPets.toNumber());
      try {
        const sig = await this.program.methods
          .breed(name)
          .accountsPartial({
            owner: this.owner,
            partner: this.owner, // в интерфейсе оба родителя ваши; два игрока — см. тесты
            config: CONFIG,
            player: playerPda(this.owner),
            parentA: petPda(ma),
            parentAToken: this.petAccs(a).petToken,
            parentB: petPda(mb),
            parentBToken: this.petAccs(b).petToken,
            foodMint: FOOD,
            ownerFood: foodAta(this.owner),
            childMint,
            childToken: petAta(childMint, this.owner),
            child: petPda(childMint),
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })])
          .rpc();
        return { sig, newPetKey: petPda(childMint).toBase58() };
      } catch (e) {
        if (attempt === 0 && isIdRace(e)) continue;
        throw humanError(e);
      }
    }
  }
}
