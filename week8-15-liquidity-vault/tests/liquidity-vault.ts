/**
 * Интеграционный тест Liquidity Vault на локальном валидаторе.
 * Проходит весь сценарий Demo Day:
 *   создать vault → карточки → депозит → доход → депозит «по новой цене» → вывод →
 *   CLMM-пул Raydium → swap (и отклонённый swap из-за slippage) → открыть позицию →
 *   обмены трейдера → собрать комиссии → закрыть позицию → обмен назад → вывод всем.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Connection,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getMint,
  getAssociatedTokenAddressSync,
  transfer,
} from "@solana/spl-token";
import { assert, expect } from "chai";
import * as fs from "fs";
import * as path from "path";

import { LiquidityVault } from "../target/types/liquidity_vault";
import clmmIdl from "../sdk/raydium_clmm_idl.json";
import {
  pda as rpda,
  sortMints,
  priceToSqrtPriceX64,
  sqrtPriceX64ToPrice,
  tickArrayStartIndex,
  liquidityFromAmounts,
  amountsFromLiquidity,
  getSwapTickArrays,
  MIN_SQRT_PRICE_X64,
  MAX_SQRT_PRICE_X64,
} from "../sdk/raydium";
import {
  vaultPdas,
  userAccountPda,
  computeIx,
  swapAccounts,
  openPositionAccounts,
  managePositionAccounts,
  MEMO_PROGRAM_ID,
} from "../sdk/vault";

const DEC = 6;
const ONE = 10 ** DEC;
const units = (n: number) => new BN(Math.round(n * ONE));

describe("liquidity-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection: Connection = provider.connection;
  const program = anchor.workspace.liquidityVault as Program<LiquidityVault>;
  const clmm = new Program(clmmIdl as any, provider);

  const admin = (provider.wallet as anchor.Wallet).payer;
  const clmmAdmin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/clmm-admin-keypair.json"), "utf8"))),
  );
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const carol = Keypair.generate();
  const trader = Keypair.generate();

  let mintA: PublicKey;
  let mintB: PublicKey;
  let p: ReturnType<typeof vaultPdas>;
  const ata: Record<string, { a: PublicKey; b?: PublicKey }> = {};

  let ammConfig: PublicKey;
  let pool: PublicKey;
  let mint0: PublicKey;
  let mint1: PublicKey;

  const bal = async (acc: PublicKey) => BigInt((await getAccount(connection, acc)).amount.toString());
  const shareSupply = async () => BigInt((await getMint(connection, p.shareMint)).supply.toString());

  const airdrop = async (to: PublicKey, sol = 10) => {
    const sig = await connection.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  };

  /** Ожидаем, что транзакция упадёт с указанной ошибкой */
  const expectError = async (fn: () => Promise<any>, code: string) => {
    try {
      await fn();
      assert.fail(`ожидалась ошибка ${code}`);
    } catch (e: any) {
      const text = (e.logs ?? []).join("\n") + String(e) + JSON.stringify(e.error ?? {});
      expect(text).to.contain(code);
    }
  };

  before(async () => {
    for (const kp of [alice, bob, carol, trader, clmmAdmin]) await airdrop(kp.publicKey);

    mintA = await createMint(connection, admin, admin.publicKey, null, DEC);
    mintB = await createMint(connection, admin, admin.publicKey, null, DEC);
    p = vaultPdas(program.programId, mintA);

    for (const [name, kp] of Object.entries({ admin, alice, bob, carol, trader })) {
      const a = await createAssociatedTokenAccount(connection, admin, mintA, kp.publicKey);
      const b = await createAssociatedTokenAccount(connection, admin, mintB, kp.publicKey);
      await mintTo(connection, admin, mintA, a, admin, 1_000_000 * ONE);
      await mintTo(connection, admin, mintB, b, admin, 1_000_000 * ONE);
      ata[name] = { a, b };
    }
  });

  // ---------------------------------------------------------------- Неделя 8
  describe("Неделя 8: каркас", () => {
    it("создаёт vault, share-токен и хранилище", async () => {
      await program.methods
        .initializeVault(new BN(1 * LAMPORTS_PER_SOL)) // SOL для аренды аккаунтов Raydium
        .accounts({ admin: admin.publicKey, mintA })
        .rpc();

      const vault = await program.account.vault.fetch(p.vault);
      assert.ok(vault.admin.equals(admin.publicKey));
      assert.ok(vault.mintA.equals(mintA));
      assert.ok(vault.shareMint.equals(p.shareMint));
      assert.ok(vault.vaultA.equals(p.vaultA));

      // share-токен выпускает только PDA vault_authority
      const share = await getMint(connection, p.shareMint);
      assert.ok(share.mintAuthority!.equals(p.vaultAuthority));
      assert.equal(share.decimals, DEC);
      // хранилищем владеет PDA, а не админ
      const va = await getAccount(connection, p.vaultA);
      assert.ok(va.owner.equals(p.vaultAuthority));
      // vault_authority — PDA, у него нет приватного ключа
      assert.isFalse(PublicKey.isOnCurve(p.vaultAuthority.toBytes()));
    });

    it("пользователи открывают свои карточки (PDA от адреса пользователя)", async () => {
      for (const u of [alice, bob]) {
        await program.methods.openUserAccount().accounts({ user: u.publicKey, vault: p.vault }).signers([u]).rpc();
        const ua = await program.account.userAccount.fetch(userAccountPda(program.programId, p.vault, u.publicKey));
        assert.ok(ua.owner.equals(u.publicKey));
      }
    });
  });

  // ---------------------------------------------------------------- Неделя 9
  const deposit = (u: Keypair, name: string, amount: BN) =>
    program.methods
      .deposit(amount)
      .accounts({
        user: u.publicKey,
        vault: p.vault,
        mintA,
        shareMint: p.shareMint,
        vaultA: p.vaultA,
        vaultB: null,
        userTokenA: ata[name].a,
      } as any)
      .signers([u])
      .rpc();

  describe("Неделя 9: депозит и share-токены", () => {
    it("первый вкладчик получает share 1:1", async () => {
      await deposit(alice, "alice", units(1000));
      const aliceShare = getAssociatedTokenAddressSync(p.shareMint, alice.publicKey);
      assert.equal(await bal(aliceShare), BigInt(1000 * ONE));
      assert.equal(await bal(p.vaultA), BigInt(1000 * ONE));
    });

    it("запрещает депозит 0", async () => {
      await expectError(() => deposit(alice, "alice", new BN(0)), "ZeroAmount");
    });

    it("минимальный депозит — 1 токен (0.5 токена отклоняется)", async () => {
      await expectError(() => deposit(alice, "alice", units(0.5)), "DepositTooSmall");
    });

    it("пример из методички: 1100 в vault, 1000 share → за 110 токенов дают 100 share", async () => {
      // «Vault поработал и заработал» — имитируем доход прямым переводом 100 токенов в хранилище
      await transfer(connection, admin, ata.admin.a, p.vaultA, admin, 100 * ONE);
      await deposit(bob, "bob", units(110));
      const bobShare = getAssociatedTokenAddressSync(p.shareMint, bob.publicKey);
      assert.equal(await bal(bobShare), BigInt(100 * ONE));
      const ua = await program.account.userAccount.fetch(userAccountPda(program.programId, p.vault, bob.publicKey));
      assert.equal(ua.deposited.toNumber(), 110 * ONE);
      assert.equal(ua.sharesMinted.toNumber(), 100 * ONE);
    });
  });

  // ---------------------------------------------------------------- Неделя 10
  const withdraw = (u: Keypair, name: string, shares: BN, withB = false) =>
    program.methods
      .withdraw(shares)
      .accounts({
        user: u.publicKey,
        vault: p.vault,
        mintA,
        shareMint: p.shareMint,
        vaultA: p.vaultA,
        vaultB: withB ? p.vaultB : null,
        userTokenA: ata[name].a,
        userShare: getAssociatedTokenAddressSync(p.shareMint, u.publicKey),
      } as any)
      .signers([u])
      .rpc();

  const withdrawAll = (u: Keypair, name: string, withB = false) =>
    program.methods
      .withdrawAll()
      .accounts({
        user: u.publicKey,
        vault: p.vault,
        mintA,
        shareMint: p.shareMint,
        vaultA: p.vaultA,
        vaultB: withB ? p.vaultB : null,
        userTokenA: ata[name].a,
        userShare: getAssociatedTokenAddressSync(p.shareMint, u.publicKey),
      } as any)
      .signers([u])
      .rpc();

  const closeCard = (u: Keypair) =>
    program.methods
      .closeUserAccount()
      .accounts({
        user: u.publicKey,
        vault: p.vault,
        shareMint: p.shareMint,
        userShare: getAssociatedTokenAddressSync(p.shareMint, u.publicKey),
      } as any)
      .signers([u])
      .rpc();

  describe("Неделя 10: CPI и вывод", () => {
    it("вывод: сжигаем share, получаем долю (100 share → 110 токенов)", async () => {
      const before = await bal(ata.alice.a);
      const sig = await withdraw(alice, "alice", units(100));
      await connection.confirmTransaction(sig, "confirmed");
      const after = await bal(ata.alice.a);
      assert.equal(after - before, BigInt(110 * ONE));

      // В транзакции видны inner instructions — CPI в Token Program (burn + transferChecked)
      const tx = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      const inner = tx!.meta!.innerInstructions!.flatMap((i) => i.instructions);
      const keys = tx!.transaction.message.getAccountKeys();
      const programs = inner.map((ix) => keys.get(ix.programIdIndex)!.toBase58());
      assert.equal(programs.filter((x) => x === TOKEN_PROGRAM_ID.toBase58()).length, 2);
    });

    it("нельзя вывести больше share, чем выпущено", async () => {
      await expectError(() => withdraw(bob, "bob", units(1_000_000)), "AmountTooSmall");
    });

    it("три пользователя: доля каждого в vault пропорциональна его share", async () => {
      await program.methods.openUserAccount().accounts({ user: carol.publicKey, vault: p.vault }).signers([carol]).rpc();
      // сейчас в vault 1100 токенов и 1000 share (цена 1.1) → за 330 токенов carol получает 300 share
      await deposit(carol, "carol", units(330));
      const supply = await shareSupply();
      const assets = await bal(p.vaultA);
      const shares = {
        alice: await bal(getAssociatedTokenAddressSync(p.shareMint, alice.publicKey)),
        bob: await bal(getAssociatedTokenAddressSync(p.shareMint, bob.publicKey)),
        carol: await bal(getAssociatedTokenAddressSync(p.shareMint, carol.publicKey)),
      };
      assert.equal(shares.alice + shares.bob + shares.carol, supply);
      const value = (s: bigint) => (s * assets) / supply;
      assert.equal(value(shares.alice), BigInt(990 * ONE));
      assert.equal(value(shares.bob), BigInt(110 * ONE));
      assert.equal(value(shares.carol), BigInt(330 * ONE));
      assert.equal(shares.carol, BigInt(300 * ONE));
    });

    it("withdraw_all: carol выводит все свои share одним вызовом", async () => {
      const before = await bal(ata.carol.a);
      await withdrawAll(carol, "carol");
      assert.equal(await bal(getAssociatedTokenAddressSync(p.shareMint, carol.publicKey)), 0n);
      assert.equal((await bal(ata.carol.a)) - before, BigInt(330 * ONE));
    });

    it("нельзя закрыть карточку, пока у пользователя есть share", async () => {
      await expectError(() => closeCard(bob), "CardNotEmpty");
    });

    it("пустая карточка закрывается, рента возвращается пользователю", async () => {
      const card = userAccountPda(program.programId, p.vault, carol.publicKey);
      const rent = (await connection.getAccountInfo(card))!.lamports;
      const before = await connection.getBalance(carol.publicKey);
      await closeCard(carol);
      assert.isNull(await connection.getAccountInfo(card));
      // комиссию за транзакцию платит провайдер (админ), поэтому carol получает ренту целиком
      assert.equal((await connection.getBalance(carol.publicKey)) - before, rent);
    });
  });

  // ---------------------------------------------------------------- Неделя 11
  describe("Неделя 11: свои токены и CLMM-пул Raydium", () => {
    it("создаёт AmmConfig, пул с ценой 1.0 и позицию трейдера", async () => {
      ammConfig = rpda.ammConfig(clmm.programId, 0);
      await clmm.methods
        .createAmmConfig(0, 10, 2500, 120000, 40000) // tick spacing 10, комиссия 0.25%
        .accounts({ owner: clmmAdmin.publicKey, ammConfig, systemProgram: SystemProgram.programId } as any)
        .signers([clmmAdmin])
        .rpc();

      [mint0, mint1] = sortMints(mintA, mintB);
      pool = rpda.pool(clmm.programId, ammConfig, mint0, mint1);
      const now = Math.floor(Date.now() / 1000);
      await clmm.methods
        .createPool(priceToSqrtPriceX64(1, DEC, DEC), new BN(now - 60))
        .accounts({
          poolCreator: admin.publicKey,
          ammConfig,
          poolState: pool,
          tokenMint0: mint0,
          tokenMint1: mint1,
          tokenVault0: rpda.poolVault(clmm.programId, pool, mint0),
          tokenVault1: rpda.poolVault(clmm.programId, pool, mint1),
          observationState: rpda.observation(clmm.programId, pool),
          tickArrayBitmap: rpda.bitmapExtension(clmm.programId, pool),
          tokenProgram0: TOKEN_PROGRAM_ID,
          tokenProgram1: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .rpc();

      const ps: any = await (clmm.account as any).poolState.fetch(pool);
      assert.closeTo(sqrtPriceX64ToPrice(ps.sqrtPriceX64, DEC, DEC), 1, 1e-9);

      // Трейдер (внешний LP) кладёт ликвидность в широкий диапазон [-6000, 6000] (~ ±45%)
      await traderOpenPosition(-6000, 6000, units(50_000), units(50_000));
    });
  });

  async function traderOpenPosition(tl: number, tu: number, a0: BN, a1: BN) {
    const ps: any = await (clmm.account as any).poolState.fetch(pool);
    const nft = Keypair.generate();
    const ls = tickArrayStartIndex(tl, ps.tickSpacing);
    const us = tickArrayStartIndex(tu, ps.tickSpacing);
    const liq = liquidityFromAmounts(ps.sqrtPriceX64, tl, tu, a0, a1);
    const t0 = mint0.equals(mintA) ? ata.trader.a : ata.trader.b!;
    const t1 = mint1.equals(mintA) ? ata.trader.a : ata.trader.b!;
    await clmm.methods
      .openPositionWithToken22Nft(tl, tu, ls, us, liq, a0.muln(2), a1.muln(2), false, null)
      .accounts({
        payer: trader.publicKey,
        positionNftOwner: trader.publicKey,
        positionNftMint: nft.publicKey,
        positionNftAccount: getAssociatedTokenAddressSync(nft.publicKey, trader.publicKey, false, TOKEN_2022_PROGRAM_ID),
        poolState: pool,
        protocolPosition: rpda.protocolPosition(clmm.programId, pool, tl, tu),
        tickArrayLower: rpda.tickArray(clmm.programId, pool, ls),
        tickArrayUpper: rpda.tickArray(clmm.programId, pool, us),
        personalPosition: rpda.personalPosition(clmm.programId, nft.publicKey),
        tokenAccount0: t0,
        tokenAccount1: t1,
        tokenVault0: ps.tokenVault0,
        tokenVault1: ps.tokenVault1,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        vault0Mint: mint0,
        vault1Mint: mint1,
      } as any)
      .remainingAccounts([{ pubkey: rpda.bitmapExtension(clmm.programId, pool), isSigner: false, isWritable: true }])
      .preInstructions([computeIx()])
      .signers([trader, nft])
      .rpc();
  }

  /** Обмен трейдера напрямую в Raydium (генерирует комиссии для позиции vault) */
  async function traderSwap(inputIsA: boolean, amount: BN) {
    const ps: any = await (clmm.account as any).poolState.fetch(pool);
    const inMint = inputIsA ? mintA : mintB;
    const zeroForOne = inMint.equals(ps.tokenMint0);
    const tas = await getSwapTickArrays(connection, clmm.programId, pool, ps.tickCurrent, ps.tickSpacing, zeroForOne);
    await clmm.methods
      .swapV2(amount, new BN(0), new BN(0), true)
      .accounts({
        payer: trader.publicKey,
        ammConfig,
        poolState: pool,
        inputTokenAccount: inputIsA ? ata.trader.a : ata.trader.b,
        outputTokenAccount: inputIsA ? ata.trader.b : ata.trader.a,
        inputVault: zeroForOne ? ps.tokenVault0 : ps.tokenVault1,
        outputVault: zeroForOne ? ps.tokenVault1 : ps.tokenVault0,
        observationState: ps.observationKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenProgram2022: TOKEN_2022_PROGRAM_ID,
        memoProgram: MEMO_PROGRAM_ID,
        inputVaultMint: inMint,
        outputVaultMint: inputIsA ? mintB : mintA,
      } as any)
      .remainingAccounts([
        { pubkey: rpda.bitmapExtension(clmm.programId, pool), isSigner: false, isWritable: false },
        ...tas.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })),
      ])
      .preInstructions([computeIx()])
      .signers([trader])
      .rpc();
  }

  // ---------------------------------------------------------------- Неделя 12
  /** Квота: симулируем swap и читаем фактический выход из события SwapEvent */
  async function quoteVaultSwap(aToB: boolean, amountIn: BN): Promise<BN> {
    const { accounts, remaining } = await swapAccounts(program, clmm, mintA, aToB);
    const sim = await program.methods
      .swap(amountIn, new BN(0), new BN(0), aToB)
      .accounts(accounts)
      .remainingAccounts(remaining)
      .preInstructions([computeIx()])
      .simulate();
    const ev = sim.events.find((e) => e.name === "swapEvent")!;
    return (ev.data as any).amountOut as BN;
  }

  async function vaultSwap(aToB: boolean, amountIn: BN, minOut: BN, signer: Keypair = admin) {
    const { accounts, remaining } = await swapAccounts(program, clmm, mintA, aToB);
    accounts.admin = signer.publicKey;
    return program.methods
      .swap(amountIn, minOut, new BN(0), aToB)
      .accounts(accounts)
      .remainingAccounts(remaining)
      .preInstructions([computeIx()])
      .signers([signer])
      .rpc();
  }

  describe("Неделя 12: swap через Raydium", () => {
    it("только админ привязывает пул; создаётся хранилище B", async () => {
      await expectError(
        () =>
          program.methods
            .configurePool()
            .accounts({ admin: alice.publicKey, vault: p.vault, poolState: pool, mintB } as any)
            .signers([alice])
            .rpc(),
        "Unauthorized",
      );
      await program.methods
        .configurePool()
        .accounts({ admin: admin.publicKey, vault: p.vault, poolState: pool, mintB } as any)
        .rpc();
      const vault = await program.account.vault.fetch(p.vault);
      assert.ok(vault.poolState.equals(pool));
      assert.ok(vault.vaultB.equals(p.vaultB));
    });

    it("не-админ не может делать обмен", async () => {
      await expectError(() => vaultSwap(true, units(10), new BN(0), alice), "Unauthorized");
    });

    it("отклоняет обмен, если пул отдаёт меньше минимума (slippage)", async () => {
      const amountIn = units(400);
      const expected = await quoteVaultSwap(true, amountIn);
      // требуем в 2 раза больше, чем реально отдаст пул → Raydium откатывает транзакцию
      await expectError(() => vaultSwap(true, amountIn, expected.muln(2)), "TooLittleOutputReceived");
    });

    it("за один обмен нельзя отдать больше 50% токена A vault (SwapTooLarge)", async () => {
      const total = new BN((await bal(p.vaultA)).toString());
      await expectError(() => vaultSwap(true, total.divn(2).addn(1), new BN(0)), "SwapTooLarge");
    });

    it("обменивает половину A на B с минимумом -1% от ожидаемого", async () => {
      const total = new BN((await bal(p.vaultA)).toString());
      const amountIn = total.divn(2);
      const expected = await quoteVaultSwap(true, amountIn);
      const minOut = expected.muln(99).divn(100);
      const before: any = await (clmm.account as any).poolState.fetch(pool);
      await vaultSwap(true, amountIn, minOut);
      const after: any = await (clmm.account as any).poolState.fetch(pool);
      const got = await bal(p.vaultB);
      assert.isTrue(got >= BigInt(minOut.toString()));
      const pb = sqrtPriceX64ToPrice(before.sqrtPriceX64, DEC, DEC);
      const pa = sqrtPriceX64ToPrice(after.sqrtPriceX64, DEC, DEC);
      console.log(`      цена пула (token1/token0): ${pb.toFixed(6)} → ${pa.toFixed(6)}, получено B: ${Number(got) / ONE}`);
      assert.notEqual(pa, pb);
    });

    it("пока средства в B, депозит и вывод закрыты (VaultNotIdle)", async () => {
      await expectError(
        () =>
          program.methods
            .deposit(units(1))
            .accounts({
              user: bob.publicKey,
              vault: p.vault,
              mintA,
              shareMint: p.shareMint,
              vaultA: p.vaultA,
              vaultB: p.vaultB,
              userTokenA: ata.bob.a,
            } as any)
            .signers([bob])
            .rpc(),
        "VaultNotIdle",
      );
    });
  });

  // ---------------------------------------------------------------- Неделя 13
  let tickLower: number;
  let tickUpper: number;

  describe("Неделя 13: позиция в CLMM-пуле", () => {
    it("открывает позицию ±~10% вокруг текущей цены", async () => {
      const ps: any = await (clmm.account as any).poolState.fetch(pool);
      const spacing = ps.tickSpacing;
      // ±1000 тиков ≈ ±10% цены
      tickLower = Math.floor((ps.tickCurrent - 1000) / spacing) * spacing;
      tickUpper = Math.ceil((ps.tickCurrent + 1000) / spacing) * spacing;

      const a = new BN((await bal(p.vaultA)).toString());
      const b = new BN((await bal(p.vaultB)).toString());
      const amount0 = mint0.equals(mintA) ? a : b;
      const amount1 = mint0.equals(mintA) ? b : a;
      // берём 98% от того, что можно — запас на округления
      const liquidity = liquidityFromAmounts(ps.sqrtPriceX64, tickLower, tickUpper, amount0, amount1).muln(98).divn(100);

      const nft = Keypair.generate();
      const o = await openPositionAccounts(program, clmm, mintA, tickLower, tickUpper, nft);
      await program.methods
        .openPosition(tickLower, tickUpper, o.lowerStart, o.upperStart, liquidity, amount0, amount1)
        .accounts(o.accounts as any)
        .remainingAccounts(o.remaining)
        .preInstructions([computeIx()])
        .signers([nft])
        .rpc();

      const vault = await program.account.vault.fetch(p.vault);
      assert.ok(vault.positionNftMint.equals(nft.publicKey));
      // NFT позиции принадлежит PDA vault
      const nftAcc = await getAccount(connection, o.accounts.positionNftAccount, "processed", TOKEN_2022_PROGRAM_ID);
      assert.ok(nftAcc.owner.equals(p.vaultAuthority));
      assert.equal(nftAcc.amount, BigInt(1));
      console.log(`      диапазон тиков [${tickLower}, ${tickUpper}], ликвидность ${liquidity.toString()}`);
      console.log(`      осталось в vault: A=${Number(await bal(p.vaultA)) / ONE}, B=${Number(await bal(p.vaultB)) / ONE}`);
    });

    it("пока позиция открыта, вывод закрыт (VaultNotIdle)", async () => {
      await expectError(
        () => withdraw(bob, "bob", units(1), true),
        "VaultNotIdle",
      );
    });

    it("трейдер делает несколько обменов → собираем комиссии", async () => {
      for (let i = 0; i < 4; i++) {
        await traderSwap(true, units(2000));
        await traderSwap(false, units(2000));
      }
      const m = await managePositionAccounts(program, clmm, mintA);
      const a0 = await bal(p.vaultA);
      const b0 = await bal(p.vaultB);
      await program.methods
        .collectFees()
        .accounts(m.accounts as any)
        .remainingAccounts(m.remaining)
        .preInstructions([computeIx()])
        .rpc();
      const feesA = (await bal(p.vaultA)) - a0;
      const feesB = (await bal(p.vaultB)) - b0;
      console.log(`      комиссии: A=${Number(feesA) / ONE}, B=${Number(feesB) / ONE}`);
      assert.isTrue(feesA > 0n && feesB > 0n);
    });

    it("докладывает собранные комиссии в позицию (increase_liquidity)", async () => {
      const m = await managePositionAccounts(program, clmm, mintA);
      const a = new BN((await bal(p.vaultA)).toString());
      const b = new BN((await bal(p.vaultB)).toString());
      const amount0 = mint0.equals(mintA) ? a : b;
      const amount1 = mint0.equals(mintA) ? b : a;
      const liquidity = liquidityFromAmounts(
        m.pool.sqrtPriceX64,
        m.position.tickLowerIndex,
        m.position.tickUpperIndex,
        amount0,
        amount1,
      )
        .muln(95)
        .divn(100);
      assert.isTrue(liquidity.gtn(0));
      const before = new BN(m.position.liquidity.toString());
      await program.methods
        .increaseLiquidity(liquidity, amount0, amount1)
        .accounts(m.accounts as any)
        .remainingAccounts(m.remaining)
        .preInstructions([computeIx()])
        .rpc();
      const pos: any = await (clmm.account as any).personalPositionState.fetch(m.accounts.personalPosition);
      assert.equal(pos.liquidity.toString(), before.add(liquidity).toString());
      console.log(`      ликвидность ${before.toString()} → ${pos.liquidity.toString()}`);
      // токены ушли из хранилищ в пул
      assert.isTrue((await bal(p.vaultA)) < BigInt(a.toString()) || (await bal(p.vaultB)) < BigInt(b.toString()));
    });

    it("не-админ не может докладывать ликвидность", async () => {
      const m = await managePositionAccounts(program, clmm, mintA);
      await expectError(
        () =>
          program.methods
            .increaseLiquidity(new BN(1), new BN(1), new BN(1))
            .accounts({ ...(m.accounts as any), admin: alice.publicKey })
            .remainingAccounts(m.remaining)
            .signers([alice])
            .rpc(),
        "Unauthorized",
      );
    });

    it("закрывает позицию с минимумами (-1%) и получает оба токена", async () => {
      const m = await managePositionAccounts(program, clmm, mintA);
      const est = amountsFromLiquidity(m.pool.sqrtPriceX64, m.position.tickLowerIndex, m.position.tickUpperIndex, m.position.liquidity);
      const a0 = await bal(p.vaultA);
      const b0 = await bal(p.vaultB);
      await program.methods
        .closePosition(est.amount0.muln(99).divn(100), est.amount1.muln(99).divn(100))
        .accounts(m.accounts as any)
        .remainingAccounts(m.remaining)
        .preInstructions([computeIx()])
        .rpc();
      console.log(
        `      вернулось: A=${Number((await bal(p.vaultA)) - a0) / ONE}, B=${Number((await bal(p.vaultB)) - b0) / ONE}`,
      );
      const vault = await program.account.vault.fetch(p.vault);
      assert.ok(vault.positionNftMint.equals(PublicKey.default));
      // personal position закрыт Raydium
      assert.isNull(await connection.getAccountInfo(m.accounts.personalPosition));
    });

    it("ребалансировка: цена ушла → новая позиция вокруг новой цены → закрыть", async () => {
      // крупный обмен трейдера сдвигает цену
      await traderSwap(true, units(8000));
      const ps: any = await (clmm.account as any).poolState.fetch(pool);
      const spacing = ps.tickSpacing;
      const tl = Math.floor((ps.tickCurrent - 1000) / spacing) * spacing;
      const tu = Math.ceil((ps.tickCurrent + 1000) / spacing) * spacing;
      const a = new BN((await bal(p.vaultA)).toString());
      const b = new BN((await bal(p.vaultB)).toString());
      const amount0 = mint0.equals(mintA) ? a : b;
      const amount1 = mint0.equals(mintA) ? b : a;
      const liquidity = liquidityFromAmounts(ps.sqrtPriceX64, tl, tu, amount0, amount1).muln(95).divn(100);
      const nft = Keypair.generate();
      const o = await openPositionAccounts(program, clmm, mintA, tl, tu, nft);
      await program.methods
        .openPosition(tl, tu, o.lowerStart, o.upperStart, liquidity, amount0, amount1)
        .accounts(o.accounts as any)
        .remainingAccounts(o.remaining)
        .preInstructions([computeIx()])
        .signers([nft])
        .rpc();
      console.log(`      новая позиция: тики [${tl}, ${tu}] (текущий тик ${ps.tickCurrent})`);

      const m = await managePositionAccounts(program, clmm, mintA);
      await program.methods
        .closePosition(new BN(0), new BN(0))
        .accounts(m.accounts as any)
        .remainingAccounts(m.remaining)
        .preInstructions([computeIx()])
        .rpc();
    });

    it("админ меняет весь B обратно в A, после чего вывод снова доступен", async () => {
      const b = new BN((await bal(p.vaultB)).toString());
      const expected = await quoteVaultSwap(false, b);
      await vaultSwap(false, b, expected.muln(99).divn(100));
      assert.equal(await bal(p.vaultB), 0n);
    });

    it("все выводят свои доли; vault пуст", async () => {
      const aliceShare = getAssociatedTokenAddressSync(p.shareMint, alice.publicKey);
      const bobShare = getAssociatedTokenAddressSync(p.shareMint, bob.publicKey);
      const totalBefore = await bal(p.vaultA);
      const supply = await shareSupply();
      console.log(`      цена 1 share: ${(Number(totalBefore) / Number(supply)).toFixed(6)} токена A`);

      const sa = await bal(aliceShare);
      const sb = await bal(bobShare);
      assert.isTrue(sa > 0n);
      await withdrawAll(alice, "alice", true);
      await withdraw(bob, "bob", new BN(sb.toString()), true);
      assert.equal(await shareSupply(), 0n);
      assert.equal(await bal(p.vaultA), 0n);
      // карточки больше не нужны — закрываем и забираем ренту
      for (const u of [alice, bob]) {
        await closeCard(u);
        assert.isNull(await connection.getAccountInfo(userAccountPda(program.programId, p.vault, u.publicKey)));
      }
    });
  });
});
