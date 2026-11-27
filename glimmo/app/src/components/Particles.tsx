import { forwardRef, useImperativeHandle, useState } from "react";

type P = { id: number; x: number; y: number; dx: number; dy: number; rot: number; ch: string; size: number; delay: number; color?: string };
export type ParticlesHandle = { burst: (kind: Kind) => void };
export type Kind = "hearts" | "crumbs" | "stars" | "confetti" | "zzz";

const SETS: Record<Kind, { ch: string[]; n: number }> = {
  hearts: { ch: ["💜", "💖", "✨", "💗"], n: 10 },
  crumbs: { ch: ["🍖", "•", "•", "✦"], n: 12 },
  stars: { ch: ["⭐", "✦", "✨", "🌟"], n: 18 },
  confetti: { ch: ["▮", "●", "▲", "✦"], n: 34 },
  zzz: { ch: ["z", "Z"], n: 4 },
};
const COLORS = ["#ff7af5", "#7af0ff", "#ffe97a", "#9d7aff", "#7aff9d"];

let nextId = 1;

const Particles = forwardRef<ParticlesHandle>(function Particles(_, ref) {
  const [ps, setPs] = useState<P[]>([]);
  useImperativeHandle(ref, () => ({
    burst(kind) {
      const s = SETS[kind];
      const born: P[] = Array.from({ length: s.n }, (_, i) => {
        const a = kind === "confetti" ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
        const sp = kind === "confetti" ? 120 + Math.random() * 160 : 70 + Math.random() * 110;
        return {
          id: nextId++,
          x: 50 + (Math.random() - 0.5) * 24,
          y: kind === "crumbs" ? 58 : 50,
          dx: Math.cos(a) * sp,
          dy: Math.sin(a) * sp,
          rot: (Math.random() - 0.5) * 720,
          ch: s.ch[i % s.ch.length],
          size: kind === "confetti" ? 10 + Math.random() * 8 : 16 + Math.random() * 14,
          delay: Math.random() * 0.15,
          color: kind === "confetti" || kind === "crumbs" ? COLORS[i % COLORS.length] : undefined,
        };
      });
      setPs((old) => [...old, ...born]);
      const ids = new Set(born.map((b) => b.id));
      setTimeout(() => setPs((old) => old.filter((p) => !ids.has(p.id))), 1800);
    },
  }));
  return (
    <div className="particles" aria-hidden>
      {ps.map((p) => (
        <span
          key={p.id}
          className="particle"
          style={
            {
              left: `${p.x}%`,
              top: `${p.y}%`,
              fontSize: p.size,
              color: p.color,
              animationDelay: `${p.delay}s`,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rot}deg`,
            } as any
          }
        >
          {p.ch}
        </span>
      ))}
    </div>
  );
});
export default Particles;
