import { useMemo, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { CLUSTER, RPC_URL, MINT_A, explorerTx, explorerAddr } from "./config";
import { LocalKeypairWalletAdapter } from "./localWallet";
import { useVault, VaultState } from "./useVault";
import {
  computeIx,
  swapAccounts,
  openPositionAccounts,
  managePositionAccounts,
} from "../../sdk/vault";
import { priceToTick, liquidityFromAmounts, amountsFromLiquidity, sqrtPriceX64ToPrice } from "../../sdk/raydium";

// ---------- форматирование ----------
const fmt = (x: bigint | undefined, dec: number, digits = 4) =>
  x === undefined ? "—" : (Number(x) / 10 ** dec).toLocaleString("ru-RU", { maximumFractionDigits: digits });
const toUnits = (s: string, dec: number) => new BN(Math.round(Number(s.replace(",", ".")) * 10 ** dec).toString());
const short = (k?: PublicKey | string) => (k ? `${k.toString().slice(0, 4)}…${k.toString().slice(-4)}` : "—");

type TxItem = { label: string; status: "pending" | "ok" | "error"; sig?: string; error?: string };

export default function App() {
  const wallets = useMemo(() => {
    const secret = import.meta.env.VITE_LOCAL_SECRET;
    return CLUSTER === "localnet" && secret ? [new LocalKeypairWalletAdapter(JSON.parse(secret))] : [];
  }, []);
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      {/* Phantom и Solflare подключаются автоматически через Wallet Standard */}
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Main />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

function Main() {
  const v = useVault();
  const [tab, setTab] = useState<"user" | "admin">("user");
  const [txs, setTxs] = useState<TxItem[]>([]);

  /** Отправить транзакцию и показать её статус со ссылкой на Explorer */
  const run = async (label: string, fn: () => Promise<string>) => {
    const id = Date.now();
    setTxs((t) => [{ label, status: "pending" } as TxItem, ...t].slice(0, 8));
    try {
      const sig = await fn();
      setTxs((t) => t.map((x, i) => (i === 0 && x.status === "pending" ? { ...x, status: "ok", sig } : x)));
    } catch (e: any) {
      const logs: string[] = e?.logs ?? e?.transactionLogs ?? [];
      const msg = e?.error?.errorMessage ?? logs.find((l) => l.includes("Error Message")) ?? e?.message ?? String(e);
      setTxs((t) => t.map((x, i) => (i === 0 && x.status === "pending" ? { ...x, status: "error", error: msg } : x)));
      console.error(id, e);
    }
    await v.refresh();
  };

  const s = v.state;
  const isAdmin = !!(s?.admin && v.wallet && s.admin.equals(v.wallet.publicKey));

  return (
    <div className="page">
      <header>
        <div>
          <h1>Liquidity Vault</h1>
          <p className="muted">
            Учебный vault на Solana · Raydium CLMM · <span className="badge">{CLUSTER}</span>
          </p>
        </div>
        <WalletMultiButton />
      </header>

      {!MINT_A && (
        <div className="card warn">
          Адрес vault не настроен. Запустите devnet-скрипты (см. README) — они заполнят <code>deployments/devnet.json</code>,
          либо задайте <code>VITE_MINT_A</code>.
        </div>
      )}
      {v.error && <div className="card warn">Ошибка загрузки: {v.error}</div>}
      {s && !s.exists && <div className="card warn">Vault для этого токена ещё не создан.</div>}

      {s?.exists && <Stats s={s} pdas={v.pdas} />}

      {s?.exists && (
        <>
          <nav className="tabs">
            <button className={tab === "user" ? "active" : ""} onClick={() => setTab("user")}>
              Пользователь
            </button>
            <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>
              Администратор
            </button>
          </nav>
          {tab === "user" ? <UserPanel v={v} run={run} /> : <AdminPanel v={v} run={run} isAdmin={isAdmin} />}
        </>
      )}

      {txs.length > 0 && (
        <section className="card">
          <h2>Транзакции</h2>
          <ul className="txs">
            {txs.map((t, i) => (
              <li key={i} className={t.status}>
                <span className="dot" />
                <b>{t.label}</b>
                {t.status === "pending" && <span className="muted"> — отправляется…</span>}
                {t.sig && (
                  <a href={explorerTx(t.sig)} target="_blank" rel="noreferrer">
                    открыть в Explorer ↗
                  </a>
                )}
                {t.error && <span className="err"> — {t.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="muted">
        Только devnet/localnet. Средства vault хранятся на PDA — ни у кого нет приватного ключа от хранилища.
      </footer>
    </div>
  );
}

function Stats({ s, pdas }: { s: VaultState; pdas: any }) {
  const idle = !s.hasPosition && s.vaultB === 0n;
  const sharePrice = s.shareSupply > 0n ? Number(s.vaultA) / Number(s.shareSupply) : 1;
  const status = s.hasPosition
    ? "Средства в позиции Raydium"
    : s.vaultB > 0n
      ? "Часть средств в токене B"
      : "Ожидание: депозит и вывод открыты";
  return (
    <section className="grid">
      <div className="card stat">
        <span className="muted">{idle ? "Всего в vault" : "Свободно в хранилищах"}</span>
        <b>{fmt(s.vaultA, s.decimalsA)} A</b>
        {s.hasPool && <span className="muted">+ {fmt(s.vaultB, s.decimalsB)} B</span>}
      </div>
      <div className="card stat">
        <span className="muted">Выпущено share</span>
        <b>{fmt(s.shareSupply, s.decimalsA)}</b>
        <span className="muted">
          {idle ? `цена 1 share ≈ ${sharePrice.toFixed(4)} A` : "цена share — после закрытия позиции"}
        </span>
      </div>
      <div className="card stat">
        <span className="muted">Цена пула</span>
        <b>{s.poolPrice ? `${s.poolPrice.toFixed(4)} B за 1 A` : "пул не привязан"}</b>
        {s.position && (
          <span className={s.position.inRange ? "ok-text" : "err"}>
            {s.position.inRange ? "цена внутри диапазона" : "цена вне диапазона — нужна ребалансировка"}
          </span>
        )}
      </div>
      <div className="card stat">
        <span className="muted">Статус</span>
        <b>{status}</b>
        <a href={explorerAddr(pdas.vault)} target="_blank" rel="noreferrer">
          vault {short(pdas.vault)} ↗
        </a>
      </div>
    </section>
  );
}

function UserPanel({ v, run }: { v: ReturnType<typeof useVault>; run: (l: string, f: () => Promise<string>) => void }) {
  const [dep, setDep] = useState("100");
  const [wd, setWd] = useState("");
  const s = v.state!;
  if (!v.wallet) return <div className="card">Подключите кошелёк (Phantom или Solflare в режиме devnet).</div>;
  const u = s.user;
  const idle = !s.hasPosition && s.vaultB === 0n;

  const openCard = () =>
    run("Открыть карточку", () =>
      v.program.methods.openUserAccount().accounts({ user: v.wallet!.publicKey, vault: v.pdas!.vault }).rpc(),
    );

  const deposit = () =>
    run(`Внести ${dep} A`, () =>
      v.program.methods
        .deposit(toUnits(dep, s.decimalsA))
        .accounts({
          user: v.wallet!.publicKey,
          vault: v.pdas!.vault,
          mintA: s.mintA,
          shareMint: v.pdas!.shareMint,
          vaultA: v.pdas!.vaultA,
          vaultB: s.hasPool ? v.pdas!.vaultB : null,
          userTokenA: getAssociatedTokenAddressSync(s.mintA!, v.wallet!.publicKey),
        } as any)
        .rpc(),
    );

  const withdraw = () =>
    run(`Вывести ${wd} share`, () =>
      v.program.methods
        .withdraw(toUnits(wd, s.decimalsA))
        .accounts({
          user: v.wallet!.publicKey,
          vault: v.pdas!.vault,
          mintA: s.mintA,
          shareMint: v.pdas!.shareMint,
          vaultA: v.pdas!.vaultA,
          vaultB: s.hasPool ? v.pdas!.vaultB : null,
          userTokenA: getAssociatedTokenAddressSync(s.mintA!, v.wallet!.publicKey),
          userShare: getAssociatedTokenAddressSync(v.pdas!.shareMint, v.wallet!.publicKey),
        } as any)
        .rpc(),
    );

  const expectedOut =
    wd && s.shareSupply > 0n ? (Number(toUnits(wd, s.decimalsA).toString()) * Number(s.vaultA)) / Number(s.shareSupply) : 0;
  const expectedShares =
    dep && s.shareSupply > 0n && s.vaultA > 0n
      ? (Number(toUnits(dep, s.decimalsA).toString()) * Number(s.shareSupply)) / Number(s.vaultA)
      : Number(toUnits(dep || "0", s.decimalsA).toString());

  return (
    <section className="grid two">
      <div className="card">
        <h2>Мой баланс</h2>
        <dl>
          <dt>Токен A в кошельке</dt>
          <dd>{fmt(u?.tokenA, s.decimalsA)}</dd>
          <dt>Мои share-токены</dt>
          <dd>{fmt(u?.shares, s.decimalsA)}</dd>
          <dt>Моя доля в vault</dt>
          <dd>{u && s.shareSupply > 0n ? ((Number(u.shares) / Number(s.shareSupply)) * 100).toFixed(2) + "%" : "—"}</dd>
          <dt>Стоимость моих share</dt>
          <dd>
            {u && s.shareSupply > 0n ? fmt((BigInt(u.shares) * BigInt(s.vaultA)) / BigInt(s.shareSupply), s.decimalsA) + " A" : "—"}
          </dd>
          <dt>Карточка: внесено / выведено</dt>
          <dd>
            {u?.card ? `${fmt(u.card.deposited, s.decimalsA)} / ${fmt(u.card.withdrawn, s.decimalsA)}` : "не создана"}
          </dd>
        </dl>
        {!u?.card && (
          <button className="primary" onClick={openCard}>
            Открыть карточку
          </button>
        )}
      </div>

      <div className="card">
        <h2>Внести</h2>
        {!idle && <p className="warn-text">Сейчас средства vault в работе — депозит временно закрыт.</p>}
        <div className="row">
          <input value={dep} onChange={(e) => setDep(e.target.value)} placeholder="Сколько токенов A" />
          <button className="primary" disabled={!u?.card || !idle} onClick={deposit}>
            Внести
          </button>
        </div>
        <p className="muted">Получите ≈ {fmt(BigInt(Math.floor(expectedShares)), s.decimalsA)} share</p>

        <h2>Вывести</h2>
        <div className="row">
          <input value={wd} onChange={(e) => setWd(e.target.value)} placeholder="Сколько share" />
          <button onClick={() => setWd(String(Number(u?.shares ?? 0n) / 10 ** s.decimalsA))}>Макс</button>
          <button className="primary" disabled={!u?.card || !idle || !wd} onClick={withdraw}>
            Вывести
          </button>
        </div>
        <p className="muted">Получите ≈ {fmt(BigInt(Math.floor(expectedOut)), s.decimalsA)} A</p>
      </div>
    </section>
  );
}

function AdminPanel({
  v,
  run,
  isAdmin,
}: {
  v: ReturnType<typeof useVault>;
  run: (l: string, f: () => Promise<string>) => void;
  isAdmin: boolean;
}) {
  const s = v.state!;
  const [poolAddr, setPoolAddr] = useState("");
  const [mintB, setMintB] = useState("");
  const [aToB, setAToB] = useState(true);
  const [amount, setAmount] = useState("100");
  const [slip, setSlip] = useState("1");
  const [quote, setQuote] = useState<string | null>(null);
  const [range, setRange] = useState("10");

  if (!v.wallet) return <div className="card">Подключите кошелёк администратора.</div>;
  if (!isAdmin)
    return (
      <div className="card warn">
        Эта страница только для администратора vault ({short(s.admin)}). Программа проверяет подпись админа в каждой
        инструкции — чужая транзакция будет отклонена с ошибкой <code>Unauthorized</code>.
      </div>
    );

  const configure = () =>
    run("Привязать пул", () =>
      v.program.methods
        .configurePool()
        .accounts({
          admin: v.wallet!.publicKey,
          vault: v.pdas!.vault,
          poolState: new PublicKey(poolAddr),
          mintB: new PublicKey(mintB),
        } as any)
        .rpc(),
    );

  const getQuote = async () => {
    const amt = toUnits(amount, aToB ? s.decimalsA : s.decimalsB);
    const { accounts, remaining } = await swapAccounts(v.program, v.clmm, s.mintA!, aToB);
    const sim = await v.program.methods
      .swap(amt, new BN(0), new BN(0), aToB)
      .accounts(accounts)
      .remainingAccounts(remaining)
      .preInstructions([computeIx()])
      .simulate();
    const ev: any = sim.events.find((e) => e.name === "swapEvent");
    return ev.data.amountOut as BN;
  };

  const doQuote = async () => {
    try {
      const out = await getQuote();
      setQuote(fmt(BigInt(out.toString()), aToB ? s.decimalsB : s.decimalsA, 6));
    } catch (e: any) {
      setQuote("ошибка: " + (e?.message ?? e));
    }
  };

  const swap = () =>
    run(`Обмен ${amount} ${aToB ? "A → B" : "B → A"} (slippage ${slip}%)`, async () => {
      const amt = toUnits(amount, aToB ? s.decimalsA : s.decimalsB);
      const expected = await getQuote();
      const minOut = expected.muln(Math.round((100 - Number(slip)) * 100)).divn(10000);
      const { accounts, remaining } = await swapAccounts(v.program, v.clmm, s.mintA!, aToB);
      return v.program.methods
        .swap(amt, minOut, new BN(0), aToB)
        .accounts(accounts)
        .remainingAccounts(remaining)
        .preInstructions([computeIx()])
        .rpc();
    });

  const openPosition = () =>
    run(`Открыть позицию ±${range}%`, async () => {
      const ps: any = await (v.clmm.account as any).poolState.fetch(s.pool!);
      const d0 = ps.mintDecimals0;
      const d1 = ps.mintDecimals1;
      const price = sqrtPriceX64ToPrice(ps.sqrtPriceX64, d0, d1);
      const sp = ps.tickSpacing;
      const pct = Number(range) / 100;
      const tl = Math.floor(priceToTick(price * (1 - pct), d0, d1) / sp) * sp;
      const tu = Math.ceil(priceToTick(price * (1 + pct), d0, d1) / sp) * sp;
      const aIs0 = ps.tokenMint0.equals(s.mintA);
      const a = new BN(s.vaultA.toString());
      const b = new BN(s.vaultB.toString());
      const amount0 = aIs0 ? a : b;
      const amount1 = aIs0 ? b : a;
      const liquidity = liquidityFromAmounts(ps.sqrtPriceX64, tl, tu, amount0, amount1).muln(98).divn(100);
      const nft = Keypair.generate();
      const o = await openPositionAccounts(v.program, v.clmm, s.mintA!, tl, tu, nft);
      return v.program.methods
        .openPosition(tl, tu, o.lowerStart, o.upperStart, liquidity, amount0, amount1)
        .accounts(o.accounts as any)
        .remainingAccounts(o.remaining)
        .preInstructions([computeIx()])
        .signers([nft])
        .rpc();
    });

  const collect = () =>
    run("Собрать комиссии", async () => {
      const m = await managePositionAccounts(v.program, v.clmm, s.mintA!);
      return v.program.methods
        .collectFees()
        .accounts(m.accounts as any)
        .remainingAccounts(m.remaining)
        .preInstructions([computeIx()])
        .rpc();
    });

  const close = () =>
    run(`Закрыть позицию (минимум −${slip}%)`, async () => {
      const m = await managePositionAccounts(v.program, v.clmm, s.mintA!);
      const est = amountsFromLiquidity(
        m.pool.sqrtPriceX64,
        m.position.tickLowerIndex,
        m.position.tickUpperIndex,
        m.position.liquidity,
      );
      const k = Math.round((100 - Number(slip)) * 100);
      return v.program.methods
        .closePosition(est.amount0.muln(k).divn(10000), est.amount1.muln(k).divn(10000))
        .accounts(m.accounts as any)
        .remainingAccounts(m.remaining)
        .preInstructions([computeIx()])
        .rpc();
    });

  if (!s.hasPool)
    return (
      <section className="card">
        <h2>Привязать CLMM-пул Raydium</h2>
        <div className="col">
          <input value={poolAddr} onChange={(e) => setPoolAddr(e.target.value)} placeholder="Адрес пула (pool state)" />
          <input value={mintB} onChange={(e) => setMintB(e.target.value)} placeholder="Mint токена B" />
          <button className="primary" onClick={configure} disabled={!poolAddr || !mintB}>
            Привязать и создать хранилище B
          </button>
        </div>
      </section>
    );

  return (
    <section className="grid two">
      <div className="card">
        <h2>Обмен через Raydium</h2>
        <div className="row">
          <select value={aToB ? "a2b" : "b2a"} onChange={(e) => setAToB(e.target.value === "a2b")}>
            <option value="a2b">A → B</option>
            <option value="b2a">B → A</option>
          </select>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Сумма" />
          <button
            onClick={() =>
              setAmount(String(Number(aToB ? s.vaultA : s.vaultB) / 10 ** (aToB ? s.decimalsA : s.decimalsB)))
            }
          >
            Всё
          </button>
        </div>
        <div className="row">
          <label className="muted">Slippage, %</label>
          <input className="small" value={slip} onChange={(e) => setSlip(e.target.value)} />
          <button onClick={doQuote}>Узнать курс</button>
          <button className="primary" disabled={s.hasPosition} onClick={swap}>
            Обменять
          </button>
        </div>
        {quote && <p className="muted">Ожидаемо получим: {quote}</p>}
        {s.hasPosition && <p className="warn-text">Пока открыта позиция, свободных средств для обмена нет.</p>}
      </div>

      <div className="card">
        <h2>Позиция в CLMM-пуле</h2>
        {s.position ? (
          <>
            <dl>
              <dt>Диапазон цены (token1/token0)</dt>
              <dd>
                {s.position.priceLower.toFixed(4)} … {s.position.priceUpper.toFixed(4)}
              </dd>
              <dt>Тики</dt>
              <dd>
                [{s.position.tickLower}, {s.position.tickUpper}]
              </dd>
              <dt>Ликвидность</dt>
              <dd>{s.position.liquidity}</dd>
              <dt>NFT позиции</dt>
              <dd>
                <a href={explorerAddr(s.position.nft)} target="_blank" rel="noreferrer">
                  {short(s.position.nft)} ↗
                </a>
              </dd>
            </dl>
            <div className="row">
              <button className="primary" onClick={collect}>
                Собрать комиссии
              </button>
              <button onClick={close}>Закрыть позицию</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Vault положит в пул все свободные токены A и B. Сначала обменяйте примерно половину A на B.
            </p>
            <div className="row">
              <label className="muted">Диапазон ±%</label>
              <input className="small" value={range} onChange={(e) => setRange(e.target.value)} />
              <button className="primary" onClick={openPosition} disabled={s.vaultB === 0n}>
                Открыть позицию
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
