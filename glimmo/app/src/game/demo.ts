// Демо-режим: та же логика, что в программе, но в браузере (localStorage).
// Таймеры ускорены, чтобы за пару минут пройти весь цикл: яйцо → взрослый → потомство.
import {
  Backend,
  GameState,
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
  mixDna,
  now,
  randomBytes,
  stageOf,
  withDecay,
} from "./model";

const KEY = "glimmo-demo-v1";

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
};

type Saved = Omit<GameState, "params">;

function fakeKey(): string {
  const abc = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return Array.from(randomBytes(32), (b) => abc[b % abc.length]).join("").slice(0, 44);
}

function starterPets(): Pet[] {
  // Два готовых питомца, чтобы сразу было с кем играть и кого скрещивать
  const t = now();
  const mk = (id: number, name: string, dna: number[], level: number): Pet => ({
    key: fakeKey(),
    mint: fakeKey(),
    id,
    name,
    dna,
    generation: 0,
    parentA: null,
    parentB: null,
    bornAt: t - 3600,
    hatchAt: t - 3000,
    hatched: true,
    level,
    xp: 0,
    satiety: 70,
    mood: 75,
    lastTick: t,
    lastPlay: 0,
    lastBreed: 0,
    timesFed: 3,
    timesPlayed: 4,
    children: 0,
  });
  return [
    mk(0, "Искра", [12, 190, 40, 1, 0, 2, 140, 1, ...randomBytes(24)], 5),
    mk(1, "Луна", [1, 20, 300 % 256, 2, 2, 1, 90, 2, ...randomBytes(24)], 4),
  ];
}

export class DemoBackend implements Backend {
  kind = "demo" as const;
  private s: Saved;

  constructor() {
    let saved: Saved | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      /* пусто */
    }
    this.s = saved ?? { pets: starterPets(), food: 12, sol: 2, lastFoodClaim: 0, totalPets: 2 };
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
    // имитируем задержку сети
    await new Promise((r) => setTimeout(r, 350 + Math.random() * 300));
    return "demo-" + Math.random().toString(36).slice(2, 10);
  }

  private upd(pet: Pet, f: (p: Pet) => Pet) {
    this.s.pets = this.s.pets.map((p) => (p.key === pet.key ? f(p) : p));
    this.save();
  }

  private fresh(pet: Pet): Pet {
    const p = this.s.pets.find((x) => x.key === pet.key);
    if (!p) throw new Error("Питомец не найден");
    return withDecay(p, DEMO_PARAMS);
  }

  async load(): Promise<GameState> {
    return { ...structuredClone(this.s), params: DEMO_PARAMS };
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

  private newEgg(name: string, dna: number[], generation: number, parents: [string, string] | null): Pet {
    const t = now();
    const p: Pet = {
      key: fakeKey(),
      mint: fakeKey(),
      id: this.s.totalPets++,
      name,
      dna,
      generation,
      parentA: parents?.[0] ?? null,
      parentB: parents?.[1] ?? null,
      bornAt: t,
      hatchAt: t + DEMO_PARAMS.hatchSeconds,
      hatched: false,
      level: 0,
      xp: 0,
      satiety: 0,
      mood: 0,
      lastTick: t,
      lastPlay: 0,
      lastBreed: 0,
      timesFed: 0,
      timesPlayed: 0,
      children: 0,
    };
    this.s.pets.push(p);
    return p;
  }

  async adopt(name: string): Promise<TxResult> {
    const price = DEMO_PARAMS.eggPrice / 1e9;
    if (this.s.sol < price) throw new Error("Недостаточно SOL");
    const sig = await this.tx();
    this.s.sol = +(this.s.sol - price - 0.004).toFixed(4);
    const p = this.newEgg(name, randomBytes(32), 0, null);
    this.save();
    return { sig, newPetKey: p.key, message: "Яйцо уже греется!" };
  }

  async hatch(pet: Pet): Promise<TxResult> {
    const p = this.fresh(pet);
    if (p.hatched) throw new Error("Питомец уже вылупился");
    if (now() < p.hatchAt) throw new Error("Яйцо ещё не готово");
    const sig = await this.tx();
    this.upd(pet, (x) => ({ ...x, hatched: true, level: 1, satiety: 80, mood: 80, lastTick: now() }));
    return { sig };
  }

  async feed(pet: Pet, amount: number): Promise<TxResult> {
    let p = this.fresh(pet);
    if (!p.hatched) throw new Error("Это ещё яйцо");
    if (p.satiety >= 100) throw new Error("Питомец сыт");
    if (this.s.food < amount) throw new Error("Не хватает FOOD — загляните в кормушку");
    const sig = await this.tx();
    this.s.food -= amount;
    p = {
      ...p,
      satiety: Math.min(100, p.satiety + amount * SATIETY_PER_FOOD),
      mood: Math.min(100, p.mood + amount * MOOD_PER_FOOD),
      timesFed: p.timesFed + 1,
    };
    const r = addXp(p, XP_PER_FOOD * amount, DEMO_PARAMS);
    this.upd(pet, () => r.pet);
    return { sig };
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
    const r = addXp(p, PLAY_XP, DEMO_PARAMS);
    this.upd(pet, () => r.pet);
    return { sig };
  }

  async rename(pet: Pet, name: string): Promise<TxResult> {
    const sig = await this.tx();
    this.upd(pet, (x) => ({ ...x, name }));
    return { sig };
  }

  async breed(a: Pet, b: Pet, name: string): Promise<TxResult> {
    const pa = this.fresh(a);
    const pb = this.fresh(b);
    if (pa.key === pb.key) throw new Error("Нельзя скрестить питомца с самим собой");
    const t = now();
    for (const p of [pa, pb]) {
      if (stageOf(p, DEMO_PARAMS) !== 3) throw new Error("Для скрещивания нужны два взрослых питомца");
      if (p.satiety < MIN_SATIETY_TO_BREED) throw new Error(`${p.name} слишком голоден`);
      if (p.lastBreed && t - p.lastBreed < DEMO_PARAMS.breedCooldown)
        throw new Error(`${p.name} ещё отдыхает после скрещивания`);
    }
    if (this.s.food < DEMO_PARAMS.breedFoodCost) throw new Error("Не хватает FOOD");
    const sig = await this.tx();
    this.s.food -= DEMO_PARAMS.breedFoodCost;
    const { dna, mutations } = mixDna(pa.dna, pb.dna, randomBytes(32));
    this.upd(pa, (x) => ({ ...pa, lastBreed: t, children: x.children + 1 }));
    this.upd(pb, (x) => ({ ...pb, lastBreed: t, children: x.children + 1 }));
    const child = this.newEgg(name, dna, Math.max(pa.generation, pb.generation) + 1, [pa.key, pb.key]);
    this.save();
    return {
      sig,
      newPetKey: child.key,
      message: mutations ? `Мутаций: ${mutations}!` : "Гены от обоих родителей",
    };
  }
}
