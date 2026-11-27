// Демо-режим: та же логика, что в программе, но в браузере (localStorage).
// Таймеры ускорены, чтобы за пару минут пройти весь цикл: яйцо → взрослый → потомство.
// «День заботы» здесь длится минуту, чтобы серия была видна сразу.
import {
  Backend,
  BREED_MOOD_COST,
  BREED_SATIETY_COST,
  GameState,
  HATCH_MOOD,
  HATCH_SATIETY,
  MAX_CHILDREN,
  MIN_MOOD_TO_BREED,
  MIN_SATIETY_TO_BREED,
  MIN_SATIETY_TO_PLAY,
  MOOD_PER_FOOD,
  Params,
  Pet,
  PLAY_MOOD,
  PLAY_SATIETY_COST,
  PLAY_XP,
  SATIETY_PER_FOOD,
  TxResult,
  XP_PER_FOOD,
  addXp,
  breedCost,
  breedWait,
  foodEaten,
  mixDna,
  nameOk,
  now,
  randomBytes,
  related,
  stageOf,
  touchCare,
  withDecay,
} from "./model";

const KEY = "glimmo-demo-v2";

export const DEMO_PARAMS: Params = {
  eggPrice: 50_000_000,
  hatchSeconds: 12,
  decaySeconds: 6,
  foodPerClaim: 10,
  foodCooldown: 20,
  playCooldown: 3,
  breedCooldown: 30,
  breedFoodCost: 3,
  xpPerLevel: 15,
  teenLevel: 3,
  adultLevel: 5,
  carePeriod: 60,
};

type Saved = Omit<GameState, "params">;

function fakeKey(): string {
  const abc = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return Array.from(randomBytes(44), (b) => abc[b % abc.length]).join("");
}

function basePet(id: number, name: string, dna: number[], t: number): Pet {
  return {
    key: fakeKey(),
    mint: fakeKey(),
    id,
    name,
    dna,
    dnaB: Array(32).fill(0),
    generation: 0,
    parentA: null,
    parentB: null,
    bornAt: t - 3600,
    hatchAt: t - 3000,
    hatched: true,
    level: 1,
    xp: 0,
    satiety: 70,
    mood: 75,
    lastTick: t,
    lastPlay: 0,
    lastBreed: 0,
    timesFed: 3,
    timesPlayed: 4,
    children: 0,
    bond: 12,
    streak: 2,
    lastCarePeriod: Math.floor(t / DEMO_PARAMS.carePeriod) - 1,
    careMistakes: 0,
    form: 0,
  };
}

function starterPets(): Pet[] {
  // Два готовых питомца: Искра уже взрослая, Луне одно действие до эволюции
  const t = now();
  const a = basePet(0, "Искра", [12, 190, 40, 1, 0, 2, 140, 1, ...randomBytes(24)], t);
  a.level = 5;
  a.form = 1;
  const b = basePet(1, "Луна", [1, 20, 44, 2, 2, 1, 90, 2, ...randomBytes(24)], t);
  b.level = 4;
  b.xp = 45;
  return [a, b];
}

// Соседи по рейтингу (в devnet рейтинг собирается из настоящих аккаунтов)
const NPC_NAMES = ["Пушок", "Комета", "Зефир", "Нова", "Блинчик", "Квазар", "Ириска", "Тень"];
function npcPets(): Pet[] {
  const t = now();
  return NPC_NAMES.map((n, i) => {
    const p = basePet(100 + i, n, randomBytes(32), t);
    p.level = 2 + ((i * 7) % 9);
    p.bond = 5 + i * 9;
    p.generation = i % 3;
    p.owner = fakeKey();
    return p;
  });
}

export class DemoBackend implements Backend {
  kind = "demo" as const;
  private s: Saved & { npcs?: Pet[] };

  constructor() {
    let saved: any = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      /* пусто */
    }
    this.s = saved ?? { pets: starterPets(), food: 12, sol: 2, lastFoodClaim: 0, totalPets: 2, hasPlayer: true, npcs: npcPets() };
  }

  static reset() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* пусто */
    }
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      /* пусто */
    }
  }

  private async tx(): Promise<string> {
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 250));
    return "demo-" + Math.random().toString(36).slice(2, 10);
  }

  private put(p: Pet) {
    this.s.pets = this.s.pets.map((x) => (x.key === p.key ? p : x));
    this.save();
  }

  private fresh(pet: Pet): Pet {
    const p = this.s.pets.find((x) => x.key === pet.key);
    if (!p) throw new Error("Питомец не найден");
    return withDecay(p, DEMO_PARAMS);
  }

  async load(): Promise<GameState> {
    const { npcs, ...rest } = structuredClone(this.s);
    return { ...rest, params: DEMO_PARAMS };
  }

  async leaderboard(): Promise<Pet[]> {
    const mine = this.s.pets.filter((p) => p.hatched).map((p) => ({ ...p, owner: "you" }));
    return [...mine, ...(this.s.npcs ?? [])];
  }

  async claimFood(): Promise<TxResult> {
    const t = now();
    if (this.s.lastFoodClaim && t - this.s.lastFoodClaim < DEMO_PARAMS.foodCooldown)
      throw new Error("Кормушка ещё пуста, приходите позже");
    const sig = await this.tx();
    this.s.food += DEMO_PARAMS.foodPerClaim;
    this.s.lastFoodClaim = t;
    this.save();
    return { sig, message: `+${DEMO_PARAMS.foodPerClaim} FOOD` };
  }

  private newEgg(name: string, parents: [Pet, Pet] | null): Pet {
    const t = now();
    const p = basePet(this.s.totalPets++, name, Array(32).fill(0), t);
    Object.assign(p, {
      dna: parents ? [...parents[0].dna] : Array(32).fill(0),
      dnaB: parents ? [...parents[1].dna] : Array(32).fill(0),
      generation: parents ? Math.max(parents[0].generation, parents[1].generation) + 1 : 0,
      parentA: parents?.[0].key ?? null,
      parentB: parents?.[1].key ?? null,
      bornAt: t,
      hatchAt: t + DEMO_PARAMS.hatchSeconds,
      hatched: false,
      level: 0,
      satiety: 0,
      mood: 0,
      timesFed: 0,
      timesPlayed: 0,
      bond: 0,
      streak: 0,
      lastCarePeriod: 0,
    });
    this.s.pets.push(p);
    return p;
  }

  async adopt(name: string): Promise<TxResult> {
    if (!nameOk(name)) throw new Error("Имя: от 1 до 20 символов, без пробелов по краям");
    const price = DEMO_PARAMS.eggPrice / 1e9;
    if (this.s.sol < price) throw new Error("Недостаточно SOL");
    const sig = await this.tx();
    this.s.sol = +(this.s.sol - price - 0.004).toFixed(4);
    const p = this.newEgg(name, null);
    this.save();
    return { sig, newPetKey: p.key, message: "Яйцо уже греется!" };
  }

  async hatch(pet: Pet): Promise<TxResult> {
    const p = this.fresh(pet);
    if (p.hatched) throw new Error("Питомец уже вылупился");
    if (now() < p.hatchAt) throw new Error("Яйцо ещё не готово");
    const sig = await this.tx();
    let dna = randomBytes(32);
    let mutations = 0;
    if (p.generation > 0) ({ dna, mutations } = mixDna(p.dna, p.dnaB, randomBytes(32), randomBytes(32)));
    this.put({ ...p, dna, dnaB: Array(32).fill(0), hatched: true, level: 1, satiety: HATCH_SATIETY, mood: HATCH_MOOD, lastTick: now() });
    return { sig, message: mutations ? `Мутаций: ${mutations}!` : undefined };
  }

  async feed(pet: Pet, amount: number): Promise<TxResult> {
    let p = this.fresh(pet);
    if (!p.hatched) throw new Error("Это ещё яйцо");
    if (p.satiety >= 100) throw new Error("Питомец сыт");
    const eaten = foodEaten(p.satiety, amount);
    if (this.s.food < eaten) throw new Error("Не хватает FOOD — загляните в кормушку");
    const sig = await this.tx();
    this.s.food -= eaten;
    p = {
      ...p,
      satiety: Math.min(100, p.satiety + eaten * SATIETY_PER_FOOD),
      mood: Math.min(100, p.mood + eaten * MOOD_PER_FOOD),
      timesFed: p.timesFed + 1,
    };
    p = touchCare(p, DEMO_PARAMS);
    const r = addXp(p, XP_PER_FOOD * eaten, DEMO_PARAMS);
    this.put(r.pet);
    return { sig, message: `+${eaten * SATIETY_PER_FOOD} сытости · +${r.gained} опыта` };
  }

  async play(pet: Pet): Promise<TxResult> {
    let p = this.fresh(pet);
    if (!p.hatched) throw new Error("Это ещё яйцо");
    if (p.satiety < MIN_SATIETY_TO_PLAY) throw new Error("Питомец слишком голоден");
    if (p.lastPlay && now() - p.lastPlay < DEMO_PARAMS.playCooldown) throw new Error("Питомец устал, подождите");
    const sig = await this.tx();
    p = {
      ...p,
      lastPlay: now(),
      satiety: p.satiety - PLAY_SATIETY_COST,
      mood: Math.min(100, p.mood + PLAY_MOOD),
      timesPlayed: p.timesPlayed + 1,
    };
    p = touchCare(p, DEMO_PARAMS);
    const r = addXp(p, PLAY_XP, DEMO_PARAMS);
    this.put(r.pet);
    return { sig, message: `+${r.gained} опыта` };
  }

  async rename(pet: Pet, name: string): Promise<TxResult> {
    if (!nameOk(name)) throw new Error("Имя: от 1 до 20 символов, без пробелов по краям");
    const sig = await this.tx();
    this.put({ ...this.fresh(pet), name });
    return { sig };
  }

  async breed(a: Pet, b: Pet, name: string): Promise<TxResult> {
    if (!nameOk(name)) throw new Error("Имя: от 1 до 20 символов, без пробелов по краям");
    const pa = this.fresh(a);
    const pb = this.fresh(b);
    if (pa.key === pb.key) throw new Error("Нельзя скрестить питомца с самим собой");
    if (related(pa, pb)) throw new Error("Нельзя скрещивать родителя с его ребёнком");
    for (const p of [pa, pb]) {
      if (stageOf(p, DEMO_PARAMS) !== 3) throw new Error("Для скрещивания нужны два взрослых питомца");
      if (p.children >= MAX_CHILDREN) throw new Error(`У ${p.name} уже максимум детей`);
      if (p.satiety < MIN_SATIETY_TO_BREED) throw new Error(`${p.name} слишком голоден`);
      if (p.mood < MIN_MOOD_TO_BREED) throw new Error(`${p.name} грустит, сначала поиграйте`);
      if (breedWait(p, DEMO_PARAMS) > 0) throw new Error(`${p.name} ещё отдыхает после скрещивания`);
    }
    const cost = breedCost(DEMO_PARAMS, pa, pb);
    if (this.s.food < cost) throw new Error(`Нужно ${cost} FOOD`);
    const sig = await this.tx();
    this.s.food -= cost;
    const t = now();
    const tired = (p: Pet): Pet => ({
      ...p,
      lastBreed: t,
      children: p.children + 1,
      satiety: Math.max(0, p.satiety - BREED_SATIETY_COST),
      mood: Math.max(0, p.mood - BREED_MOOD_COST),
    });
    this.put(tired(pa));
    this.put(tired(pb));
    const child = this.newEgg(name, [pa, pb]);
    this.save();
    return { sig, newPetKey: child.key, message: `−${cost} FOOD, гены смешаются при вылуплении` };
  }
}
