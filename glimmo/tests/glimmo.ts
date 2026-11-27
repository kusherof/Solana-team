import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_SLOT_HASHES_PUBKEY,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
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
  };

  async function expectError(p: Promise<unknown>, code: string) {
    try {
      await p;
      expect.fail(`ожидали ошибку ${code}`);
    } catch (e: any) {
      const got = e?.error?.errorCode?.code ?? e?.message ?? String(e);
      expect(String(got)).to.contain(code);
    }
  }

  async function claimFood(user: Keypair | null) {
    const owner = user ? user.publicKey : admin.publicKey;
    const b = program.methods.claimFood().accountsPartial({
      owner,
      config: configPda,
      player: playerPda(owner),
      foodMint,
      ownerFood: foodAta(owner),
    });
    return user ? b.signers([user]).rpc() : b.rpc();
  }

  async function adopt(user: Keypair | null, name: string) {
    const owner = user ? user.publicKey : admin.publicKey;
    const cfg = await program.account.config.fetch(configPda);
    const id = cfg.totalPets.toNumber();
    const mint = petMintPda(id);
    const b = program.methods.adoptEgg(name).accountsPartial({
      owner,
      config: configPda,
      treasury,
      player: playerPda(owner),
      petMint: mint,
      petToken: petAta(mint, owner),
      pet: petPda(mint),
      slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    });
    await (user ? b.signers([user]).rpc() : b.rpc());
    return { id, mint, pet: petPda(mint) };
  }

  function petAccounts(mint: PublicKey, owner: PublicKey) {
    return {
      owner,
      config: configPda,
      pet: petPda(mint),
      petToken: petAta(mint, owner),
    };
  }

  async function feed(mint: PublicKey, amount: number, user: Keypair | null = null) {
    const owner = user ? user.publicKey : admin.publicKey;
    const b = program.methods.feed(amount).accountsPartial({
      ...petAccounts(mint, owner),
      foodMint,
      ownerFood: foodAta(owner),
      tokenProgram: TOKEN_PROGRAM_ID,
    });
    return user ? b.signers([user]).rpc() : b.rpc();
  }

  async function play(mint: PublicKey, user: Keypair | null = null, tokenOwner?: PublicKey) {
    const owner = user ? user.publicKey : admin.publicKey;
    const acc = petAccounts(mint, owner);
    if (tokenOwner) acc.petToken = petAta(mint, tokenOwner);
    const b = program.methods.play().accountsPartial(acc);
    return user ? b.signers([user]).rpc() : b.rpc();
  }

  async function hatch(mint: PublicKey, user: Keypair | null = null) {
    const owner = user ? user.publicKey : admin.publicKey;
    const b = program.methods.hatch().accountsPartial(petAccounts(mint, owner));
    return user ? b.signers([user]).rpc() : b.rpc();
  }

  let petA: { id: number; mint: PublicKey; pet: PublicKey };
  let petB: { id: number; mint: PublicKey; pet: PublicKey };

  before(async () => {
    for (const k of [friend, stranger]) {
      const sig = await conn.requestAirdrop(k.publicKey, 5 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
    }
  });

  it("initialize: конфиг, mint еды и казна", async () => {
    await program.methods
      .initialize(params)
      .accountsPartial({ admin: admin.publicKey, config: configPda, treasury, foodMint })
      .rpc();
    const cfg = await program.account.config.fetch(configPda);
    expect(cfg.admin.toBase58()).to.eq(admin.publicKey.toBase58());
    expect(cfg.totalPets.toNumber()).to.eq(0);
    const m = await getMint(conn, foodMint);
    expect(m.mintAuthority!.toBase58()).to.eq(configPda.toBase58());
    expect(m.decimals).to.eq(0);
    const rent = await conn.getMinimumBalanceForRentExemption(0);
    expect(await conn.getBalance(treasury)).to.be.gte(rent);
  });

  it("update_params: чужой не может, неверные параметры отклоняются", async () => {
    await expectError(
      program.methods
        .updateParams(params)
        .accountsPartial({ admin: stranger.publicKey, config: configPda })
        .signers([stranger])
        .rpc(),
      "NotAdmin"
    );
    await expectError(
      program.methods
        .updateParams({ ...params, adultLevel: 1 })
        .accountsPartial({ admin: admin.publicKey, config: configPda })
        .rpc(),
      "BadParams"
    );
  });

  it("claim_food: выдаёт FOOD и соблюдает паузу", async () => {
    await claimFood(null);
    await claimFood(friend);
    expect(Number((await getAccount(conn, foodAta(admin.publicKey))).amount)).to.eq(50);
    await expectError(claimFood(null), "FoodCooldown");
  });

  it("adopt_egg: оплата, NFT Token-2022 с метаданными, supply = 1", async () => {
    const before = await conn.getBalance(treasury);
    petA = await adopt(null, "Искра");
    expect((await conn.getBalance(treasury)) - before).to.eq(params.eggPrice.toNumber());

    const pet = await program.account.pet.fetch(petA.pet);
    expect(pet.hatched).to.eq(false);
    expect(pet.name).to.eq("Искра");
    expect(pet.generation).to.eq(0);
    expect(Buffer.from(pet.dna).equals(Buffer.alloc(32))).to.eq(false);

    const mint = await getMint(conn, petA.mint, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(Number(mint.supply)).to.eq(1);
    expect(mint.decimals).to.eq(0);
    expect(mint.mintAuthority).to.eq(null); // больше выпустить нельзя

    const meta = await getTokenMetadata(conn, petA.mint);
    expect(meta!.name).to.eq("Искра");
    expect(meta!.symbol).to.eq("GLIM");
    const extra = Object.fromEntries(meta!.additionalMetadata);
    expect(extra.generation).to.eq("0");
    expect(extra.dna).to.eq(Buffer.from(pet.dna.slice(0, 8)).toString("hex"));

    const ta = await getAccount(conn, petAta(petA.mint, admin.publicKey), "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(Number(ta.amount)).to.eq(1);
  });

  it("яйцо нельзя кормить и нельзя вылупить раньше времени", async () => {
    await expectError(feed(petA.mint, 1), "StillEgg");
    await expectError(hatch(petA.mint), "EggNotReady");
  });

  it("hatch: через таймер питомец вылупляется", async () => {
    petB = await adopt(friend, "Луна");
    await sleep(3000);
    await hatch(petA.mint);
    await hatch(petB.mint, friend);
    const pet = await program.account.pet.fetch(petA.pet);
    expect(pet.hatched).to.eq(true);
    expect(pet.level).to.eq(1);
    expect(pet.satiety).to.eq(80);
    await expectError(hatch(petA.mint), "AlreadyHatched");
  });

  it("feed: сжигает FOOD, растут сытость и опыт, сытого не кормят", async () => {
    const supplyBefore = Number((await getMint(conn, foodMint)).supply);
    await feed(petA.mint, 1);
    let pet = await program.account.pet.fetch(petA.pet);
    expect(pet.satiety).to.eq(95);
    expect(pet.mood).to.eq(84);
    // 10 опыта = ровно уровень 2 (xp_per_level=10)
    expect(pet.level).to.eq(2);
    expect(Number((await getMint(conn, foodMint)).supply)).to.eq(supplyBefore - 1);

    await feed(petA.mint, 2);
    pet = await program.account.pet.fetch(petA.pet);
    expect(pet.satiety).to.eq(100);
    await expectError(feed(petA.mint, 1), "AlreadyFull");
    await expectError(feed(petA.mint, 0), "ZeroFood");
  });

  it("play: настроение и опыт, рост до взрослого (события LevelUp/Evolved)", async () => {
    const events: string[] = [];
    const l1 = program.addEventListener("levelUp", (e) => events.push(`lvl${e.level}`));
    const l2 = program.addEventListener("evolved", (e) => events.push(`stage${e.stage}`));
    await play(petA.mint);
    await play(petA.mint);
    await sleep(1500);
    await program.removeEventListener(l1);
    await program.removeEventListener(l2);
    const pet = await program.account.pet.fetch(petA.pet);
    expect(pet.level).to.be.gte(4);
    expect(pet.mood).to.eq(100);
    expect(pet.satiety).to.eq(100 - 16);
    expect(events).to.include("stage3"); // стал взрослым
  });

  it("чужой не может играть с моим питомцем", async () => {
    await expectError(play(petA.mint, stranger, admin.publicKey), "NotOwner");
  });

  it("rename: меняет имя и в Pet, и в метаданных NFT", async () => {
    await program.methods
      .rename("Искорка")
      .accountsPartial({
        ...petAccounts(petA.mint, admin.publicKey),
        petMint: petA.mint,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    expect((await program.account.pet.fetch(petA.pet)).name).to.eq("Искорка");
    expect((await getTokenMetadata(conn, petA.mint))!.name).to.eq("Искорка");
    await expectError(
      program.methods
        .rename("x".repeat(21))
        .accountsPartial({
          ...petAccounts(petA.mint, admin.publicKey),
          petMint: petA.mint,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .rpc(),
      "BadName"
    );
  });

  function breedIx(
    owner: PublicKey,
    partner: PublicKey,
    a: { mint: PublicKey },
    b: { mint: PublicKey },
    childId: number,
    name = "Малыш"
  ) {
    const childMint = petMintPda(childId);
    return program.methods.breed(name).accountsPartial({
      owner,
      partner,
      config: configPda,
      player: playerPda(owner),
      parentA: petPda(a.mint),
      parentAToken: petAta(a.mint, owner),
      parentB: petPda(b.mint),
      parentBToken: petAta(b.mint, partner),
      foodMint,
      ownerFood: foodAta(owner),
      childMint,
      childToken: petAta(childMint, owner),
      child: petPda(childMint),
      slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
      tokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    });
  }

  it("breed: только взрослые и не сам с собой", async () => {
    const next = (await program.account.config.fetch(configPda)).totalPets.toNumber();
    await expectError(
      breedIx(admin.publicKey, friend.publicKey, petA, petB, next).signers([friend]).rpc(),
      "NotAdult"
    );
    await expectError(
      breedIx(admin.publicKey, admin.publicKey, petA, petA, next).rpc(),
      "SamePet"
    );
  });

  it("breed: два игрока скрещивают питомцев, гены наследуются", async () => {
    // растим питомца друга до взрослого
    await play(petB.mint, friend);
    await play(petB.mint, friend);
    const foodBefore = Number((await getAccount(conn, foodAta(admin.publicKey))).amount);
    const next = (await program.account.config.fetch(configPda)).totalPets.toNumber();
    await breedIx(admin.publicKey, friend.publicKey, petA, petB, next).signers([friend]).rpc();

    const childMint = petMintPda(next);
    const child = await program.account.pet.fetch(petPda(childMint));
    const a = await program.account.pet.fetch(petA.pet);
    const b = await program.account.pet.fetch(petB.pet);
    expect(child.generation).to.eq(1);
    expect(child.hatched).to.eq(false);
    expect(child.parentA.toBase58()).to.eq(petA.pet.toBase58());
    expect(child.parentB.toBase58()).to.eq(petB.pet.toBase58());
    expect(a.children).to.eq(1);
    expect(b.children).to.eq(1);
    // невидимые гены (8..32) берутся строго от родителей
    for (let i = 8; i < 32; i++) {
      expect([a.dna[i], b.dna[i]]).to.include(child.dna[i]);
    }
    expect(Number((await getAccount(conn, foodAta(admin.publicKey))).amount)).to.eq(foodBefore - 3);
    const meta = await getTokenMetadata(conn, childMint);
    expect(Object.fromEntries(meta!.additionalMetadata).generation).to.eq("1");

    // повторно — пауза
    await expectError(
      breedIx(admin.publicKey, friend.publicKey, petA, petB, next + 1).signers([friend]).rpc(),
      "BreedCooldown"
    );
  });

  it("NFT можно передать: новый владелец ухаживает, старый — нет", async () => {
    const payer = (admin as any).payer as Keypair;
    const dest = await createAssociatedTokenAccountIdempotent(
      conn, payer, petA.mint, stranger.publicKey, {}, TOKEN_2022_PROGRAM_ID
    );
    await transferChecked(
      conn, payer, petAta(petA.mint, admin.publicKey), petA.mint, dest, payer, 1, 0, [], {},
      TOKEN_2022_PROGRAM_ID
    );
    await play(petA.mint, stranger);
    await expectError(play(petA.mint), "NotOwner");
  });

  it("withdraw_treasury: только админ и не ниже ренты", async () => {
    const wd = (who: Keypair | null, lamports: number) => {
      const b = program.methods.withdrawTreasury(new BN(lamports)).accountsPartial({
        admin: who ? who.publicKey : admin.publicKey,
        config: configPda,
        treasury,
      });
      return who ? b.signers([who]).rpc() : b.rpc();
    };
    await expectError(wd(stranger, 1000), "NotAdmin");
    const rent = await conn.getMinimumBalanceForRentExemption(0);
    const bal = await conn.getBalance(treasury);
    await expectError(wd(null, bal), "TreasuryEmpty");
    await wd(null, bal - rent);
    expect(await conn.getBalance(treasury)).to.eq(rent);
  });
});
