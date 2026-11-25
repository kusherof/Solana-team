/**
 * Клиентские хелперы Liquidity Vault: адреса PDA и сборка аккаунтов для инструкций.
 */
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, AccountMeta, Connection, ComputeBudgetProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { pda as rpda, getSwapTickArrays, tickArrayStartIndex } from "./raydium";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export function vaultPdas(programId: PublicKey, mintA: PublicKey) {
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), mintA.toBuffer()], programId);
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("authority"), vault.toBuffer()],
    programId,
  );
  const [shareMint] = PublicKey.findProgramAddressSync([Buffer.from("share"), vault.toBuffer()], programId);
  const [vaultA] = PublicKey.findProgramAddressSync([Buffer.from("vault_a"), vault.toBuffer()], programId);
  const [vaultB] = PublicKey.findProgramAddressSync([Buffer.from("vault_b"), vault.toBuffer()], programId);
  return { vault, vaultAuthority, shareMint, vaultA, vaultB };
}

export function userAccountPda(programId: PublicKey, vault: PublicKey, user: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user"), vault.toBuffer(), user.toBuffer()],
    programId,
  )[0];
}

/** Повышенный лимит compute units: CPI в Raydium «тяжёлые» */
export const computeIx = () => ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 });

type AnyProgram = Program<any>;

export async function fetchPool(clmm: AnyProgram, pool: PublicKey) {
  return (clmm.account as any).poolState.fetch(pool);
}

/** Аккаунты для vault.swap */
export async function swapAccounts(
  program: AnyProgram,
  clmm: AnyProgram,
  mintA: PublicKey,
  aToB: boolean,
): Promise<{ accounts: any; remaining: AccountMeta[] }> {
  const p = vaultPdas(program.programId, mintA);
  const vault: any = await (program.account as any).vault.fetch(p.vault);
  const poolKey: PublicKey = vault.poolState;
  const pool = await fetchPool(clmm, poolKey);
  const inputMint: PublicKey = aToB ? vault.mintA : vault.mintB;
  const outputMint: PublicKey = aToB ? vault.mintB : vault.mintA;
  const zeroForOne = inputMint.equals(pool.tokenMint0);
  const inputVault = zeroForOne ? pool.tokenVault0 : pool.tokenVault1;
  const outputVault = zeroForOne ? pool.tokenVault1 : pool.tokenVault0;
  const tickArrays = await getSwapTickArrays(
    program.provider.connection,
    clmm.programId,
    poolKey,
    pool.tickCurrent,
    pool.tickSpacing,
    zeroForOne,
  );
  const remaining: AccountMeta[] = [
    { pubkey: rpda.bitmapExtension(clmm.programId, poolKey), isSigner: false, isWritable: false },
    ...tickArrays.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })),
  ];
  return {
    accounts: {
      admin: vault.admin,
      vault: p.vault,
      vaultAuthority: p.vaultAuthority,
      clmmProgram: clmm.programId,
      ammConfig: pool.ammConfig,
      poolState: poolKey,
      vaultA: p.vaultA,
      vaultB: p.vaultB,
      inputVault,
      outputVault,
      observationState: pool.observationKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      memoProgram: MEMO_PROGRAM_ID,
      inputVaultMint: inputMint,
      outputVaultMint: outputMint,
    },
    remaining,
  };
}

/** Аккаунты для vault.open_position */
export async function openPositionAccounts(
  program: AnyProgram,
  clmm: AnyProgram,
  mintA: PublicKey,
  tickLower: number,
  tickUpper: number,
  nftMint: Keypair,
) {
  const p = vaultPdas(program.programId, mintA);
  const vault: any = await (program.account as any).vault.fetch(p.vault);
  const poolKey: PublicKey = vault.poolState;
  const pool = await fetchPool(clmm, poolKey);
  const lowerStart = tickArrayStartIndex(tickLower, pool.tickSpacing);
  const upperStart = tickArrayStartIndex(tickUpper, pool.tickSpacing);
  return {
    lowerStart,
    upperStart,
    pool,
    accounts: {
      admin: vault.admin,
      vault: p.vault,
      vaultAuthority: p.vaultAuthority,
      clmmProgram: clmm.programId,
      positionNftMint: nftMint.publicKey,
      positionNftAccount: getAssociatedTokenAddressSync(
        nftMint.publicKey,
        p.vaultAuthority,
        true,
        TOKEN_2022_PROGRAM_ID,
      ),
      poolState: poolKey,
      protocolPosition: rpda.protocolPosition(clmm.programId, poolKey, tickLower, tickUpper),
      tickArrayLower: rpda.tickArray(clmm.programId, poolKey, lowerStart),
      tickArrayUpper: rpda.tickArray(clmm.programId, poolKey, upperStart),
      personalPosition: rpda.personalPosition(clmm.programId, nftMint.publicKey),
      vaultA: p.vaultA,
      vaultB: p.vaultB,
      tokenVault0: pool.tokenVault0,
      tokenVault1: pool.tokenVault1,
      vault0Mint: pool.tokenMint0,
      vault1Mint: pool.tokenMint1,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    },
    remaining: [
      { pubkey: rpda.bitmapExtension(clmm.programId, poolKey), isSigner: false, isWritable: true },
    ] as AccountMeta[],
  };
}

/** Аккаунты для vault.collect_fees / vault.close_position */
export async function managePositionAccounts(program: AnyProgram, clmm: AnyProgram, mintA: PublicKey) {
  const p = vaultPdas(program.programId, mintA);
  const vault: any = await (program.account as any).vault.fetch(p.vault);
  const poolKey: PublicKey = vault.poolState;
  const pool = await fetchPool(clmm, poolKey);
  const nftMint: PublicKey = vault.positionNftMint;
  const personal = rpda.personalPosition(clmm.programId, nftMint);
  const pos: any = await (clmm.account as any).personalPositionState.fetch(personal);
  const lowerStart = tickArrayStartIndex(pos.tickLowerIndex, pool.tickSpacing);
  const upperStart = tickArrayStartIndex(pos.tickUpperIndex, pool.tickSpacing);
  return {
    position: pos,
    pool,
    accounts: {
      admin: vault.admin,
      vault: p.vault,
      vaultAuthority: p.vaultAuthority,
      clmmProgram: clmm.programId,
      positionNftMint: nftMint,
      positionNftAccount: getAssociatedTokenAddressSync(nftMint, p.vaultAuthority, true, TOKEN_2022_PROGRAM_ID),
      personalPosition: personal,
      poolState: poolKey,
      protocolPosition: rpda.protocolPosition(clmm.programId, poolKey, pos.tickLowerIndex, pos.tickUpperIndex),
      tokenVault0: pool.tokenVault0,
      tokenVault1: pool.tokenVault1,
      tickArrayLower: rpda.tickArray(clmm.programId, poolKey, lowerStart),
      tickArrayUpper: rpda.tickArray(clmm.programId, poolKey, upperStart),
      vaultA: p.vaultA,
      vaultB: p.vaultB,
      vault0Mint: pool.tokenMint0,
      vault1Mint: pool.tokenMint1,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      memoProgram: MEMO_PROGRAM_ID,
    },
    remaining: [
      { pubkey: rpda.bitmapExtension(clmm.programId, poolKey), isSigner: false, isWritable: true },
    ] as AccountMeta[],
  };
}

export function explorerTx(sig: string, cluster = "devnet") {
  return `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
}
export function explorerAddr(addr: PublicKey | string, cluster = "devnet") {
  return `https://explorer.solana.com/address/${addr.toString()}?cluster=${cluster}`;
}
