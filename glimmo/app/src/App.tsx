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
  FORM_NAMES,
  GameState,
  HORN_NAMES,
  MAX_CHILDREN,
  MIN_MOOD_TO_BREED,
  MIN_SATIETY_TO_BREED,
  MIN_SATIETY_TO_PLAY,
  PATTERN_NAMES,
  Params,
  Pet,
  STAGE_NAMES,
  TAIL_NAMES,
  TxResult,
  breedCost,
  breedWait,
  eggDna,
  fmtDuration,
  moodWord,
  nameOk,
  now,
  powerScore,
  rarityScore,
  rarityTier,
  related,
  stageOf,
  traits,
  withDecay,
  xpMultiplier,
  xpNeed,
} from "./game/model";
import { setSound, sfx, soundOn } from "./game/sound";

type Mode = "demo" | "chain";
type LogItem = { id: number; text: string; sig?: string; ok: boolean; t: number };
type Banner = { title: string; sub: string; key: number } | null;
type Float = { id: number; text: string; cls: string };

/** Сборка «только демо» (для ссылки с телефона): devnet открывается полной версией сайта. */
const DEMO_ONLY = import.meta.env.VITE_DEMO_ONLY === "1";
const FULL_URL: string = import.meta.env.VITE_FULL_URL || "https://kusherof.github.io/Solana-team/";
const IS_MOBILE = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
/** Открыть сайт во встроенном браузере Phantom (на телефоне расширений нет). */
const phantomBrowseLink = () =>
  `https://phantom.app/ul/browse/${encodeURIComponent(location.href)}?ref=${encodeURIComponent(location.origin)}`;

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
  if (DEMO_ONLY) return "demo";
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
  const busyRef = useRef(false);
  const [log, setLog] = useState<LogItem[]>([]);
  const [reaction, setReaction] = useState<string>("");
  const [flash, setFlash] = useState(0);
  const [banner, setBanner] = useState<Banner>(null);
  const [floats, setFloats] = useState<Float[]>([]);
  const [board, setBoard] = useState<Pet[]>([]);
  const [modal, setModal] = useState<null | "adopt" | "breed" | "rename" | "help">(null);
  const [sound, setSoundState] = useState(soundOn());
  const particles = useRef<ParticlesHandle>(null);
  useTick(1000);

  // Демо не зависит от кошелька, чтобы подключение не сбрасывало игру
  const demo = useMemo(() => new DemoBackend(), []);
  const backend: Backend | null = useMemo(() => {
    if (mode === "demo") return demo;
    return wallet ? new ChainBackend(wallet) : null;
  }, [mode, wallet, demo]);

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
      setLoadErr(null);
      return;
    }
    try {
      const s = await backend.load();
      setState(s);
      setLoadErr(null);
      setSelected((cur) => (cur && s.pets.some((p) => p.key === cur) ? cur : s.pets[0]?.key ?? null));
    } catch (e: any) {
      setLoadErr(e?.message ?? String(e));
      setState(null);
    }
    backend
      .leaderboard()
      .then(setBoard)
      .catch(() => setBoard([]));
  }, [backend]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const params = state?.params;
  const tick3 = Math.floor(Date.now() / 3000);
  const pets = useMemo(() => (state && params ? state.pets.map((p) => withDecay(p, params)) : []), [state, params, tick3]);
  const pet = pets.find((p) => p.key === selected) ?? null;

  const pushLog = (text: string, ok: boolean, sig?: string) =>
    setLog((l) => [{ id: Date.now() + Math.random(), text, ok, sig, t: now() }, ...l].slice(0, 30));

  const float = (text: string, cls: string, delay = 0) => {
    const id = Date.now() + Math.random();
    setTimeout(() => setFloats((f) => [...f, { id, text, cls }]), delay);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), delay + 1600);
  };

  const react = (cls: string, kind?: Kind) => {
    setReaction("");
    requestAnimationFrame(() => setReaction(cls));
    if (kind) particles.current?.burst(kind);
    setTimeout(() => setReaction(""), 900);
  };

  async function act(label: string, f: () => Promise<TxResult>, after?: (r: TxResult, before: Pet | null) => void) {
    if (!backend || busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    const before = pet;
    try {
      const r = await f();
      pushLog(label + (r.message ? ` · ${r.message}` : ""), true, r.sig);
      await refresh();
      if (r.newPetKey) setSelected(r.newPetKey);
      after?.(r, before);
    } catch (e: any) {
      sfx.error();
      pushLog(`${label}: ${e?.message ?? e}`, false);
      react("react-no");
      await refresh();
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  // Рост уровня, эволюция и вылупление
  const prevPet = useRef<Pet | null>(null);
  useEffect(() => {
    const p = prevPet.current;
    if (pet && params && p && p.key === pet.key) {
      if (!p.hatched && pet.hatched) {
        sfx.hatch();
        setFlash(Date.now());
        particles.current?.burst("confetti");
        const tr = traits(pet.dna);
        const tier = rarityTier(rarityScore(pet.dna));
        setBanner({ title: tr.shiny ? "✦ Сияющий!" : "Вылупился!", sub: `${pet.name} · ${tier.name}`, key: Date.now() });
      } else if (pet.level > p.level) {
        const sb = stageOf(p, params);
        const sa = stageOf(pet, params);
        sfx.level();
        particles.current?.burst("stars");
        setBanner(
          sa !== sb
            ? {
                title: "Эволюция!",
                sub: sa === 3 && pet.form ? `${pet.name}: ${FORM_NAMES[pet.form].toLowerCase()}` : `${pet.name} теперь ${STAGE_NAMES[sa].toLowerCase()}`,
                key: Date.now(),
              }
            : { title: `Уровень ${pet.level}`, sub: `${pet.name} стал сильнее`, key: Date.now() }
        );
      }
      if (pet.streak > p.streak && pet.streak > 1) float(`🔥 серия ${pet.streak}`, "f-streak", 500);
    }
    prevPet.current = pet;
  }, [pet?.key, pet?.level, pet?.hatched, pet?.streak]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(t);
  }, [banner]);

  // Грустный питомец иногда «засыпает»
  useEffect(() => {
    if (!pet?.hatched || pet.mood >= 25) return;
    const i = setInterval(() => particles.current?.burst("zzz"), 4000);
    return () => clearInterval(i);
  }, [pet?.key, pet?.hatched, (pet?.mood ?? 100) < 25]);

  const t = now();
  const foodReady = state && params ? state.hasPlayer && (!state.lastFoodClaim || t - state.lastFoodClaim >= params.foodCooldown) : false;
  const foodLeft = state && params && state.lastFoodClaim ? Math.max(0, params.foodCooldown - (t - state.lastFoodClaim)) : 0;
  const stage = pet && params ? stageOf(pet, params) : 0;
  const eggProgress = pet && !pet.hatched ? Math.min(1, (t - pet.bornAt) / Math.max(1, pet.hatchAt - pet.bornAt)) : 0;
  const playLeft = pet && params && pet.lastPlay ? Math.max(0, params.playCooldown - (t - pet.lastPlay)) : 0;
  const adults = params ? pets.filter((p) => stageOf(p, params) === 3) : [];
  const chainBusy = mode === "chain" ? ": подпишите транзакцию…" : "…";

  const feed = (p: Pet, n: number) =>
    act(n > 1 ? "Пир" : "Покормить", () => backend!.feed(p, n), (r) => {
      sfx.feed();
      react("react-feed", "crumbs");
      const m = r.message?.match(/\+(\d+) сытости · \+(\d+) опыта/);
      if (m) {
        float(`+${m[1]} 🍖`, "f-food");
        float(`+${m[2]} XP`, "f-xp", 250);
      }
    });
  const play = (p: Pet) =>
    act("Играть", () => backend!.play(p), (r) => {
      sfx.play();
      react("react-play", "hearts");
      const m = r.message?.match(/\+(\d+) опыта/);
      if (m) float(`+${m[1]} XP`, "f-xp");
    });
  const pat = () => {
    if (!pet?.hatched) return;
    sfx.click();
    react("react-pat", "hearts");
  };

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
        <div className="mode-switch" role="tablist" aria-label="Режим игры">
          <button role="tab" aria-selected={mode === "demo"} className={mode === "demo" ? "on" : ""} onClick={() => setMode("demo")}>
            Демо
          </button>
          {DEMO_ONLY ? (
            <a className="mode-link" href={FULL_URL} target="_blank" rel="noreferrer">
              Devnet ↗
            </a>
          ) : (
            <button role="tab" aria-selected={mode === "chain"} className={mode === "chain" ? "on" : ""} onClick={() => setMode("chain")}>
              Devnet
            </button>
          )}
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
          <button className="chip chip-btn" title="Как играть" aria-label="Как играть" onClick={() => setModal("help")}>
            ?
          </button>
          <button
            className="chip chip-btn"
            title="Звук"
            aria-label={sound ? "Выключить звук" : "Включить звук"}
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
          <PetSvg dna={[3, 200, 40, 1, 2, 2, 5, 1, ...Array(24).fill(77)]} stage={3} form={1} size={200} />
          <h1>Подключите Phantom</h1>
          <p>Переключите кошелёк на Devnet и подключитесь, и ваши Глиммы появятся здесь. Каждое действие — настоящая транзакция.</p>
          <WalletMultiButton />
          {IS_MOBILE && (
            <p className="muted small">
              На телефоне кошелёк работает внутри приложения Phantom:{" "}
              <a href={phantomBrowseLink()}>открыть игру в Phantom ↗</a>
            </p>
          )}
        </div>
      )}
      {loadErr && (
        <div className="hero">
          <h1>Не получилось загрузить игру</h1>
          <p>{loadErr}</p>
          <button className="btn" onClick={refresh}>
            Повторить
          </button>
        </div>
      )}

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
                  <button
                    key={p.key}
                    className={`pet-card ${p.key === selected ? "sel" : ""} ${ready ? "ready" : ""}`}
                    onClick={() => {
                      sfx.click();
                      setSelected(p.key);
                    }}
                  >
                    <PetSvg dna={p.hatched ? p.dna : eggDna(p)} stage={s} satiety={p.satiety} mood={p.mood} form={p.form} eggProgress={Math.min(1, (t - p.bornAt) / Math.max(1, p.hatchAt - p.bornAt))} size={64} />
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
                    {p.hatched && traits(p.dna).shiny && <span className="shiny-tag">✦</span>}
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
                  <button className="pet-name" disabled={!pet.hatched} onClick={() => setModal("rename")} title={pet.hatched ? "Переименовать" : ""}>
                    {pet.name} {pet.hatched && <span className="pencil">✎</span>}
                  </button>
                  <div className="badges">
                    <span className={`badge stage-${stage}`}>{STAGE_NAMES[stage]}</span>
                    {pet.hatched && <span className="badge">ур. {pet.level}</span>}
                    <span className="badge">пок. {pet.generation}</span>
                    {pet.hatched && <RarityBadge dna={pet.dna} />}
                    {pet.form > 0 && <span className={`badge form-${pet.form}`}>{FORM_NAMES[pet.form]}</span>}
                  </div>
                </div>

                <div className={`stage stage-s${stage} ${reaction} ${flash && Date.now() - flash < 1200 ? "flash" : ""}`}>
                  <div className="stage-floor" />
                  {pet.hatched && (
                    <div className="care-chips">
                      <span className="care-chip" title="Дней заботы подряд">🔥 {pet.streak}</span>
                      <span className="care-chip" title="Привязанность (растёт, если заходить каждый день)">💞 {pet.bond}</span>
                      <span className="care-chip" title="Множитель опыта: настроение и серия">×{(xpMultiplier(pet) / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <button className={`pet-holder ${!pet.hatched ? "is-egg" : ""}`} onClick={pat} disabled={!pet.hatched} aria-label={pet.hatched ? `Погладить ${pet.name}` : "Яйцо"}>
                    <PetSvg dna={pet.hatched ? pet.dna : eggDna(pet)} stage={stage} satiety={pet.satiety} mood={pet.mood} form={pet.form} eggProgress={eggProgress} size={330} />
                  </button>
                  {pet.hatched && <div className="pat-hint">нажмите, чтобы погладить</div>}
                  <Particles ref={particles} />
                  <div className="floats" aria-hidden>
                    {floats.map((f) => (
                      <span key={f.id} className={`float-num ${f.cls}`}>
                        {f.text}
                      </span>
                    ))}
                  </div>
                  <div className="mood-bubble">{moodWord(pet)}</div>
                  {banner && (
                    <div className="banner-slot" role="status">
                      <div className="banner" key={banner.key}>
                        <b>{banner.title}</b>
                        <span>{banner.sub}</span>
                      </div>
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
                      <button className="btn btn-feed" disabled={!!busy || state.food < 1 || pet.satiety >= 100} onClick={() => feed(pet, 1)}>
                        🍖 Покормить <small>1 FOOD</small>
                      </button>
                      <button className="btn btn-feed" disabled={!!busy || state.food < 1 || pet.satiety >= 100} onClick={() => feed(pet, 3)} title="Съест столько, сколько влезет (до 3)">
                        🍱 Пир <small>до 3 FOOD</small>
                      </button>
                      <button className="btn btn-play" disabled={!!busy || pet.satiety < MIN_SATIETY_TO_PLAY || playLeft > 0} onClick={() => play(pet)}>
                        ✨ Играть {playLeft > 0 && <small>{fmtDuration(playLeft)}</small>}
                      </button>
                      <button className="btn btn-breed" disabled={!!busy || adults.length < 2} onClick={() => setModal("breed")} title={adults.length < 2 ? "Нужны два взрослых питомца" : ""}>
                        🧬 Скрестить
                      </button>
                    </div>
                    <p className="hint">{hintFor(pet, params, state.food)}</p>
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
                {busy && (
                  <div className="busy" role="status">
                    ⏳ {busy}
                    {chainBusy}
                  </div>
                )}
              </>
            )}
          </section>

          {/* --- Правая колонка --- */}
          <aside className="side">
            <div className="panel feeder">
              <h2>Кормушка</h2>
              <p className="muted">
                Раз в {fmtDuration(params.foodCooldown)} — {params.foodPerClaim} FOOD (SPL-токен, mint принадлежит программе).
                {!state.hasPlayer && " Откроется после покупки первого яйца."}
              </p>
              <button className="btn btn-food" disabled={!foodReady || !!busy} onClick={() => act("Кормушка", () => backend!.claimFood(), () => { sfx.coin(); float(`+${params.foodPerClaim} 🍖`, "f-food"); })}>
                {!state.hasPlayer ? "Сначала яйцо" : foodReady ? `Забрать ${params.foodPerClaim} 🍖` : `через ${fmtDuration(foodLeft)}`}
              </button>
            </div>

            {pet && <DnaPanel pet={pet} />}

            <Leaderboard board={board} mine={new Set(pets.map((p) => p.key))} onPick={setSelected} />

            <div className="panel log">
              <h2>Журнал транзакций</h2>
              {log.length === 0 && <p className="muted">Здесь появятся ваши действия{mode === "chain" ? " со ссылками на Explorer" : ""}.</p>}
              <ul>
                {log.map((l) => (
                  <li key={l.id} className={l.ok ? "ok" : "fail"}>
                    <span>
                      {l.ok ? "✔" : "✖"} {l.text}
                    </span>
                    {l.sig && mode === "chain" && (
                      <a href={explorerTx(l.sig)} target="_blank" rel="noreferrer">
                        tx ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              {mode === "demo" && (
                <button
                  className="link"
                  onClick={() => {
                    DemoBackend.reset();
                    location.reload();
                  }}
                >
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
          text={`Яйцо стоит ${params.eggPrice / 1e9} SOL и приходит в кошелёк как NFT стандарта Token-2022. Гены определятся при вылуплении через ${fmtDuration(params.hatchSeconds)} — заранее их не узнать.`}
          cta="🥚 Купить яйцо"
          onClose={() => setModal(null)}
          onSubmit={(name) => {
            setModal(null);
            act("Новое яйцо", () => backend!.adopt(name), () => sfx.coin());
          }}
        />
      )}
      {modal === "rename" && pet && (
        <NameModal
          title="Новое имя"
          text="Имя меняется и в аккаунте питомца, и в метаданных NFT (Token-2022)."
          cta="Сохранить"
          initial={pet.name}
          onClose={() => setModal(null)}
          onSubmit={(name) => {
            setModal(null);
            act("Переименовать", () => backend!.rename(pet, name));
          }}
        />
      )}
      {modal === "breed" && params && state && adults.length >= 2 && (
        <BreedModal
          key={adults.map((a) => a.key).join()}
          pets={adults}
          first={pet && adults.some((a) => a.key === pet.key) ? pet : adults[0]}
          params={params}
          food={state.food}
          onClose={() => setModal(null)}
          onSubmit={(a, b, name) => {
            setModal(null);
            act("Скрещивание", () => backend!.breed(a, b, name), () => {
              sfx.hatch();
              particles.current?.burst("hearts");
            });
          }}
        />
      )}
      {modal === "help" && <HelpModal onClose={() => setModal(null)} />}
      <footer className="foot">
        {mode === "chain" && params ? (
          <>
            Программа в devnet: <ProgramIdLink /> · всего Глиммов: {state?.totalPets ?? 0}
          </>
        ) : (
          <>
            Демо-режим: всё хранится в браузере, таймеры ускорены, «день заботы» длится минуту.{" "}
            {DEMO_ONLY ? (
              <a href={FULL_URL} target="_blank" rel="noreferrer">
                Версия с Devnet ↗
              </a>
            ) : (
              "Переключитесь на Devnet, чтобы играть по-настоящему."
            )}
          </>
        )}
      </footer>
    </div>
  );
}

function hintFor(p: Pet, params: Params, food: number): string {
  if (p.satiety < 25) return food > 0 ? "Питомец голоден — покормите, иначе испортится облик взрослого." : "FOOD закончилась — загляните в кормушку.";
  if (p.mood < 30) return "Поиграйте: весёлый питомец получает больше опыта.";
  if (stageOf(p, params) < 3) return `До взрослого — уровень ${params.adultLevel}. Облик зависит от того, сколько раз питомец голодал.`;
  if (p.children >= MAX_CHILDREN) return "Детей уже максимум — растите привязанность и поднимайтесь в рейтинге.";
  return "Взрослых можно скрестить — гены смешаются, возможны мутации и сияние.";
}

function ProgramIdLink() {
  const a = PROGRAM_ID.toBase58();
  return (
    <a href={explorerAddr(a)} target="_blank" rel="noreferrer">
      {a.slice(0, 6)}…{a.slice(-6)} ↗
    </a>
  );
}

function RarityBadge({ dna }: { dna: number[] }) {
  const score = rarityScore(dna);
  const tier = rarityTier(score);
  const shiny = traits(dna).shiny;
  return (
    <span className={`badge ${tier.cls}`} title={`Очки редкости: ${score}`}>
      {shiny ? "✦ " : ""}
      {tier.name}
    </span>
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
      <div className="stat-bar" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
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
      <div className={`dna-strip ${pet.hatched ? "" : "dna-unknown"}`}>
        {(pet.hatched ? pet.dna : Array(32).fill(0)).map((b: number, i: number) => (
          <i key={i} style={pet.hatched ? { background: `hsl(${(b / 256) * 360} 80% ${i < 8 ? 60 : 35}%)` } : { animationDelay: `${i * 0.04}s` }} title={pet.hatched ? `ген ${i}: ${b}` : "ещё неизвестно"} />
        ))}
      </div>
      {!pet.hatched ? (
        <p className="muted">
          {pet.generation > 0
            ? "Гены родителей уже лежат в яйце и смешаются при вылуплении."
            : "Гены выпадут при вылуплении из хеша будущего слота — заранее их не знает никто, даже вы."}
        </p>
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
          <dd>
            <RarityBadge dna={pet.dna} /> <span className="muted small">{rarityScore(pet.dna)} очк.</span>
          </dd>
        </dl>
      )}
      <p className="muted small">
        Покормлен {pet.timesFed} · играл {pet.timesPlayed} · детей {pet.children}/{MAX_CHILDREN} · промахов ухода {pet.careMistakes}
      </p>
    </div>
  );
}

function Leaderboard({ board, mine, onPick }: { board: Pet[]; mine: Set<string>; onPick: (key: string) => void }) {
  const top = [...board].filter((p) => p.hatched).sort((a, b) => powerScore(b) - powerScore(a)).slice(0, 8);
  if (top.length === 0) return null;
  return (
    <div className="panel board">
      <h2>Рейтинг</h2>
      <ol>
        {top.map((p, i) => {
          const me = mine.has(p.key);
          return (
            <li key={p.key} className={me ? "me" : ""}>
              <button onClick={() => me && onPick(p.key)} tabIndex={me ? 0 : -1}>
                <span className="place">{i + 1}</span>
                <PetSvg dna={p.dna} stage={3} satiety={80} mood={80} form={p.form} size={34} />
                <span className="b-name">
                  {p.name}
                  {me && <span className="muted small"> · ваш</span>}
                </span>
                <span className="b-score">{powerScore(p)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="muted small">Очки = редкость × 10 + уровень × 15 + привязанность + поколение × 20</p>
    </div>
  );
}

function Modal({ onClose, wide, label, children }: { onClose: () => void; wide?: boolean; label: string; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function NameModal({ title, text, cta, initial, onClose, onSubmit }: { title: string; text: string; cta: string; initial?: string; onClose: () => void; onSubmit: (n: string) => void }) {
  const [name, setName] = useState(initial ?? randomName());
  const clean = name.trim();
  const ok = nameOk(clean);
  return (
    <Modal onClose={onClose} label={title}>
      <h2>{title}</h2>
      <p className="muted">{text}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSubmit(clean);
        }}
      >
        <div className="name-row">
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={20} aria-label="Имя" />
          <button type="button" className="btn btn-ghost" onClick={() => setName(randomName())} title="Случайное имя">
            🎲
          </button>
        </div>
        <p className={`muted small ${ok ? "" : "err"}`}>{[...clean].length} / 20 символов</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn" disabled={!ok}>
            {cta}
          </button>
        </div>
      </form>
    </Modal>
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

function BreedModal({ pets, first, params, food, onClose, onSubmit }: { pets: Pet[]; first: Pet; params: Params; food: number; onClose: () => void; onSubmit: (a: Pet, b: Pet, name: string) => void }) {
  const [aKey, setAKey] = useState(first.key);
  const a = pets.find((p) => p.key === aKey) ?? pets[0];
  const others = pets.filter((p) => p.key !== a.key);
  const [bKey, setBKey] = useState(others[0]?.key ?? "");
  const b = others.find((p) => p.key === bKey) ?? others[0] ?? null;
  const [name, setName] = useState(randomName());
  const ta = traits(a.dna);
  const tb = b ? traits(b.dna) : null;
  const cost = b ? breedCost(params, a, b) : params.breedFoodCost;

  const problems: string[] = [];
  for (const p of b ? [a, b] : [a]) {
    if (p.satiety < MIN_SATIETY_TO_BREED) problems.push(`${p.name} голоден (нужно ≥ ${MIN_SATIETY_TO_BREED} сытости)`);
    if (p.mood < MIN_MOOD_TO_BREED) problems.push(`${p.name} грустит (нужно ≥ ${MIN_MOOD_TO_BREED} настроения)`);
    if (p.children >= MAX_CHILDREN) problems.push(`У ${p.name} уже ${MAX_CHILDREN} детей`);
    const w = breedWait(p, params);
    if (w > 0) problems.push(`${p.name} отдыхает ещё ${fmtDuration(w)}`);
  }
  if (b && related(a, b)) problems.push("Нельзя скрещивать родителя с его ребёнком");
  if (food < cost) problems.push(`Не хватает FOOD: нужно ${cost}, есть ${food}`);
  const okName = nameOk(name.trim());
  const bothShiny = !!tb && ta.shiny && tb.shiny;

  return (
    <Modal onClose={onClose} wide label="Скрещивание">
      <h2>🧬 Скрещивание</h2>
      <p className="muted">
        Каждый ген ребёнок берёт от случайного родителя, видимые гены с шансом 1 из 8 мутируют. Цена растёт с числом детей, а после скрещивания родители отдыхают всё дольше. Максимум {MAX_CHILDREN} детей.
      </p>
      <div className="breed-pair">
        <div className="parent">
          <PetSvg dna={a.dna} stage={3} satiety={a.satiety} mood={a.mood} form={a.form} size={130} />
          <select
            value={a.key}
            aria-label="Первый родитель"
            onChange={(e) => {
              setAKey(e.target.value);
              if (bKey === e.target.value) setBKey(pets.find((p) => p.key !== e.target.value)?.key ?? "");
            }}
          >
            {pets.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} · детей {p.children}
              </option>
            ))}
          </select>
        </div>
        <div className="heart">💞</div>
        <div className="parent">
          {b ? <PetSvg dna={b.dna} stage={3} satiety={b.satiety} mood={b.mood} form={b.form} size={130} /> : <div className="no-pet">?</div>}
          <select value={b?.key ?? ""} aria-label="Второй родитель" onChange={(e) => setBKey(e.target.value)}>
            {others.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} · детей {p.children}
              </option>
            ))}
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
          <div className="gene-row mut">+ шанс мутации · сияние ✦ {bothShiny ? "25% (оба родителя сияют!)" : "5%"}</div>
        </div>
      )}
      {problems.map((p) => (
        <p key={p} className="err small">
          {p}
        </p>
      ))}
      <div className="name-row">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Имя малыша" aria-label="Имя малыша" />
        <button className="btn btn-ghost" onClick={() => setName(randomName())}>
          🎲
        </button>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Отмена
        </button>
        <button className="btn btn-breed" disabled={!b || problems.length > 0 || !okName} onClick={() => b && onSubmit(a, b, name.trim())}>
          Скрестить · {cost} 🍖
        </button>
      </div>
    </Modal>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} wide label="Как играть">
      <h2>Как играть</h2>
      <ol className="help">
        <li>
          <b>Яйцо → малыш → подросток → взрослый.</b> Купите яйцо (NFT Token-2022), дождитесь вылупления. Гены выпадают в момент вылупления, поэтому «перебросить» редкого питомца нельзя.
        </li>
        <li>
          <b>Кормите и играйте.</b> Сытость и настроение падают со временем. Весёлый питомец получает больше опыта (множитель до ×1,5).
        </li>
        <li>
          <b>Серия заботы 🔥 и привязанность 💞.</b> Заходите каждый день: серия растёт и даёт бонус к опыту, привязанность копится. Пропуск дня обнуляет серию и снижает привязанность.
        </li>
        <li>
          <b>Облик взрослого</b> зависит от ухода: почти не голодал — «Сияющий», часто голодал — «Ворчливый».
        </li>
        <li>
          <b>Скрещивание.</b> Два взрослых дают яйцо со смесью генов, мутациями и шансом сияния. У каждого не больше 5 детей, цена и отдых растут.
        </li>
        <li>
          <b>Рейтинг</b> считает редкость генов, уровень, привязанность и поколение.
        </li>
      </ol>
      <div className="modal-actions">
        <button className="btn" onClick={onClose} autoFocus>
          Понятно
        </button>
      </div>
    </Modal>
  );
}
