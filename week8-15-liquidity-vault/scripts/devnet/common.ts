/**
 * Общие настройки для devnet-скриптов.
 * Кошелёк: ANCHOR_WALLET (по умолчанию ~/.config/solana/id.json)
 * RPC:     ANCHOR_PROVIDER_URL (по умолчанию https://api.devnet.solana.com)
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import clmmIdl from "../../sdk/raydium_clmm_idl.json";
import vaultIdl from "../../sdk/liquidity_vault_idl.json";
import { CLMM_PROGRAM_ID } from "../../sdk/raydium";
import type { LiquidityVault } from "../../sdk/liquidity_vault_types";

// CLUSTER=localnet — прогнать те же скрипты на локальном валидаторе (для проверки)
export const CLUSTER = process.env.CLUSTER ?? "devnet";
export const DEPLOY_FILE = path.join(__dirname, `../../deployments/${CLUSTER}.json`);

export function setup() {
  process.env.ANCHOR_PROVIDER_URL ??=
    CLUSTER === "localnet" ? "http://127.0.0.1:8899" : "https://api.devnet.solana.com";
  process.env.ANCHOR_WALLET ??= path.join(os.homedir(), ".config/solana/id.json");
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program<LiquidityVault>(vaultIdl as any, provider);
  // IDL Raydium собран для localnet-адреса — в devnet подменяем адрес на devnet-программу Raydium
  const clmmId = CLUSTER === "localnet" ? CLMM_PROGRAM_ID.localnet : CLMM_PROGRAM_ID.devnet;
  const clmm = new Program({ ...(clmmIdl as any), address: clmmId.toBase58() }, provider);
  const wallet = (provider.wallet as anchor.Wallet).payer;
  return { provider, program, clmm, wallet, connection: provider.connection };
}

/** Хеш первого блока (genesis) — по нему можно точно узнать сеть, даже если в RPC-адресе ошибка. */
export const GENESIS = {
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  mainnet: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
};

/**
 * Останавливает скрипт до любой транзакции, если CLUSTER=devnet, а RPC указывает не на devnet
 * (например, по ошибке на mainnet в ANCHOR_PROVIDER_URL).
 */
export async function assertCluster(connection: Connection) {
  if (CLUSTER !== "devnet") return;
  const hash = await connection.getGenesisHash();
  if (hash !== GENESIS.devnet) {
    const which = hash === GENESIS.mainnet ? "MAINNET" : `неизвестной сети (genesis ${hash})`;
    throw new Error(`RPC ${connection.rpcEndpoint} принадлежит ${which}, а не devnet. Проверьте ANCHOR_PROVIDER_URL.`);
  }
}

export type Deployment = {
  programId?: string;
  clmmProgramId?: string;
  mintA?: string;
  mintB?: string;
  ammConfig?: string;
  pool?: string;
  ownPositionNft?: string;
  vault?: string;
  shareMint?: string;
  vaultA?: string;
  vaultB?: string;
  vaultAuthority?: string;
  txs?: Record<string, string>;
};

export function loadDeployment(): Deployment {
  if (!fs.existsSync(DEPLOY_FILE)) return {};
  return JSON.parse(fs.readFileSync(DEPLOY_FILE, "utf8"));
}

export function saveDeployment(d: Deployment) {
  fs.mkdirSync(path.dirname(DEPLOY_FILE), { recursive: true });
  fs.writeFileSync(DEPLOY_FILE, JSON.stringify(d, null, 2) + "\n");
}

export function recordTx(d: Deployment, name: string, sig: string) {
  d.txs ??= {};
  d.txs[name] = sig;
  saveDeployment(d);
  console.log(`  ${name}: ${explorerTx(sig)}`);
}

export const pk = (s?: string) => {
  if (!s) throw new Error("Адрес не найден в deployments/devnet.json — сначала запустите предыдущий шаг");
  return new PublicKey(s);
};

export function explorerTx(sig: string) {
  return CLUSTER === "localnet"
    ? `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`
    : `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}
