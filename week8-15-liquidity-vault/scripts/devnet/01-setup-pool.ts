/**
 * Неделя 11. Свои тестовые токены и свой CLMM-пул Raydium в devnet.
 *   1) создаём два токена (A и B) и выпускаем себе по 1 000 000
 *   2) берём существующий AmmConfig Raydium в devnet (уровень комиссии + tick spacing)
 *   3) создаём пул с начальной ценой PRICE (B за 1 A)
 *   4) открываем со своего кошелька позицию ±RANGE_PCT% вокруг цены — в пуле появляется ликвидность
 *
 * Запуск: npx ts-node scripts/devnet/01-setup-pool.ts
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { setup, loadDeployment, saveDeployment, recordTx, pk, CLUSTER, explorerTx } from "./common";
import {
  pda,
  sortMints,
  priceToSqrtPriceX64,
  priceToTick,
  tickToPrice,
  tickArrayStartIndex,
  liquidityFromAmounts,
} from "../../sdk/raydium";
import { computeIx } from "../../sdk/vault";

const DEC = 6;
const PRICE = Number(process.env.PRICE ?? 1); // сколько B за 1 A
const RANGE_PCT = Number(process.env.RANGE_PCT ?? 10); // ширина диапазона своей позиции
const SEED_AMOUNT = Number(process.env.SEED_AMOUNT ?? 10_000); // сколько каждого токена кладём в пул

async function main() {
  const { clmm, wallet, connection } = setup();
  const d = loadDeployment();
  d.clmmProgramId = clmm.programId.toBase58();
  console.log("Кошелёк:", wallet.publicKey.toBase58());

  // 1. Токены
  if (!d.mintA) {
    const a = await createMint(connection, wallet, wallet.publicKey, null, DEC);
    const b = await createMint(connection, wallet, wallet.publicKey, null, DEC);
    d.mintA = a.toBase58();
    d.mintB = b.toBase58();
    saveDeployment(d);
    for (const m of [a, b]) {
      const acc = await getOrCreateAssociatedTokenAccount(connection, wallet, m, wallet.publicKey);
      await mintTo(connection, wallet, m, acc.address, wallet, 1_000_000 * 10 ** DEC);
    }
    console.log("Токен A:", d.mintA, "\nТокен B:", d.mintB);
  }
  const mintA = pk(d.mintA);
  const mintB = pk(d.mintB);
  const [mint0, mint1] = sortMints(mintA, mintB);
  // цена в пуле = token1 за token0
  const poolPrice = mint0.equals(mintA) ? PRICE : 1 / PRICE;

  // 2. AmmConfig: ищем существующие конфиги Raydium в devnet
  if (!d.ammConfig) {
    for (let i = 0; i < 16; i++) {
      const key = pda.ammConfig(clmm.programId, i);
      const cfg: any = await (clmm.account as any).ammConfig.fetchNullable(key);
      if (cfg) {
        console.log(`  AmmConfig #${i}: tickSpacing=${cfg.tickSpacing}, fee=${cfg.tradeFeeRate / 10000}%`);
        if (!d.ammConfig && cfg.tickSpacing <= 60) d.ammConfig = key.toBase58();
      }
    }
    if (!d.ammConfig && CLUSTER === "localnet") {
      // в локальном валидаторе конфигов нет — создаём тестовым ключом «админа Raydium»
      const fs = await import("fs");
      const admin = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync("tests/fixtures/clmm-admin-keypair.json", "utf8"))),
      );
      const key = pda.ammConfig(clmm.programId, 0);
      await connection.confirmTransaction(await connection.requestAirdrop(admin.publicKey, 1e9), "confirmed");
      await clmm.methods
        .createAmmConfig(0, 10, 2500, 120000, 40000)
        .accounts({ owner: admin.publicKey, ammConfig: key, systemProgram: SystemProgram.programId } as any)
        .signers([admin])
        .rpc();
      d.ammConfig = key.toBase58();
    }
    if (!d.ammConfig) throw new Error("Не нашли AmmConfig в devnet");
    saveDeployment(d);
  }
  const ammConfig = pk(d.ammConfig);

  // 3. Пул
  const pool = pda.pool(clmm.programId, ammConfig, mint0, mint1);
  if (!d.pool) {
    const sig = await clmm.methods
      .createPool(priceToSqrtPriceX64(poolPrice, DEC, DEC), new BN(Math.floor(Date.now() / 1000) - 60))
      .accounts({
        poolCreator: wallet.publicKey,
        ammConfig,
        poolState: pool,
        tokenMint0: mint0,
        tokenMint1: mint1,
        tokenVault0: pda.poolVault(clmm.programId, pool, mint0),
        tokenVault1: pda.poolVault(clmm.programId, pool, mint1),
        observationState: pda.observation(clmm.programId, pool),
        tickArrayBitmap: pda.bitmapExtension(clmm.programId, pool),
        tokenProgram0: TOKEN_PROGRAM_ID,
        tokenProgram1: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();
    d.pool = pool.toBase58();
    recordTx(d, "createPool", sig);
  }

  // 4. Своя позиция ±RANGE_PCT%
  if (!d.ownPositionNft) {
    const ps: any = await (clmm.account as any).poolState.fetch(pool);
    const sp = ps.tickSpacing;
    const tl = Math.floor(priceToTick(poolPrice * (1 - RANGE_PCT / 100), DEC, DEC) / sp) * sp;
    const tu = Math.ceil(priceToTick(poolPrice * (1 + RANGE_PCT / 100), DEC, DEC) / sp) * sp;
    const ls = tickArrayStartIndex(tl, sp);
    const us = tickArrayStartIndex(tu, sp);
    const amt = new BN(SEED_AMOUNT).mul(new BN(10 ** DEC));
    const liq = liquidityFromAmounts(ps.sqrtPriceX64, tl, tu, amt, amt).muln(99).divn(100);
    const nft = Keypair.generate();
    const sig = await clmm.methods
      .openPositionWithToken22Nft(tl, tu, ls, us, liq, amt, amt, false, null)
      .accounts({
        payer: wallet.publicKey,
        positionNftOwner: wallet.publicKey,
        positionNftMint: nft.publicKey,
        positionNftAccount: getAssociatedTokenAddressSync(nft.publicKey, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID),
        poolState: pool,
        protocolPosition: pda.protocolPosition(clmm.programId, pool, tl, tu),
        tickArrayLower: pda.tickArray(clmm.programId, pool, ls),
        tickArrayUpper: pda.tickArray(clmm.programId, pool, us),
        personalPosition: pda.personalPosition(clmm.programId, nft.publicKey),
        tokenAccount0: getAssociatedTokenAddressSync(mint0, wallet.publicKey),
        tokenAccount1: getAssociatedTokenAddressSync(mint1, wallet.publicKey),
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
      .remainingAccounts([{ pubkey: pda.bitmapExtension(clmm.programId, pool), isSigner: false, isWritable: true }])
      .preInstructions([computeIx()])
      .signers([nft])
      .rpc();
    d.ownPositionNft = nft.publicKey.toBase58();
    recordTx(d, "openOwnPosition", sig);
    console.log(
      `  Диапазон: тики [${tl}, ${tu}] = цена ${tickToPrice(tl, DEC, DEC).toFixed(4)} … ${tickToPrice(tu, DEC, DEC).toFixed(4)} (token1/token0)`,
    );
  }

  console.log(`\nГотово. Адреса сохранены в deployments/${CLUSTER}.json`);
  console.log(`Пул: https://explorer.solana.com/address/${d.pool}?cluster=${CLUSTER}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
