/**
 * Кошелёк-ключ ТОЛЬКО для localnet-разработки (без Phantom).
 * Включается, если задан VITE_LOCAL_SECRET (JSON-массив секретного ключа) и VITE_CLUSTER=localnet.
 * Никогда не используйте с реальными ключами.
 */
import {
  BaseSignerWalletAdapter,
  WalletName,
  WalletReadyState,
} from "@solana/wallet-adapter-base";
import { Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

export class LocalKeypairWalletAdapter extends BaseSignerWalletAdapter {
  name = "Local keypair (dev)" as WalletName<"Local keypair (dev)">;
  url = "https://solana.com";
  icon =
    "data:image/svg+xml;base64," +
    btoa('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="6" fill="#14f195"/></svg>');
  readyState = WalletReadyState.Loadable;
  supportedTransactionVersions = new Set(["legacy", 0] as const);
  private kp: Keypair | null = null;
  constructor(private secret: number[]) {
    super();
  }
  get publicKey(): PublicKey | null {
    return this.kp?.publicKey ?? null;
  }
  get connecting() {
    return false;
  }
  async connect() {
    this.kp = Keypair.fromSecretKey(Uint8Array.from(this.secret));
    this.emit("connect", this.kp.publicKey);
  }
  async disconnect() {
    this.kp = null;
    this.emit("disconnect");
  }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (!this.kp) throw new Error("not connected");
    if (tx instanceof VersionedTransaction) tx.sign([this.kp]);
    else tx.partialSign(this.kp);
    return tx;
  }
}
