// Общая модель игры: одинаковая для демо-режима и для devnet.
// Формулы повторяют программу (programs/glimmo/src/state.rs, genes.rs).

export type Params = {
  eggPrice: number; // лампорты
  hatchSeconds: number;
  decaySeconds: number;
  foodPerClaim: number;
  foodCooldown: number;
  playCooldown: number;
  breedCooldown: number;
  breedFoodCost: number;
  xpPerLevel: number;
  teenLevel: number;
  adultLevel: number;
  carePeriod: number;
};

export type Pet = {
  key: string; // адрес PDA Pet
  mint: string; // NFT
  tokenAccount?: string; // где лежит NFT (devnet)
  id: number;
  name: string;
  dna: number[];
  dnaB: number[];
  generation: number;
  parentA: string | null;
  parentB: string | null;
  bornAt: number;
  hatchAt: number;
  hatched: boolean;
  level: number;
  xp: number;
  satiety: number;
  mood: number;
  lastTick: number;
  lastPlay: number;
  lastBreed: number;
  timesFed: number;
  timesPlayed: number;
  children: number;
  bond: number;
  streak: number;
  lastCarePeriod: number;
  careMistakes: number;
  form: number;
  owner?: string; // для рейтинга
};

export type GameState = {
  pets: Pet[];
  food: number;
  sol: number; // в SOL
  params: Params;
  lastFoodClaim: number; // 0 = ещё не брал
  totalPets: number;
  hasPlayer: boolean; // кормушка открыта только хозяевам питомцев
};

export type TxResult = { sig?: string; message?: string; newPetKey?: string };

export interface Backend {
  kind: "demo" | "chain";
  load(): Promise<GameState>;
  leaderboard(): Promise<Pet[]>;
  claimFood(): Promise<TxResult>;
  adopt(name: string): Promise<TxResult>;
  hatch(pet: Pet): Promise<TxResult>;
  feed(pet: Pet, amount: number): Promise<TxResult>;
  play(pet: Pet): Promise<TxResult>;
  rename(pet: Pet, name: string): Promise<TxResult>;
  breed(a: Pet, b: Pet, name: string): Promise<TxResult>;
}

export const SATIETY_PER_FOOD = 15;
export const MOOD_PER_FOOD = 4;
export const XP_PER_FOOD = 10;
export const PLAY_MOOD = 25;
export const PLAY_SATIETY_COST = 8;
export const PLAY_XP = 30;
export const MIN_SATIETY_TO_PLAY = 10;
export const MIN_SATIETY_TO_BREED = 30;
export const MIN_MOOD_TO_BREED = 30;
export const BREED_SATIETY_COST = 20;
export const BREED_MOOD_COST = 10;
export const MAX_CHILDREN = 5;
export const BOND_PER_NEW_DAY = 5;
export const BOND_DECAY_PER_MISSED = 3;
export const HATCH_SATIETY = 80;
export const HATCH_MOOD = 80;

export type Stage = 0 | 1 | 2 | 3; // яйцо, малыш, подросток, взрослый
export const STAGE_NAMES = ["Яйцо", "Малыш", "Подросток", "Взрослый"];
export const FORM_NAMES = ["", "Сияющий облик", "Обычный облик", "Ворчливый облик"];

/** Сдвиг часов блокчейна относительно браузера (сек), задаётся в режиме devnet. */
let clockOffset = 0;
export const setClockOffset = (s: number) => (clockOffset = s);
export const now = () => Math.floor(Date.now() / 1000) + clockOffset;

export function stageOf(p: Pet, params: Params): Stage {
  if (!p.hatched) return 0;
  if (p.level >= params.adultLevel) return 3;
  if (p.level >= params.teenLevel) return 2;
  return 1;
}

/** Состояние питомца «на сейчас» — с учётом проголодания (как apply_decay). */
export function withDecay(p: Pet, params: Params, t = now()): Pet {
  if (!p.hatched || t <= p.lastTick) return p;
  const ticks = Math.floor((t - p.lastTick) / params.decaySeconds);
  if (ticks <= 0) return p;
  const tt = Math.min(ticks, 255);
  const fed = Math.min(tt, p.satiety);
  const hungry = tt - fed;
  return {
    ...p,
    lastTick: p.lastTick + ticks * params.decaySeconds,
    satiety: p.satiety - fed,
    mood: Math.max(0, p.mood - Math.min(255, fed + hungry * 2)),
    careMistakes: hungry > 0 ? Math.min(255, p.careMistakes + 1) : p.careMistakes,
  };
}

/** Серия «дней заботы» и привязанность (как touch_care). */
export function touchCare(p: Pet, params: Params, t = now()): Pet {
  const q = { ...p };
  const period = Math.floor(t / params.carePeriod);
  if (q.lastCarePeriod === 0 || period > q.lastCarePeriod + 1) {
    if (q.lastCarePeriod !== 0) {
      const missed = Math.min(1000, period - q.lastCarePeriod - 1);
      q.bond = Math.max(0, q.bond - missed * BOND_DECAY_PER_MISSED);
    }
    q.streak = 1;
    q.bond += BOND_PER_NEW_DAY;
  } else if (period === q.lastCarePeriod + 1) {
    q.streak += 1;
    q.bond += BOND_PER_NEW_DAY + Math.floor(q.streak / 3);
  }
  q.lastCarePeriod = period;
  q.bond += 1;
  return q;
}

/** Множитель опыта в процентах: настроение и серия (как xp_multiplier). */
export const xpMultiplier = (p: Pet) =>
  Math.floor(((50 + p.mood) * (100 + Math.min(p.streak, 10) * 5)) / 150);

export function adultForm(p: Pet) {
  return p.careMistakes <= 1 ? 1 : p.careMistakes <= 4 ? 2 : 3;
}

export function addXp(p: Pet, baseXp: number, params: Params): { pet: Pet; ups: number[]; gained: number } {
  const gained = Math.floor((baseXp * xpMultiplier(p)) / 100);
  const before = stageOf(p, params);
  const q = { ...p, xp: p.xp + gained };
  const ups: number[] = [];
  while (q.level < 99) {
    const need = params.xpPerLevel * q.level;
    if (q.xp < need) break;
    q.xp -= need;
    q.level += 1;
    ups.push(q.level);
  }
  if (stageOf(q, params) === 3 && before !== 3 && q.form === 0) q.form = adultForm(q);
  return { pet: q, ups, gained };
}

export const xpNeed = (p: Pet, params: Params) => params.xpPerLevel * Math.max(1, p.level);

/** Сколько FOOD питомец реально съест (как food_eaten). */
export const foodEaten = (satiety: number, amount: number) =>
  Math.min(amount, Math.ceil((100 - Math.min(100, satiety)) / SATIETY_PER_FOOD));

export const breedCooldown = (params: Params, children: number) =>
  params.breedCooldown * 2 ** Math.min(children, 4);
export const breedCost = (params: Params, a: Pet, b: Pet) =>
  params.breedFoodCost * (1 + Math.max(a.children, b.children));
/** Сколько ждать до следующего скрещивания этого питомца. */
export const breedWait = (p: Pet, params: Params, t = now()) =>
  p.lastBreed ? Math.max(0, p.lastBreed + breedCooldown(params, Math.max(0, p.children - 1)) - t) : 0;
export const related = (a: Pet, b: Pet) =>
  a.parentA === b.key || a.parentB === b.key || b.parentA === a.key || b.parentB === a.key;

/** Имя: 1–20 символов без пробелов по краям и управляющих, ≤ 40 байт. */
export function nameOk(name: string): boolean {
  const chars = [...name].length;
  return (
    chars >= 1 &&
    chars <= 20 &&
    new TextEncoder().encode(name).length <= 40 &&
    name.trim() === name &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(name)
  );
}

// ---------- Гены → внешность ----------

export type Traits = {
  body: number; // 0..3
  hue: number;
  hue2: number;
  pattern: number; // 0..3
  eyes: number; // 0..3
  horns: number; // 0..3
  shiny: boolean;
  tail: number; // 0..2
  sat: number; // насыщенность
  wobble: number; // индивидуальная скорость «дыхания»
};

export const BODY_NAMES = ["Капля", "Облачко", "Бобик", "Звёздочка"];
export const PATTERN_NAMES = ["Гладкий", "Пятна", "Полоски", "Животик"];
export const EYE_NAMES = ["Круглые", "Сонные", "Звёзды", "Циклоп"];
export const HORN_NAMES = ["Нет", "Ушки", "Антенна", "Рожки"];
export const TAIL_NAMES = ["Нет", "Огонёк", "Хвостик"];

export function traits(dna: number[]): Traits {
  return {
    body: dna[0] % 4,
    hue: Math.round((dna[1] / 256) * 360),
    hue2: Math.round((dna[2] / 256) * 360),
    pattern: dna[3] % 4,
    eyes: dna[4] % 4,
    horns: dna[5] % 4,
    shiny: dna[6] < 13,
    tail: dna[7] % 3,
    sat: 70 + (dna[8] % 30),
    wobble: 2.6 + (dna[9] % 10) / 10,
  };
}

// Редкость: насколько редки черты. Взвешиваем самые «необычные» варианты.
const RARE = {
  body: [0, 1, 2, 6],
  pattern: [0, 2, 3, 4],
  eyes: [0, 2, 5, 8],
  horns: [0, 2, 4, 5],
  tail: [0, 3, 3],
};
export const RARITY_TIERS = [
  { min: 0, name: "Обычный", cls: "r-common" },
  { min: 12, name: "Редкий", cls: "r-rare" },
  { min: 20, name: "Эпический", cls: "r-epic" },
  { min: 30, name: "Мифический", cls: "r-myth" },
];
export function rarityScore(dna: number[]): number {
  const t = traits(dna);
  return RARE.body[t.body] + RARE.pattern[t.pattern] + RARE.eyes[t.eyes] + RARE.horns[t.horns] + RARE.tail[t.tail] + (t.shiny ? 15 : 0);
}
export const rarityTier = (score: number) => [...RARITY_TIERS].reverse().find((r) => score >= r.min)!;
/** Общий счёт для рейтинга: редкость + уровень + привязанность + поколение. */
export const powerScore = (p: Pet) => rarityScore(p.dna) * 10 + p.level * 15 + p.bond + p.generation * 20;

/** Как mix_dna в программе: второй хеш решает мутации, сияние бросается заново. */
export function mixDna(a: number[], b: number[], rnd: number[], r2: number[]): { dna: number[]; mutations: number } {
  const child: number[] = [];
  let mutations = 0;
  for (let i = 0; i < 32; i++) {
    const fromA = ((rnd[i >> 3] >> (i % 8)) & 1) === 1;
    child[i] = fromA ? a[i] : b[i];
    if (i < 8 && i !== 6 && r2[i] % 8 === 0) {
      child[i] = r2[i + 8];
      mutations++;
    }
  }
  const chance = a[6] < 13 && b[6] < 13 ? 64 : 13;
  const roll = r2[31];
  child[6] = roll < chance ? roll % 13 : 13 + (roll % 242);
  return { dna: child, mutations };
}

export const randomBytes = (n = 32) => Array.from(crypto.getRandomValues(new Uint8Array(n)));

/** Пока яйцо не вылупилось, цвет скорлупы — от адреса mint (ДНК ещё нет). */
export function eggDna(p: Pet): number[] {
  if (p.dna.some((x) => x !== 0)) return p.dna;
  const out: number[] = [];
  for (let i = 0; i < 32; i++) out.push(p.mint.charCodeAt(i % p.mint.length) * (i + 7) % 256);
  return out;
}

export function fmtDuration(s: number): string {
  if (s <= 0) return "готово";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} д ${h} ч`;
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m}:${String(sec).padStart(2, "0")}`;
  return `${sec} с`;
}

export function moodWord(p: Pet): string {
  if (!p.hatched) return "Спит в скорлупе";
  if (p.satiety === 0) return "Очень голоден!";
  if (p.satiety < 25) return "Хочет есть";
  if (p.mood < 25) return "Грустит";
  if (p.mood > 80 && p.satiety > 60) return "Сияет от счастья";
  return "Спокоен";
}
