import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_SLOT_HASHES_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  getTokenMetadata,
  transferChecked,
} from "@solana/spl-token";
import { expect } from "chai";
import { Glimmo } from "../target/types/glimmo";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BPF_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

describe("glimmo", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Glimmo as Program<Glimmo>;
  const conn = provider.connection;
  const admin = provider.wallet as anchor.Wallet;
  const friend = Keypair.generate();
  const stranger = Keypair.generate();

  const pda = (...seeds: (Buffer | Uint8Array)[]) =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  const configPda = pda(Buffer.from("config"));
  const treasury = pda(Buffer.from("treasury"));
  const foodMint = pda(Buffer.from("food"));
  const programData = PublicKey.findProgramAddressSync([program.programId.toBuffer()], BPF_UPGRADEABLE)[0];
  const playerPda = (o: PublicKey) => pda(Buffer.from("player"), o.toBuffer());
  const petMintPda = (id: number) =>
    pda(Buffer.from("pet_mint"), new BN(id).toArrayLike(Buffer, "le", 8));
  const petPda = (mint: PublicKey) => pda(Buffer.from("pet"), mint.toBuffer());
  const foodAta = (o: PublicKey) => getAssociatedTokenAddressSync(foodMint, o);
  const petAta = (mint: PublicKey, o: PublicKey) =>
    getAssociatedTokenAddressSync(mint, o, false, TOKEN_2022_PROGRAM_ID);

  const params = {
    eggPrice: new BN(0.05 * LAMPORTS_PER_SOL),
    hatchSeconds: new BN(2),
    decaySeconds: new BN(3600),
    foodPerClaim: new BN(50),
    foodCooldown: new BN(3600),
    playCooldown: new BN(0),
    breedCooldown: new BN(3600),
    breedFoodCost: new BN(3),
    xpPerLevel: 10,
    teenLevel: 2,
    adultLevel: 4,
    carePeriod: new BN(3600),
  };

  type PetRef = { id: number; mint: PublicKey; pet: PublicKey };
  const sign = <T extends { rpc: () => Promise<string>; signers: (s: Keypair[]) => any }>(b: T, user: Keypair | null) =>
    user ? b.signers([user]).rpc() : b.rpc();
  const who = (user: Keypair | null) => (user ? user.publicKey : admin.publicKey);

  async function expectError(p: Promise<unknown>, code: string) {
    try {
      await p;
      expect.fail(`ожидали ошибку ${code}`);
    } catch (e: any) {
      const got = e?.error?.errorCode?.code ?? e?.message ?? String(e);
      expect(String(got)).to.contain(code);
    }
  }

  const claimFood = (user: Keypair | null) =>
    sign(
      program.methods.claimFood().accountsPartial({
        owner: who(user),
        config: configPda,
        player: playerPda(who(user)),
        foodMint,
        ownerFood: foodAta(who(user)),
      }),
      user
    );

  async function adopt(user: Keypair | null, name: string): Promise<PetRef> {
    const owner = who(user);
    const id = (await program.account.config.fetch(configPda)).totalPets.toNumber();
    const mint = petMintPda(id);
    await sign(
      program.methods.adoptEgg(name).accountsPartial({
        owner,
        config: configPda,
        treasury,
        player: playerPda(owner),
        petMint: mint,
        petToken: petAta(mint, owner),
        pet: petPda(mint),
        token2022Program: TOKEN_2022_PROGRAM_ID,
      }),
      user
    );
    return { id, mint, pet: petPda(mint) };
  }

  const petAccounts = (mint: PublicKey, owner: PublicKey) => ({
    owner,
    config: configPda,
    pet: petPda(mint),
    petToken: petAta(mint, owner),
  });

  const feed = (mint: PublicKey, amount: number, user: Keypair | null = null) =>
    sign(
      program.methods.feed(amount).accountsPartial({
        ...petAccounts(mint, who(user)),
        foodMint,
        ownerFood: foodAta(who(user)),
        tokenProgram: TOKEN_PROGRAM_ID,
      }),
      user
    );

  function play(mint: PublicKey, user: Keypair | null = null, tokenOwner?: PublicKey) {
    const acc = petAccounts(mint, who(user));
    if (tokenOwner) acc.petToken = petAta(mint, tokenOwner);
    return sign(program.methods.play().accountsPartial(acc), user);
  }

  const hatch = (mint: PublicKey, user: Keypair | null = null) =>
    sign(
      program.methods.hatch().accountsPartial({
        ...petAccounts(mint, who(user)),
        petMint: mint,
        slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      }),
      user
    );

  /** Кормим и играем, пока питомец не станет взрослым. */
  async function growToAdult(ref: PetRef, user: Keypair | null = null) {
    for (let i = 0; i < 30; i++) {
      const p = await program.account.pet.fetch(ref.pet);
      if (p.level >= params.adultLevel) return p;
      if (p.satiety < 60) await feed(ref.mint, 3, user);
      else await play(ref.mint, user);
    }
    throw new Error("не вырос");
  }

  let petA: PetRef;
  let petB: PetRef;

  before(async () => {
    for (const k of [friend, stranger]) {
      const sig = await conn.requestAirdrop(k.publicKey, 5 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
    }
  });

  it("initialize: только upgrade authority может создать игру", async () => {
    await expectError(
      program.methods
        .initialize(params)
        .accountsPartial({ admin: stranger.publicKey, programData, config: configPda, treasury, foodMint })
        .signers([stranger])
        .rpc(),
      "NotAdmin"
    );
    await program.methods
      .initialize(params)
      .accountsPartial({ admin: admin.publicKey, programData, config: configPda, treasury, foodMint })
      .rpc();
    const cfg = await program.account.config.fetch(configPda);
    expect(cfg.admin.toBase58()).to.eq(admin.publicKey.toBase58());
    const m = await getMint(conn, foodMint);
    expect(m.mintAuthority!.toBase58()).to.eq(configPda.toBase58());
    const rent = await conn.getMinimumBalanceForRentExemption(0);
    expect(await conn.getBalance(treasury)).to.be.gte(rent);
  });

  it("update_params: чужой не может, неверные и огромные значения отклоняются", async () => {
    const upd = (p: any, k: Keypair | null) =>
      sign(program.methods.updateParams(p).accountsPartial({ admin: who(k), config: configPda }), k);
    await expectError(upd(params, stranger), "NotAdmin");
    await expectError(upd({ ...params, adultLevel: 1 }, null), "BadParams");
    await expectError(upd({ ...params, hatchSeconds: new BN("9223372036854775807") }, null), "BadParams");
    await expectError(upd({ ...params, carePeriod: new BN(0) }, null), "BadParams");
  });

  it("claim_food: без питомца кормушка закрыта", async () => {
    await expectError(claimFood(stranger), "AccountNotInitialized");
  });

  it("adopt_egg: оплата, NFT Token-2022, supply = 1, ДНК ещё не известна", async () => {
    const before = await conn.getBalance(treasury);
    petA = await adopt(null, "Искра");
    expect((await conn.getBalance(treasury)) - before).to.eq(params.eggPrice.toNumber());

    const pet = await program.account.pet.fetch(petA.pet);
    expect(pet.hatched).to.eq(false);
    expect(pet.name).to.eq("Искра");
    // Защита от перебора: гены не выпадают при покупке
    expect(Buffer.from(pet.dna).equals(Buffer.alloc(32))).to.eq(true);
    expect(pet.seedSlot.toNumber()).to.be.gt(0);

    const mint = await getMint(conn, petA.mint, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(Number(mint.supply)).to.eq(1);
    expect(mint.mintAuthority).to.eq(null);

    const meta = await getTokenMetadata(conn, petA.mint);
    expect(meta!.symbol).to.eq("GLIM");
    const extra = Object.fromEntries(meta!.additionalMetadata);
    expect(extra.generation).to.eq("0");
    expect(extra.dna).to.eq("????????????????");
  });

  it("claim_food: хозяину выдаёт FOOD и соблюдает паузу", async () => {
    await claimFood(null);
    expect(Number((await getAccount(conn, foodAta(admin.publicKey))).amount)).to.eq(50);
    await expectError(claimFood(null), "FoodCooldown");
  });

  it("яйцо нельзя кормить и нельзя вылупить раньше времени", async () => {
    await expectError(feed(petA.mint, 1), "StillEgg");
    await expectError(hatch(petA.mint), "EggNotReady");
  });

  it("hatch: ДНК выпадает при вылуплении и попадает в метаданные NFT", async () => {
    petB = await adopt(friend, "Луна");
    await claimFood(friend);
    await sleep(3000);
    await hatch(petA.mint);
    await hatch(petB.mint, friend);
    const pet = await program.account.pet.fetch(petA.pet);
    expect(pet.hatched).to.eq(true);
    expect(pet.level).to.eq(1);
    expect(pet.satiety).to.eq(80);
    expect(Buffer.from(pet.dna).equals(Buffer.alloc(32))).to.eq(false);
    const extra = Object.fromEntries((await getTokenMetadata(conn, petA.mint))!.additionalMetadata);
    expect(extra.dna).to.eq(Buffer.from(pet.dna.slice(0, 8)).toString("hex"));
    await expectError(hatch(petA.mint), "AlreadyHatched");
  });

  it("feed: сжигает FOOD, а лишнюю еду не списывает", async () => {
    const before = Number((await getAccount(conn, foodAta(admin.publicKey))).amount);
    await feed(petA.mint, 1);
    let pet = await program.account.pet.fetch(petA.pet);
    expect(pet.satiety).to.eq(95);
    expect(pet.streak).to.eq(1); // первый день заботы
    expect(pet.bond).to.be.gt(0);
    // при сытости 95 нужна всего 1 единица, а не 255
    await feed(petA.mint, 255);
    pet = await program.account.pet.fetch(petA.pet);
    expect(pet.satiety).to.eq(100);
    expect(Number((await getAccount(conn, foodAta(admin.publicKey))).amount)).to.eq(before - 2);
    await expectError(feed(petA.mint, 1), "AlreadyFull");
    await expectError(feed(petA.mint, 0), "ZeroFood");
  });

  it("play и рост: множитель от настроения, эволюция и облик по уходу", async () => {
    const events: string[] = [];
    const l1 = program.addEventListener("evolved", (e) => events.push(`stage${e.stage}:form${e.form}`));
    const pet = await growToAdult(petA);
    await sleep(1200);
    await program.removeEventListener(l1);
    expect(pet.level).to.be.gte(params.adultLevel);
    expect(pet.careMistakes).to.eq(0);
    expect(pet.form).to.eq(1); // «сияющий» облик: ни разу не голодал
    expect(events).to.include("stage3:form1");
  });

  it("чужой не может играть с моим питомцем", async () => {
    await expectError(play(petA.mint, stranger, admin.publicKey), "NotOwner");
  });

  it("rename: 20 кириллических символов, имя меняется и в NFT", async () => {
    const r = (name: string) =>
      program.methods
        .rename(name)
        .accountsPartial({
          ...petAccounts(petA.mint, admin.publicKey),
          petMint: petA.mint,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    await r("Искорка-Звёздочка-ок"); // 20 символов, 37 байт
    expect((await getTokenMetadata(conn, petA.mint))!.name).to.eq("Искорка-Звёздочка-ок");
    await r("Искорка");
    expect((await program.account.pet.fetch(petA.pet)).name).to.eq("Искорка");
    await expectError(r("я".repeat(21)), "BadName");
    await expectError(r(" Искорка"), "BadName");
  });

  function breedIx(owner: PublicKey, partner: PublicKey, a: PetRef, b: PetRef, childId: number, name = "Малыш") {
    const childMint = petMintPda(childId);
    return program.methods.breed(name).accountsPartial({
      owner,
      partner,
      config: configPda,
      player: playerPda(owner),
      parentA: a.pet,
      parentAToken: petAta(a.mint, owner),
      parentB: b.pet,
      parentBToken: petAta(b.mint, partner),
      foodMint,
      ownerFood: foodAta(owner),
      childMint,
      childToken: petAta(childMint, owner),
      child: petPda(childMint),
      tokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    });
  }
  const nextId = async () => (await program.account.config.fetch(configPda)).totalPets.toNumber();

  it("breed: только взрослые и не сам с собой", async () => {
    const next = await nextId();
    await expectError(breedIx(admin.publicKey, friend.publicKey, petA, petB, next).signers([friend]).rpc(), "NotAdult");
    await expectError(breedIx(admin.publicKey, admin.publicKey, petA, petA, next).rpc(), "SamePet");
  });

  let child: PetRef;
  it("breed: два игрока, гены родителей хранятся в яйце, цена и усталость", async () => {
    await growToAdult(petB, friend);
    // подкормим родителей перед свиданием
    for (const [p, u] of [[petA, null], [petB, friend]] as const) {
      const s = await program.account.pet.fetch(p.pet);
      if (s.satiety < 90) await feed(p.mint, 3, u);
    }
    const a0 = await program.account.pet.fetch(petA.pet);
    const foodBefore = Number((await getAccount(conn, foodAta(admin.publicKey))).amount);
    const next = await nextId();
    await breedIx(admin.publicKey, friend.publicKey, petA, petB, next).signers([friend]).rpc();
    child = { id: next, mint: petMintPda(next), pet: petPda(petMintPda(next)) };

    const egg = await program.account.pet.fetch(child.pet);
    const a = await program.account.pet.fetch(petA.pet);
    const b = await program.account.pet.fetch(petB.pet);
    expect(egg.generation).to.eq(1);
    expect(egg.hatched).to.eq(false);
    expect(egg.parentA.toBase58()).to.eq(petA.pet.toBase58());
    expect(Buffer.from(egg.dna).equals(Buffer.from(a.dna))).to.eq(true);
    expect(Buffer.from(egg.dnaB).equals(Buffer.from(b.dna))).to.eq(true);
    expect(a.children).to.eq(1);
    expect(a.satiety).to.be.lte(a0.satiety - 20 + 0);
    expect(Number((await getAccount(conn, foodAta(admin.publicKey))).amount)).to.eq(foodBefore - 3);

    await expectError(
      breedIx(admin.publicKey, friend.publicKey, petA, petB, next + 1).signers([friend]).rpc(),
      "BreedCooldown"
    );
  });

  it("детёныш вылупляется со смешанными генами; с родителем скрестить нельзя", async () => {
    await sleep(3000);
    await hatch(child.mint);
    const c = await program.account.pet.fetch(child.pet);
    const a = await program.account.pet.fetch(petA.pet);
    const b = await program.account.pet.fetch(petB.pet);
    for (let i = 8; i < 32; i++) expect([a.dna[i], b.dna[i]]).to.include(c.dna[i]);
    expect(Buffer.from(c.dnaB).equals(Buffer.alloc(32))).to.eq(true);
    const meta = await getTokenMetadata(conn, child.mint);
    expect(Object.fromEntries(meta!.additionalMetadata).generation).to.eq("1");

    await growToAdult(child);
    await expectError(breedIx(admin.publicKey, admin.publicKey, child, petA, await nextId()).rpc(), "Related");
  });

  it("NFT можно передать: новый владелец ухаживает, старый — нет", async () => {
    const payer = (admin as any).payer as Keypair;
    const dest = await createAssociatedTokenAccountIdempotent(conn, payer, petA.mint, stranger.publicKey, {}, TOKEN_2022_PROGRAM_ID);
    await transferChecked(conn, payer, petAta(petA.mint, admin.publicKey), petA.mint, dest, payer, 1, 0, [], {}, TOKEN_2022_PROGRAM_ID);
    await play(petA.mint, stranger);
    await expectError(play(petA.mint), "NotOwner");
  });

  it("withdraw_treasury: только админ и не ниже ренты", async () => {
    const wd = (k: Keypair | null, lamports: number) =>
      sign(
        program.methods.withdrawTreasury(new BN(lamports)).accountsPartial({ admin: who(k), config: configPda, treasury }),
        k
      );
    await expectError(wd(stranger, 1000), "NotAdmin");
    const rent = await conn.getMinimumBalanceForRentExemption(0);
    const bal = await conn.getBalance(treasury);
    await expectError(wd(null, bal), "TreasuryEmpty");
    await wd(null, bal - rent);
    expect(await conn.getBalance(treasury)).to.eq(rent);
  });
});
