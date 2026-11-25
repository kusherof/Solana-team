import { PublicKey } from "@solana/web3.js";
import { CLMM_PROGRAM_ID } from "../../sdk/raydium";

/** devnet (по умолчанию) или localnet: VITE_CLUSTER=localnet npm run dev */
export const CLUSTER: "devnet" | "localnet" = (import.meta.env.VITE_CLUSTER as any) ?? "devnet";

export const RPC_URL: string =
  import.meta.env.VITE_RPC_URL ?? (CLUSTER === "localnet" ? "http://127.0.0.1:8899" : "https://api.devnet.solana.com");

// Адреса берём из deployments/<cluster>.json, который заполняют devnet-скрипты
const files = import.meta.glob("../../deployments/*.json", { eager: true, import: "default" }) as Record<string, any>;
const deployment: Record<string, any> = files[`../../deployments/${CLUSTER}.json`] ?? {};

export const MINT_A: PublicKey | null =
  import.meta.env.VITE_MINT_A || deployment.mintA ? new PublicKey(import.meta.env.VITE_MINT_A ?? deployment.mintA) : null;

export const CLMM_ID = CLUSTER === "localnet" ? CLMM_PROGRAM_ID.localnet : CLMM_PROGRAM_ID.devnet;

export const explorerTx = (sig: string) =>
  CLUSTER === "localnet"
    ? `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`
    : `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

export const explorerAddr = (a: PublicKey | string) =>
  CLUSTER === "localnet"
    ? `https://explorer.solana.com/address/${a.toString()}?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`
    : `https://explorer.solana.com/address/${a.toString()}?cluster=devnet`;
