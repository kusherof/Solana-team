// Маленький синтезатор звуков на WebAudio — без файлов.
let ctx: AudioContext | null = null;
let enabled = true;
export const setSound = (v: boolean) => (enabled = v);
export const soundOn = () => enabled;

function tone(freq: number, dur: number, type: OscillatorType = "sine", when = 0, vol = 0.12) {
  if (!enabled) return;
  try {
    ctx = ctx || new AudioContext();
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {
    /* звук не обязателен */
  }
}

export const sfx = {
  click: () => tone(660, 0.08, "triangle"),
  feed: () => {
    tone(320, 0.09, "square", 0, 0.06);
    tone(260, 0.09, "square", 0.1, 0.06);
  },
  play: () => [523, 659, 784].forEach((f, i) => tone(f, 0.14, "triangle", i * 0.08)),
  level: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "sine", i * 0.1, 0.14)),
  hatch: () => [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.25, "triangle", i * 0.07, 0.12)),
  error: () => tone(160, 0.25, "sawtooth", 0, 0.06),
  coin: () => {
    tone(988, 0.08, "square", 0, 0.05);
    tone(1319, 0.2, "square", 0.08, 0.05);
  },
};
