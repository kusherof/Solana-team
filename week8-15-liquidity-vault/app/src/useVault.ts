import { useCallback, useEffect, useMemo, useState } from "react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync, getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import vaultIdl from "../../sdk/liquidity_vault_idl.json";
import clmmIdl from "../../sdk/raydium_clmm_idl.json";
import type { LiquidityVault } from "../../sdk/liquidity_vault_types";
import { vaultPdas, userAccountPda } from "../../sdk/vault";
import { pda as rpda, sqrtPriceX64ToPrice, tickToPrice } from "../../sdk/raydium";
import { CLMM_ID, MINT_A } from "./config";

export type VaultState = {
  exists: boolean;
  admin?: PublicKey;
  mintA?: PublicKey;
  mintB?: PublicKey;
  decimalsA: number;
  decimalsB: number;
  vaultA: bigint;
  vaultB: bigint;
  shareSupply: bigint;
  hasPool: boolean;
  pool?: PublicKey;
  poolPrice?: number; // сколько B за 1 A
  hasPosition: boolean;
  position?: { nft: PublicKey; tickLower: number; tickUpper: number; liquidity: string; priceLower: number; priceUpper: number; inRange: boolean };
  user?: {
    tokenA: bigint;
    shares: bigint;
    card: null | { deposited: bigint; withdrawn: bigint; sharesMinted: bigint; sharesBurned: bigint };
  };
};

const safeAmount = async (fn: () => Promise<any>) => {
  try {
    return BigInt((await fn()).amount.toString());
  } catch {
    return 0n;
  }
};

export function useVault() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const provider = useMemo(
    () =>
      new AnchorProvider(
        connection,
        wallet ?? ({ publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t } as any),
        { commitment: "confirmed" },
      ),
    [connection, wallet],
  );
  const program = useMemo(() => new Program<LiquidityVault>(vaultIdl as any, provider), [provider]);
  const clmm = useMemo(() => new Program({ ...(clmmIdl as any), address: CLMM_ID.toBase58() }, provider), [provider]);
  const pdas = useMemo(() => (MINT_A ? vaultPdas(program.programId, MINT_A) : null), [program]);

  const [state, setState] = useState<VaultState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!MINT_A || !pdas) return;
    try {
      const v: any = await program.account.vault.fetchNullable(pdas.vault);
      if (!v) {
        setState({ exists: false, decimalsA: 6, decimalsB: 6, vaultA: 0n, vaultB: 0n, shareSupply: 0n, hasPool: false, hasPosition: false });
        return;
      }
      const mintAInfo = await getMint(connection, v.mintA);
      const share = await getMint(connection, v.shareMint);
      const hasPool = !v.poolState.equals(PublicKey.default);
      const hasPosition = !v.positionNftMint.equals(PublicKey.default);
      const s: VaultState = {
        exists: true,
        admin: v.admin,
        mintA: v.mintA,
        mintB: hasPool ? v.mintB : undefined,
        decimalsA: mintAInfo.decimals,
        decimalsB: 6,
        vaultA: await safeAmount(() => getAccount(connection, pdas.vaultA)),
        vaultB: hasPool ? await safeAmount(() => getAccount(connection, pdas.vaultB)) : 0n,
        shareSupply: BigInt(share.supply.toString()),
        hasPool,
        pool: hasPool ? v.poolState : undefined,
        hasPosition,
      };
      if (hasPool) {
        const ps: any = await (clmm.account as any).poolState.fetch(v.poolState);
        s.decimalsB = ps.tokenMint0.equals(v.mintA) ? ps.mintDecimals1 : ps.mintDecimals0;
        const p01 = sqrtPriceX64ToPrice(ps.sqrtPriceX64, ps.mintDecimals0, ps.mintDecimals1);
        const aIs0 = ps.tokenMint0.equals(v.mintA);
        s.poolPrice = aIs0 ? p01 : 1 / p01;
        if (hasPosition) {
          const pos: any = await (clmm.account as any).personalPositionState.fetch(
            rpda.personalPosition(clmm.programId, v.positionNftMint),
          );
          s.position = {
            nft: v.positionNftMint,
            tickLower: pos.tickLowerIndex,
            tickUpper: pos.tickUpperIndex,
            liquidity: pos.liquidity.toString(),
            priceLower: tickToPrice(pos.tickLowerIndex, ps.mintDecimals0, ps.mintDecimals1),
            priceUpper: tickToPrice(pos.tickUpperIndex, ps.mintDecimals0, ps.mintDecimals1),
            inRange: ps.tickCurrent >= pos.tickLowerIndex && ps.tickCurrent < pos.tickUpperIndex,
          };
        }
      }
      if (wallet) {
        const card: any = await program.account.userAccount.fetchNullable(
          userAccountPda(program.programId, pdas.vault, wallet.publicKey),
        );
        s.user = {
          tokenA: await safeAmount(() => getAccount(connection, getAssociatedTokenAddressSync(v.mintA, wallet.publicKey))),
          shares: await safeAmount(() => getAccount(connection, getAssociatedTokenAddressSync(v.shareMint, wallet.publicKey))),
          card: card
            ? {
                deposited: BigInt(card.deposited.toString()),
                withdrawn: BigInt(card.withdrawn.toString()),
                sharesMinted: BigInt(card.sharesMinted.toString()),
                sharesBurned: BigInt(card.sharesBurned.toString()),
              }
            : null,
        };
      }
      setState(s);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }, [program, clmm, connection, wallet, pdas]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  return { program, clmm, provider, pdas, state, error, refresh, wallet, connection };
}

export { TOKEN_2022_PROGRAM_ID };
