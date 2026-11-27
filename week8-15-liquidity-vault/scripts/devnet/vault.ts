/**
 * CLI для работы с Liquidity Vault в devnet. Каждая команда печатает ссылку на транзакцию в Explorer
 * и сохраняет её в deployments/devnet.json (оттуда ссылки удобно переносить в README).
 *
 *   npx ts-node scripts/devnet/vault.ts init            # неделя 8: создать vault + свою карточку
 *   npx ts-node scripts/devnet/vault.ts deposit 1000    # неделя 9
 *   npx ts-node scripts/devnet/vault.ts withdraw 100    # неделя 10 (кол-во share-токенов)
 *   npx ts-node scripts/devnet/vault.ts configure       # неделя 12: привязать пул, создать хранилище B
 *   npx ts-node scripts/devnet/vault.ts swap a2b 500    # неделя 12: обмен с минимумом -1%
 *   npx ts-node scripts/devnet/vault.ts swap-fail a2b 100  # неделя 12: обмен, отклонённый из-за slippage
 *   npx ts-node scripts/devnet/vault.ts open 10         # неделя 13: позиция ±10% вокруг текущей цены
 *   npx ts-node scripts/devnet/vault.ts trade 4 200     # 4 пары обменов с кошелька напрямую в Raydium → комиссии
 *   npx ts-node scripts/devnet/vault.ts collect         # неделя 13: собрать комиссии
 *   npx ts-node scripts/devnet/vault.ts close           # неделя 13: закрыть позицию (минимумы -1%)
 *   npx ts-node scripts/devnet/vault.ts status          # состояние vault, пула, позиции
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getMint,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { setup, loadDeployment, saveDeployment, recordTx, pk, explorerTx } from "./common";
import {
  vaultPdas,
  userAccountPda,
  computeIx,
  swapAccounts,
  openPositionAccounts,
  managePositionAccounts,
  MEMO_PROGRAM_ID,
} from "../../sdk/vault";
import {
  pda,
  sqrtPriceX64ToPrice,
  priceToTick,
  tickToPrice,
  liquidityFromAmounts,
  amountsFromLiquidity,
  getSwapTickArrays,
} from "../../sdk/raydium";

const { program, clmm, wallet, connection } = setup();
const d = loadDeployment();
const [cmd, ...args] = process.argv.slice(2);

async function decimalsA() {
  return (await getMint(connection, pk(d.mintA))).decimals;
}
const toUnits = async (x: string) => new BN(Math.round(Number(x) * 10 ** (await decimalsA())));
const bal = async (a: PublicKey, prog = TOKEN_PROGRAM_ID) =>
  BigInt((await getAccount(connection, a, "confirmed", prog)).amount.toString());

async function quote(aToB: boolean, amountIn: BN): Promise<BN> {
  const { accounts, remaining } = await swapAccounts(program, clmm, pk(d.mintA), aToB);
  const sim = await program.methods
    .swap(amountIn, new BN(0), new BN(0), aToB)
    .accounts(accounts)
    .remainingAccounts(remaining)
    .preInstructions([computeIx()])
    .simulate();
  const ev: any = sim.events.find((e) => e.name === "swapEvent");
  return ev.data.amountOut;
}

async function main() {
  const mintA = pk(d.mintA);
  const p = vaultPdas(program.programId, mintA);

  switch (cmd) {
    case "init": {
      const sol = Number(args[0] ?? 0.5);
      const sig = await program.methods
        .initializeVault(new BN(sol * LAMPORTS_PER_SOL))
        .accounts({ admin: wallet.publicKey, mintA })
        .rpc();
      Object.assign(d, {
        programId: program.programId.toBase58(),
        vault: p.vault.toBase58(),
        shareMint: p.shareMint.toBase58(),
        vaultA: p.vaultA.toBase58(),
        vaultAuthority: p.vaultAuthority.toBase58(),
      });
      recordTx(d, "initializeVault", sig);
      const sig2 = await program.methods.openUserAccount().accounts({ user: wallet.publicKey, vault: p.vault }).rpc();
      recordTx(d, "openUserAccount", sig2);
      break;
    }
    case "deposit": {
      const amount = await toUnits(args[0] ?? "1000");
      const v: any = await program.account.vault.fetch(p.vault);
      const sig = await program.methods
        .deposit(amount)
        .accounts({
          user: wallet.publicKey,
          vault: p.vault,
          mintA,
          shareMint: p.shareMint,
          vaultA: p.vaultA,
          vaultB: v.poolState.equals(PublicKey.default) ? null : p.vaultB,
          userTokenA: getAssociatedTokenAddressSync(mintA, wallet.publicKey),
        } as any)
        .rpc();
      recordTx(d, "deposit", sig);
      break;
    }
    case "withdraw": {
      const shares = await toUnits(args[0] ?? "100");
      const v: any = await program.account.vault.fetch(p.vault);
      const sig = await program.methods
        .withdraw(shares)
        .accounts({
          user: wallet.publicKey,
          vault: p.vault,
          mintA,
          shareMint: p.shareMint,
          vaultA: p.vaultA,
          vaultB: v.poolState.equals(PublicKey.default) ? null : p.vaultB,
          userTokenA: getAssociatedTokenAddressSync(mintA, wallet.publicKey),
          userShare: getAssociatedTokenAddressSync(p.shareMint, wallet.publicKey),
        } as any)
        .rpc();
      recordTx(d, "withdraw", sig);
      break;
    }
    case "configure": {
      const sig = await program.methods
        .configurePool()
        .accounts({ admin: wallet.publicKey, vault: p.vault, poolState: pk(d.pool), mintB: pk(d.mintB) } as any)
        .rpc();
      d.vaultB = p.vaultB.toBase58();
      recordTx(d, "configurePool", sig);
      break;
    }
    case "swap":
    case "swap-fail": {
      const aToB = (args[0] ?? "a2b") === "a2b";
      const amountIn =
        args[1] === "all"
          ? new BN((await bal(aToB ? p.vaultA : p.vaultB)).toString())
          : await toUnits(args[1] ?? "100");
      const expected = await quote(aToB, amountIn);
      // обычный обмен: минимум = ожидаемое - 1%; демонстрация отказа: требуем +50%
      const minOut = cmd === "swap" ? expected.muln(99).divn(100) : expected.muln(150).divn(100);
      console.log(`  ожидаемый выход: ${expected.toString()}, минимум: ${minOut.toString()}`);
      const before: any = await (clmm.account as any).poolState.fetch(pk(d.pool));
      const { accounts, remaining } = await swapAccounts(program, clmm, mintA, aToB);
      const builder = program.methods
        .swap(amountIn, minOut, new BN(0), aToB)
        .accounts(accounts)
        .remainingAccounts(remaining)
        .preInstructions([computeIx()]);
      if (cmd === "swap-fail") {
        // skipPreflight: отклонённая транзакция всё равно попадёт в сеть — будет ссылка для README
        const tx = await builder.transaction();
        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        tx.sign(wallet);
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        const res = await connection.confirmTransaction(sig, "confirmed");
        console.log("  результат:", JSON.stringify(res.value.err), "(6018 = TooLittleOutputReceived у Raydium)");
        recordTx(d, "swapRejectedBySlippage", sig);
      } else {
        const sig = await builder.rpc();
        recordTx(d, aToB ? "swapAtoB" : "swapBtoA", sig);
      }
      const after: any = await (clmm.account as any).poolState.fetch(pk(d.pool));
      console.log(`  sqrtPriceX64: ${before.sqrtPriceX64.toString()} → ${after.sqrtPriceX64.toString()}`);
      console.log(`  тик: ${before.tickCurrent} → ${after.tickCurrent}`);
      break;
    }
    case "open": {
      const pct = Number(args[0] ?? 10);
      const ps: any = await (clmm.account as any).poolState.fetch(pk(d.pool));
      const dec0 = ps.mintDecimals0;
      const dec1 = ps.mintDecimals1;
      const price = sqrtPriceX64ToPrice(ps.sqrtPriceX64, dec0, dec1);
      const sp = ps.tickSpacing;
      const tl = Math.floor(priceToTick(price * (1 - pct / 100), dec0, dec1) / sp) * sp;
      const tu = Math.ceil(priceToTick(price * (1 + pct / 100), dec0, dec1) / sp) * sp;
      const a = new BN((await bal(p.vaultA)).toString());
      const b = new BN((await bal(p.vaultB)).toString());
      const aIs0 = ps.tokenMint0.equals(mintA);
      const amount0 = aIs0 ? a : b;
      const amount1 = aIs0 ? b : a;
      const liquidity = liquidityFromAmounts(ps.sqrtPriceX64, tl, tu, amount0, amount1).muln(98).divn(100);
      const nft = Keypair.generate();
      const o = await openPositionAccounts(program, clmm, mintA, tl, tu, nft);
      const sig = await program.methods
        .openPosition(tl, tu, o.lowerStart, o.upperStart, liquidity, amount0, amount1)
        .accounts(o.accounts as any)
        .remainingAccounts(o.remaining)
        .preInstructions([computeIx()])
        .signers([nft])
        .rpc();
      recordTx(d, "openPosition", sig);
      console.log(`  текущая цена: ${price}`);
      console.log(`  диапазон: тики [${tl}, ${tu}] = ${tickToPrice(tl, dec0, dec1)} … ${tickToPrice(tu, dec0, dec1)}`);
      console.log(`  NFT позиции: ${nft.publicKey.toBase58()}`);
      break;
    }
    case "trade": {
      // «другой участник рынка» делает обмены напрямую в Raydium → позиция vault зарабатывает комиссии
      const rounds = Number(args[0] ?? 4);
      const amount = await toUnits(args[1] ?? "200");
      const pool = pk(d.pool);
      for (let i = 0; i < rounds * 2; i++) {
        const ps: any = await (clmm.account as any).poolState.fetch(pool);
        const inMint = i % 2 === 0 ? mintA : pk(d.mintB);
        const outMint = i % 2 === 0 ? pk(d.mintB) : mintA;
        const zeroForOne = inMint.equals(ps.tokenMint0);
        const tas = await getSwapTickArrays(connection, clmm.programId, pool, ps.tickCurrent, ps.tickSpacing, zeroForOne);
        const sig = await clmm.methods
          .swapV2(amount, new BN(0), new BN(0), true)
          .accounts({
            payer: wallet.publicKey,
            ammConfig: ps.ammConfig,
            poolState: pool,
            inputTokenAccount: getAssociatedTokenAddressSync(inMint, wallet.publicKey),
            outputTokenAccount: getAssociatedTokenAddressSync(outMint, wallet.publicKey),
            inputVault: zeroForOne ? ps.tokenVault0 : ps.tokenVault1,
            outputVault: zeroForOne ? ps.tokenVault1 : ps.tokenVault0,
            observationState: ps.observationKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            tokenProgram2022: TOKEN_2022_PROGRAM_ID,
            memoProgram: MEMO_PROGRAM_ID,
            inputVaultMint: inMint,
            outputVaultMint: outMint,
          } as any)
          .remainingAccounts([
            { pubkey: pda.bitmapExtension(clmm.programId, pool), isSigner: false, isWritable: false },
            ...tas.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })),
          ])
          .preInstructions([computeIx()])
          .rpc();
        console.log(`  обмен ${i + 1}: ${explorerTx(sig)}`);
      }
      break;
    }
    case "collect": {
      const m = await managePositionAccounts(program, clmm, mintA);
      const a0 = await bal(p.vaultA);
      const b0 = await bal(p.vaultB);
      const sig = await program.methods
        .collectFees()
        .accounts(m.accounts as any)
        .remainingAccounts(m.remaining)
        .preInstructions([computeIx()])
        .rpc();
      recordTx(d, "collectFees", sig);
      console.log(`  комиссии: A=${(await bal(p.vaultA)) - a0}, B=${(await bal(p.vaultB)) - b0} (в минимальных единицах)`);
      break;
    }
    case "close": {
      const m = await managePositionAccounts(program, clmm, mintA);
      const est = amountsFromLiquidity(
        m.pool.sqrtPriceX64,
        m.position.tickLowerIndex,
        m.position.tickUpperIndex,
        m.position.liquidity,
      );
      const a0 = await bal(p.vaultA);
      const b0 = await bal(p.vaultB);
      const sig = await program.methods
        .closePosition(est.amount0.muln(99).divn(100), est.amount1.muln(99).divn(100))
        .accounts(m.accounts as any)
        .remainingAccounts(m.remaining)
        .preInstructions([computeIx()])
        .rpc();
      recordTx(d, "closePosition", sig);
      console.log(`  вернулось: A=${(await bal(p.vaultA)) - a0}, B=${(await bal(p.vaultB)) - b0}`);
      break;
    }
    case "status":
    default: {
      const v: any = await program.account.vault.fetch(p.vault);
      const share = await getMint(connection, p.shareMint);
      const a = await bal(p.vaultA);
      console.log("Vault:", p.vault.toBase58());
      console.log("  admin:", v.admin.toBase58());
      console.log("  токен A в хранилище:", a.toString());
      if (!v.poolState.equals(PublicKey.default)) console.log("  токен B в хранилище:", (await bal(p.vaultB)).toString());
      console.log("  share supply:", share.supply.toString());
      if (share.supply > 0n) console.log("  цена 1 share:", Number(a) / Number(share.supply), "A");
      console.log("  позиция:", v.positionNftMint.equals(PublicKey.default) ? "нет" : v.positionNftMint.toBase58());
      if (d.pool) {
        const ps: any = await (clmm.account as any).poolState.fetch(pk(d.pool));
        console.log("Пул:", d.pool);
        console.log("  цена (token1/token0):", sqrtPriceX64ToPrice(ps.sqrtPriceX64, ps.mintDecimals0, ps.mintDecimals1));
        console.log("  текущий тик:", ps.tickCurrent, " ликвидность:", ps.liquidity.toString());
      }
      const ua: any = await program.account.userAccount.fetchNullable(
        userAccountPda(program.programId, p.vault, wallet.publicKey),
      );
      if (ua) console.log("Моя карточка: внесено", ua.deposited.toString(), "выведено", ua.withdrawn.toString());
    }
  }
  saveDeployment(d);
}

main().catch((e) => {
  console.error(e.logs ?? e);
  process.exit(1);
});
