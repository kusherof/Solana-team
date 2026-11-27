// Общая модель игры: одинаковая для демо-режима и для devnet.
// Формулы повторяют программу (programs/glimmo/src/state.rs).

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
};

export type Pet = {
  key: string; // адрес PDA Pet
  mint: string; // NFT
  id: number;
  name: string;
  dna: number[];
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
};

export type GameState = {
  pets: Pet[];
  food: number;
  sol: number; // в SOL
  params: Params;
  lastFoodClaim: number; // 0 = ещё не брал
  totalPets: number;
};

export type TxResult = { sig?: string; message?: string; newPetKey?: string };

export interface Backend {
  kind: "demo" | "chain";
  load(): Promise<GameState>;
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

export type Stage = 0 | 1 | 2 | 3; // яйцо, малыш, подросток, взрослый
export const STAGE_NAMES = ["Яйцо", "Малыш", "Подросток", "Взрослый"];

export const now = () => Math.floor(Date.now() / 1000);

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
  };
}

export function addXp(p: Pet, xp: number, params: Params): { pet: Pet; ups: number[] } {
  const q = { ...p, xp: p.xp + xp };
  const ups: number[] = [];
  while (q.level < 99) {
    const need = params.xpPerLevel * q.level;
    if (q.xp < need) break;
    q.xp -= need;
    q.level += 1;
    ups.push(q.level);
  }
  return { pet: q, ups };
}

export const xpNeed = (p: Pet, params: Params) => params.xpPerLevel * Math.max(1, p.level);

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

/** Похоже на mix_dna в программе (для демо-режима). */
export function mixDna(a: number[], b: number[], rnd: number[]): { dna: number[]; mutations: number } {
  const child: number[] = [];
  let mutations = 0;
  for (let i = 0; i < 32; i++) {
    const fromA = ((rnd[i >> 3] >> (i % 8)) & 1) === 1;
    child[i] = fromA ? a[i] : b[i];
    if (i < 8 && rnd[16 + (i % 16)] % 8 === 0) {
      child[i] = rnd[(i * 7 + 3) % 32];
      mutations++;
    }
  }
  return { dna: child, mutations };
}

export const randomBytes = (n = 32) => Array.from(crypto.getRandomValues(new Uint8Array(n)));

export function fmtDuration(s: number): string {
  if (s <= 0) return "готово";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
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
