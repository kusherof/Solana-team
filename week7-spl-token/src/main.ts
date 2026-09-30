/**
 * Неделя 7: Token-2022 + metadata на самом mint, mint, transfer.
 * Сеть: Devnet. Кошелёк: ~/.config/solana/id.json
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  LENGTH_SIZE,
  TYPE_SIZE,
  createAssociatedTokenAccountInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  getTokenMetadata,
} from "@solana/spl-token";
import {
  createInitializeInstruction,
  createUpdateFieldInstruction,
  pack,
  type TokenMetadata,
} from "@solana/spl-token-metadata";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

function loadPayer(): Keypair {
  const p = join(homedir(), ".config", "solana", "id.json");
  if (!existsSync(p)) {
    throw new Error("Нет ~/.config/solana/id.json — сделай solana-keygen new");
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
}

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const payer = loadPayer();
  const mint = Keypair.generate();
  const recipient = Keypair.generate();

  let bal = await connection.getBalance(payer.publicKey);
  if (bal < 0.2 * LAMPORTS_PER_SOL) {
    console.log("airdrop...");
    const sig = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }

  const metadata: TokenMetadata = {
    updateAuthority: payer.publicKey,
    mint: mint.publicKey,
    name: "Solana Team Token",
    symbol: "STT",
    uri: "https://example.com/stt.json",
    additionalMetadata: [["course", "week7"]],
  };

  const mintSpace = getMintLen([ExtensionType.MetadataPointer]);
  const metadataSpace = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const lamports = await connection.getMinimumBalanceForRentExemption(
    mintSpace + metadataSpace
  );

  const decimals = 0;

  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      lamports,
      space: mintSpace,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      payer.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      payer.publicKey,
      payer.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: payer.publicKey,
      mint: mint.publicKey,
      mintAuthority: payer.publicKey,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
    }),
    createUpdateFieldInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: payer.publicKey,
      field: "course",
      value: "week7",
    })
  );

  const mintSig = await sendAndConfirmTransaction(connection, createMintTx, [
    payer,
    mint,
  ]);
  console.log("mint created", mint.publicKey.toBase58());
  console.log("mint tx", mintSig);

  const ataPayer = getAssociatedTokenAddressSync(
    mint.publicKey,
    payer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const ataRecv = getAssociatedTokenAddressSync(
    mint.publicKey,
    recipient.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const fundRecv = await connection.getMinimumBalanceForRentExemption(0);
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: recipient.publicKey,
        lamports: fundRecv,
      }),
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ataPayer,
        payer.publicKey,
        mint.publicKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ataRecv,
        recipient.publicKey,
        mint.publicKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createMintToInstruction(
        mint.publicKey,
        ataPayer,
        payer.publicKey,
        10,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    ),
    [payer]
  );

  const transferSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createTransferCheckedInstruction(
        ataPayer,
        mint.publicKey,
        ataRecv,
        payer.publicKey,
        3,
        decimals,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    ),
    [payer]
  );

  const onchainMeta = await getTokenMetadata(
    connection,
    mint.publicKey,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );

  const out = {
    mint: mint.publicKey.toBase58(),
    recipient: recipient.publicKey.toBase58(),
    ataPayer: ataPayer.toBase58(),
    ataRecv: ataRecv.toBase58(),
    mintTx: mintSig,
    transferTx: transferSig,
    metadata: onchainMeta,
  };
  writeFileSync(join(import.meta.dirname, "..", "last-token.json"), JSON.stringify(out, null, 2));

  console.log("transfer tx", transferSig);
  console.log("metadata name", onchainMeta?.name);
  console.log("metadata symbol", onchainMeta?.symbol);
  console.log(
    "explorer mint",
    `https://explorer.solana.com/address/${mint.publicKey.toBase58()}?cluster=devnet`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
