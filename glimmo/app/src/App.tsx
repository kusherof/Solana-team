import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import PetSvg from "./components/PetSvg";
import Particles, { Kind, ParticlesHandle } from "./components/Particles";
import { DemoBackend } from "./game/demo";
import { ChainBackend, PROGRAM_ID, explorerAddr, explorerTx } from "./game/chain";
import {
  BODY_NAMES,
  Backend,
  EYE_NAMES,
  GameState,
  HORN_NAMES,
  MIN_SATIETY_TO_BREED,
  PATTERN_NAMES,
  Pet,
  STAGE_NAMES,
  TAIL_NAMES,
  fmtDuration,
  moodWord,
  now,
  stageOf,
  traits,
  withDecay,
  xpNeed,
} from "./game/model";
import { setSound, sfx, soundOn } from "./game/sound";

type Mode = "demo" | "chain";
type LogItem = { id: number; text: string; sig?: string; ok: boolean; t: number };
type Banner = { title: string; sub: string; key: number } | null;

const NAMES = ["Пиксель", "Кометка", "Нори", "Бублик", "Звёздка", "Мармелад", "Фантик", "Тучка", "Шиммер", "Лучик", "Облепиха", "Неон"];
const randomName = () => NAMES[Math.floor(Math.random() * NAMES.length)];

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const i = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(i);
  }, [ms]);
}

function getMode(): Mode {
  try {
    return (localStorage.getItem("glimmo-mode") as Mode) || "demo";
  } catch {
    return "demo";
  }
}

export default function App() {
  const wallet = useAnchorWallet();
  const [mode, setMode] = useState<Mode>(getMode);
  const [state, setState] = useState<GameState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const [reaction, setReaction] = useState<string>("");
  const [banner, setBanner] = useState<Banner>(null);
  const [modal, setModal] = useState<null | "adopt" | "breed" | "rename">(null);
  const [sound, setSoundState] = useState(soundOn());
  const particles = useRef<ParticlesHandle>(null);
  useTick(1000);

  const backend: Backend | null = useMemo(() => {
    if (mode === "demo") return new DemoBackend();
    return wallet ? new ChainBackend(wallet) : null;
  }, [mode, wallet]);

  useEffect(() => {
    try {
      localStorage.setItem("glimmo-mode", mode);
    } catch {
      /* пусто */
    }
  }, [mode]);

  const refresh = useCallback(async () => {
    if (!backend) {
      setState(null);
      return;
    }
    try {
      const s = await backend.load();
      setState(s);
      setLoadErr(null);
      setSelected((cur) => (cur && s.pets.some((p) => p.key === cur) ? cur : s.pets[0]?.key ?? null));
    } catch (e: any) {
      setLoadErr(e.message);
      setState(null);
    }
  }, [backend]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const params = state?.params;
  const pets = useMemo(() => (state && params ? state.pets.map((p) => withDecay(p, params)) : []), [state, params, Math.floor(Date.now() / 3000)]);
  const pet = pets.find((p) => p.key === selected) ?? null;

  const pushLog = (text: string, ok: boolean, sig?: string) =>
    setLog((l) => [{ id: Date.now() + Math.random(), text, ok, sig, t: now() }, ...l].slice(0, 30));

  const react = (cls: string, kind?: Kind) => {
    setReaction("");
    requestAnimationFrame(() => setReaction(cls));
    if (kind) particles.current?.burst(kind);
    setTimeout(() => setReaction(""), 900);
  };

  async function act(label: string, f: () => Promise<{ sig?: string; message?: string; newPetKey?: string }>, after?: (before: Pet | null) => void) {
    if (!backend || busy) return;
    setBusy(label);
    const before = pet;
    try {
      const r = await f();
      pushLog(label + (r.message ? ` · ${r.message}` : ""), true, r.sig);
      await refresh();
      if (r.newPetKey) setSelected(r.newPetKey);
      after?.(before);
    } catch (e: any) {
      sfx.error();
      pushLog(`${label}: ${e.message}`, false);
      react("react-no");
    } finally {
      setBusy(null);
    }
  }

  // Следим за ростом уровня и эволюцией
  const prevPet = useRef<Pet | null>(null);
  useEffect(() => {
    const p = prevPet.current;
    if (pet && params && p && p.key === pet.key) {
      if (!p.hatched && pet.hatched) {
        sfx.hatch();
        particles.current?.burst("confetti");
        setBanner({ title: "Вылупился!", sub: `Встречайте: ${pet.name}`, key: Date.now() });
      } else if (pet.level > p.level) {
        const sb = stageOf(p, params);
        const sa = stageOf(pet, params);
        sfx.level();
        particles.current?.burst("stars");
        setBanner(
          sa !== sb
            ? { title: "Эволюция!", sub: `${pet.name} теперь ${STAGE_NAMES[sa].toLowerCase()}`, key: Date.now() }
            : { title: `Уровень ${pet.level}`, sub: `${pet.name} стал сильнее`, key: Date.now() }
        );
      }
    }
    prevPet.current = pet;
  }, [pet?.key, pet?.level, pet?.hatched]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(t);
  }, [banner]);

  const t = now();
  const foodReady = state && params ? !state.lastFoodClaim || t - state.lastFoodClaim >= params.foodCooldown : false;
  const foodLeft = state && params ? Math.max(0, params.foodCooldown - (t - state.lastFoodClaim)) : 0;
  const stage = pet && params ? stageOf(pet, params) : 0;
  const eggProgress = pet && !pet.hatched ? Math.min(1, (t - pet.bornAt) / Math.max(1, pet.hatchAt - pet.bornAt)) : 0;
  const playLeft = pet && params && pet.lastPlay ? Math.max(0, params.playCooldown - (t - pet.lastPlay)) : 0;
  const adults = params ? pets.filter((p) => stageOf(p, params) === 3) : [];

  return (
    <div className={`app mode-${mode}`}>
      <div className="bg-orbs" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <header className="topbar">
        <div className="logo">
          <span className="logo-mark">◉</span>GLIMMO
          <small>питомцы на Solana</small>
        </div>
        <div className="mode-switch" role="tablist">
          <button className={mode === "demo" ? "on" : ""} onClick={() => setMode("demo")}>
            Демо
          </button>
          <button className={mode === "chain" ? "on" : ""} onClick={() => setMode("chain")}>
            Devnet
          </button>
        </div>
        <div className="chips">
          {state && (
            <>
              <span className="chip" title="Баланс SOL">
                ◎ {state.sol.toFixed(3)}
              </span>
              <span className="chip chip-food" title="Еда FOOD (SPL-токен)">
                🍖 {state.food}
              </span>
            </>
          )}
          <button
            className="chip chip-btn"
            title="Звук"
            onClick={() => {
              setSound(!sound);
              setSoundState(!sound);
            }}
          >
            {sound ? "🔊" : "🔇"}
          </button>
          {mode === "chain" && <WalletMultiButton />}
        </div>
      </header>

      {mode === "chain" && !wallet && (
        <div className="hero">
          <PetSvg dna={[3, 200, 40, 1, 2, 2, 5, 1, ...Array(24).fill(77)]} stage={3} size={200} />
          <h1>Подключите Phantom</h1>
          <p>Переключите кошелёк на Devnet, подключитесь, и ваши Глиммы появятся здесь. Каждое действие — настоящая транзакция.</p>
          <WalletMultiButton />
        </div>
      )}
      {loadErr && <div className="hero"><h1>Не получилось загрузить игру</h1><p>{loadErr}</p><button className="btn" onClick={refresh}>Повторить</button></div>}

      {state && params && (
        <main className="layout">
          {/* --- Стая --- */}
          <aside className="panel flock">
            <h2>
              Моя стая <span className="muted">{pets.length}</span>
            </h2>
            <div className="flock-list">
              {pets.map((p) => {
                const s = stageOf(p, params);
                const ready = !p.hatched && t >= p.hatchAt;
                return (
                  <button key={p.key} className={`pet-card ${p.key === selected ? "sel" : ""} ${ready ? "ready" : ""}`} onClick={() => { sfx.click(); setSelected(p.key); }}>
                    <PetSvg dna={p.dna} stage={s} satiety={p.satiety} mood={p.mood} eggProgress={Math.min(1, (t - p.bornAt) / Math.max(1, p.hatchAt - p.bornAt))} size={64} />
                    <div className="pet-card-info">
                      <b>{p.name}</b>
                      <span className="muted">
                        {s === 0 ? (ready ? "готов вылупиться!" : `яйцо · ${fmtDuration(p.hatchAt - t)}`) : `ур. ${p.level} · ${STAGE_NAMES[s]}`}
                      </span>
                      {s > 0 && (
                        <div className="mini-bars">
                          <i style={{ width: `${p.satiety}%` }} className="b-sat" />
                          <i style={{ width: `${p.mood}%` }} className="b-mood" />
                        </div>
                      )}
                    </div>
                    {traits(p.dna).shiny && <span className="shiny-tag">✦</span>}
                  </button>
                );
              })}
              <button className="pet-card adopt" onClick={() => setModal("adopt")}>
                <span className="adopt-egg">🥚</span>
                <div className="pet-card-info">
                  <b>Новое яйцо</b>
                  <span className="muted">{params.eggPrice / 1e9} SOL · NFT Token-2022</span>
                </div>
              </button>
            </div>
          </aside>

          {/* --- Сцена --- */}
          <section className="stage-panel">
            {!pet ? (
              <div className="empty">
                <h1>Здесь пока пусто</h1>
                <p>Купите первое яйцо — из него вылупится уникальный Глимм со своей ДНК.</p>
                <button className="btn btn-big" onClick={() => setModal("adopt")}>
                  🥚 Купить яйцо
                </button>
              </div>
            ) : (
              <>
                <div className="stage-head">
                  <button className="pet-name" onClick={() => pet.hatched && setModal("rename")} title="Переименовать">
                    {pet.name} <span className="pencil">✎</span>
                  </button>
                  <div className="badges">
                    <span className={`badge stage-${stage}`}>{STAGE_NAMES[stage]}</span>
                    {pet.hatched && <span className="badge">ур. {pet.level}</span>}
                    <span className="badge">пок. {pet.generation}</span>
                    {traits(pet.dna).shiny && <span className="badge badge-shiny">✦ сияющий</span>}
                  </div>
                </div>

                <div className={`stage ${reaction}`}>
                  <div className="stage-floor" />
                  <div className={`pet-holder ${!pet.hatched ? "is-egg" : ""}`}>
                    <PetSvg dna={pet.dna} stage={stage} satiety={pet.satiety} mood={pet.mood} eggProgress={eggProgress} size={330} />
                  </div>
                  <Particles ref={particles} />
                  <div className="mood-bubble">{moodWord(pet)}</div>
                  {banner && (
                    <div className="banner" key={banner.key}>
                      <b>{banner.title}</b>
                      <span>{banner.sub}</span>
                    </div>
                  )}
                </div>

                {pet.hatched ? (
                  <>
                    <div className="stats">
                      <Stat label="Сытость" icon="🍖" value={pet.satiety} cls="sat" />
                      <Stat label="Настроение" icon="💜" value={pet.mood} cls="mood" />
                      <div className="xp">
                        <div className="xp-level">{pet.level}</div>
                        <div className="xp-bar">
                          <i style={{ width: `${Math.min(100, (pet.xp / xpNeed(pet, params)) * 100)}%` }} />
                          <span>
                            опыт {pet.xp} / {xpNeed(pet, params)}
                            {stage < 3 && ` · взрослый на ур. ${params.adultLevel}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="actions">
                      <button className="btn btn-feed" disabled={!!busy || state.food < 1 || pet.satiety >= 100} onClick={() => act("Покормить", () => backend!.feed(pet, 1), () => { sfx.feed(); react("react-feed", "crumbs"); })}>
                        🍖 Покормить <small>1 FOOD</small>
                      </button>
                      <button className="btn btn-feed" disabled={!!busy || state.food < 3 || pet.satiety >= 100} onClick={() => act("Пир", () => backend!.feed(pet, 3), () => { sfx.feed(); react("react-feed", "crumbs"); })}>
                        🍱 Пир <small>3 FOOD</small>
                      </button>
                      <button className="btn btn-play" disabled={!!busy || pet.satiety < 10 || playLeft > 0} onClick={() => act("Играть", () => backend!.play(pet), () => { sfx.play(); react("react-play", "hearts"); })}>
                        ✨ Играть {playLeft > 0 && <small>{fmtDuration(playLeft)}</small>}
                      </button>
                      <button className="btn btn-breed" disabled={!!busy || adults.length < 2} onClick={() => setModal("breed")} title={adults.length < 2 ? "Нужны два взрослых питомца" : ""}>
                        🧬 Скрестить
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="egg-panel">
                    {t >= pet.hatchAt ? (
                      <button className="btn btn-big btn-hatch" disabled={!!busy} onClick={() => act("Вылупить", () => backend!.hatch(pet))}>
                        🐣 Вылупить!
                      </button>
                    ) : (
                      <>
                        <div className="egg-timer">{fmtDuration(pet.hatchAt - t)}</div>
                        <div className="xp-bar">
                          <i style={{ width: `${eggProgress * 100}%` }} />
                          <span>яйцо греется…</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {busy && <div className="busy">⏳ {busy}: подпишите транзакцию…</div>}
              </>
            )}
          </section>

          {/* --- Правая колонка --- */}
          <aside className="side">
            <div className="panel feeder">
              <h2>Кормушка</h2>
              <p className="muted">Раз в {fmtDuration(params.foodCooldown)} — {params.foodPerClaim} FOOD (SPL-токен, mint принадлежит программе).</p>
              <button className="btn btn-food" disabled={!foodReady || !!busy} onClick={() => act("Кормушка", () => backend!.claimFood(), () => { sfx.coin(); })}>
                {foodReady ? `Забрать ${params.foodPerClaim} 🍖` : `через ${fmtDuration(foodLeft)}`}
              </button>
            </div>

            {pet && <DnaPanel pet={pet} />}

            <div className="panel log">
              <h2>Журнал транзакций</h2>
              {log.length === 0 && <p className="muted">Здесь появятся ваши действия{mode === "chain" ? " со ссылками на Explorer" : ""}.</p>}
              <ul>
                {log.map((l) => (
                  <li key={l.id} className={l.ok ? "ok" : "fail"}>
                    <span>{l.ok ? "✔" : "✖"} {l.text}</span>
                    {l.sig && mode === "chain" && (
                      <a href={explorerTx(l.sig)} target="_blank" rel="noreferrer">
                        tx ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              {mode === "demo" && (
                <button className="link" onClick={() => { DemoBackend.reset(); location.reload(); }}>
                  Сбросить демо
                </button>
              )}
            </div>
          </aside>
        </main>
      )}

      {modal === "adopt" && params && (
        <NameModal
          title="Новое яйцо"
          text={`Яйцо стоит ${params.eggPrice / 1e9} SOL и приходит в кошелёк как NFT стандарта Token-2022. ДНК выпадет случайно, а через ${fmtDuration(params.hatchSeconds)} вылупится питомец.`}
          cta="🥚 Купить яйцо"
          onClose={() => setModal(null)}
          onSubmit={(name) => {
            setModal(null);
            act("Новое яйцо", () => backend!.adopt(name), () => sfx.coin());
          }}
        />
      )}
      {modal === "rename" && pet && (
        <NameModal title="Новое имя" text="Имя меняется и в аккаунте питомца, и в метаданных NFT (Token-2022)." cta="Сохранить" initial={pet.name} onClose={() => setModal(null)} onSubmit={(name) => { setModal(null); act("Переименовать", () => backend!.rename(pet, name)); }} />
      )}
      {modal === "breed" && pet && params && (
        <BreedModal
          pets={adults}
          first={adults.some((a) => a.key === pet.key) ? pet : adults[0]}
          cost={params.breedFoodCost}
          onClose={() => setModal(null)}
          onSubmit={(a, b, name) => {
            setModal(null);
            act("Скрещивание", () => backend!.breed(a, b, name), () => { sfx.hatch(); particles.current?.burst("hearts"); });
          }}
        />
      )}
      <footer className="foot">
        {mode === "chain" && params ? (
          <>
            Программа в devnet: <ProgramIdLink /> · всего Глиммов: {state?.totalPets ?? 0}
          </>
        ) : (
          <>Демо-режим: всё хранится в браузере, таймеры ускорены. Переключитесь на Devnet, чтобы играть по-настоящему.</>
        )}
      </footer>
    </div>
  );
}

function ProgramIdLink() {
  const a = PROGRAM_ID.toBase58();
  return (
    <a href={explorerAddr(a)} target="_blank" rel="noreferrer">
      {a.slice(0, 6)}…{a.slice(-6)} ↗
    </a>
  );
}

function Stat({ label, icon, value, cls }: { label: string; icon: string; value: number; cls: string }) {
  return (
    <div className={`stat stat-${cls} ${value < 25 ? "low" : ""}`}>
      <div className="stat-top">
        <span>
          {icon} {label}
        </span>
        <b>{value}</b>
      </div>
      <div className="stat-bar">
        <i style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Swatch({ h }: { h: number }) {
  return <i className="swatch" style={{ background: `hsl(${h} 85% 60%)` }} />;
}

function DnaPanel({ pet }: { pet: Pet }) {
  const tr = traits(pet.dna);
  return (
    <div className="panel dna">
      <h2>ДНК</h2>
      <div className="dna-strip">
        {pet.dna.map((b, i) => (
          <i key={i} style={{ background: `hsl(${(b / 256) * 360} 80% ${i < 8 ? 60 : 35}%)` }} title={`ген ${i}: ${b}`} />
        ))}
      </div>
      {!pet.hatched ? (
        <p className="muted">Гены уже записаны в блокчейн, но внешность — сюрприз до вылупления. Подсказка — цвета скорлупы.</p>
      ) : (
      <dl className="traits">
        <dt>Форма</dt>
        <dd>{BODY_NAMES[tr.body]}</dd>
        <dt>Цвета</dt>
        <dd>
          <Swatch h={tr.hue} />
          <Swatch h={tr.hue2} />
        </dd>
        <dt>Узор</dt>
        <dd>{PATTERN_NAMES[tr.pattern]}</dd>
        <dt>Глаза</dt>
        <dd>{EYE_NAMES[tr.eyes]}</dd>
        <dt>Рожки</dt>
        <dd>{HORN_NAMES[tr.horns]}</dd>
        <dt>Хвост</dt>
        <dd>{TAIL_NAMES[tr.tail]}</dd>
        <dt>Редкость</dt>
        <dd>{tr.shiny ? "✦ Сияющий (5%)" : "Обычный"}</dd>
      </dl>
      )}
      <p className="muted small">
        Покормлен {pet.timesFed} · играл {pet.timesPlayed} · детей {pet.children}
      </p>
    </div>
  );
}

function NameModal({ title, text, cta, initial, onClose, onSubmit }: { title: string; text: string; cta: string; initial?: string; onClose: () => void; onSubmit: (n: string) => void }) {
  const [name, setName] = useState(initial ?? randomName());
  const bytes = new TextEncoder().encode(name).length;
  const ok = bytes > 0 && bytes <= 20;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="muted">{text}</p>
        <div className="name-row">
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={20} />
          <button className="btn btn-ghost" onClick={() => setName(randomName())} title="Случайное имя">
            🎲
          </button>
        </div>
        <p className={`muted small ${ok ? "" : "err"}`}>{bytes} / 20 байт</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn" disabled={!ok} onClick={() => onSubmit(name.trim())}>
            {cta}
          </button>
        </div>
      </div>
    </div>
  );
}

function GeneRow({ label, a, b, render }: { label: string; a: number; b: number; render: (v: number) => React.ReactNode }) {
  return (
    <div className="gene-row">
      <span className="gene-a">{render(a)}</span>
      <span className="gene-label">{label}</span>
      <span className="gene-b">{render(b)}</span>
    </div>
  );
}

function BreedModal({ pets, first, cost, onClose, onSubmit }: { pets: Pet[]; first: Pet; cost: number; onClose: () => void; onSubmit: (a: Pet, b: Pet, name: string) => void }) {
  const [a, setA] = useState<Pet>(first);
  const others = pets.filter((p) => p.key !== a.key);
  const [b, setB] = useState<Pet | null>(others[0] ?? null);
  const [name, setName] = useState(randomName());
  const ta = traits(a.dna);
  const tb = b ? traits(b.dna) : null;
  const problems = [a, b].filter(Boolean).filter((p) => p!.satiety < MIN_SATIETY_TO_BREED).map((p) => `${p!.name} голоден (нужно ≥ ${MIN_SATIETY_TO_BREED} сытости)`);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>🧬 Скрещивание</h2>
        <p className="muted">Каждый ген ребёнок берёт от случайного родителя, а видимые гены с шансом 1 из 8 мутируют. Стоит {cost} FOOD, яйцо придёт новым NFT.</p>
        <div className="breed-pair">
          <div className="parent">
            <PetSvg dna={a.dna} stage={3} satiety={a.satiety} mood={a.mood} size={130} />
            <select value={a.key} onChange={(e) => { const n = pets.find((p) => p.key === e.target.value)!; setA(n); if (b?.key === n.key) setB(pets.find((p) => p.key !== n.key) ?? null); }}>
              {pets.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </div>
          <div className="heart">💞</div>
          <div className="parent">
            {b ? <PetSvg dna={b.dna} stage={3} satiety={b.satiety} mood={b.mood} size={130} /> : <div className="no-pet">?</div>}
            <select value={b?.key ?? ""} onChange={(e) => setB(pets.find((p) => p.key === e.target.value) ?? null)}>
              {others.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </div>
        </div>
        {tb && (
          <div className="genes">
            <GeneRow label="форма" a={ta.body} b={tb.body} render={(v) => BODY_NAMES[v]} />
            <GeneRow label="цвет" a={ta.hue} b={tb.hue} render={(v) => <Swatch h={v} />} />
            <GeneRow label="узор" a={ta.pattern} b={tb.pattern} render={(v) => PATTERN_NAMES[v]} />
            <GeneRow label="глаза" a={ta.eyes} b={tb.eyes} render={(v) => EYE_NAMES[v]} />
            <GeneRow label="рожки" a={ta.horns} b={tb.horns} render={(v) => HORN_NAMES[v]} />
            <div className="gene-row mut">+ шанс мутации и сияния ✦</div>
          </div>
        )}
        {problems.map((p) => <p key={p} className="err small">{p}</p>)}
        <div className="name-row">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Имя малыша" />
          <button className="btn btn-ghost" onClick={() => setName(randomName())}>🎲</button>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-breed" disabled={!b || problems.length > 0 || !name.trim()} onClick={() => b && onSubmit(a, b, name.trim())}>
            Скрестить · {cost} 🍖
          </button>
        </div>
      </div>
    </div>
  );
}
