// Процедурный рисунок питомца из его ДНК.
// Форма, цвета, узор, глаза, рожки, хвост и «сияние» берутся из генов,
// размер и детали — из стадии, выражение лица — из сытости и настроения.
import { useId } from "react";
import { Traits, traits } from "../game/model";

const BODIES = [
  // Капля
  "M100 44 C128 70 160 98 158 130 C156 160 130 178 100 178 C70 178 44 160 42 130 C40 98 72 70 100 44 Z",
  // Облачко
  "M100 54 C140 54 162 82 162 120 C162 156 136 178 100 178 C64 178 38 156 38 120 C38 82 60 54 100 54 Z",
  // Бобик
  "M100 72 C150 68 172 98 170 132 C168 162 140 177 100 177 C60 177 32 162 30 132 C28 98 50 76 100 72 Z",
  // Звёздочка (привидение с волнистым низом)
  "M100 50 C138 50 158 80 158 118 L158 170 C150 160 142 160 134 170 C126 160 118 160 110 170 C102 160 94 160 86 170 C78 160 70 160 62 170 C54 160 48 162 42 170 L42 118 C42 80 62 50 100 50 Z",
];
// Верхняя точка тела (для рожек) и уровень глаз для каждой формы
const TOP = [48, 56, 74, 52];
const EYE_Y = [118, 116, 122, 114];

const STAGE_SCALE = [1, 0.68, 0.84, 1];

export type PetLook = {
  dna: number[];
  stage: number; // 0 яйцо … 3 взрослый
  satiety?: number;
  mood?: number;
  eggProgress?: number; // 0..1 для яйца
};

function hsl(h: number, s: number, l: number, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

function Egg({ t, progress, uid }: { t: Traits; progress: number; uid: string }) {
  const ready = progress >= 1;
  const shell = "M100 38 C136 38 160 96 160 128 C160 162 133 182 100 182 C67 182 40 162 40 128 C40 96 64 38 100 38 Z";
  return (
    <g className={`egg ${ready ? "egg-ready" : progress > 0.6 ? "egg-soon" : ""}`}>
      <defs>
        <radialGradient id={`eg-${uid}`} cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor={hsl(t.hue, 60, 96)} />
          <stop offset="60%" stopColor={hsl(t.hue, 45, 80)} />
          <stop offset="100%" stopColor={hsl(t.hue, 40, 52)} />
        </radialGradient>
        <clipPath id={`ec-${uid}`}>
          <path d={shell} />
        </clipPath>
      </defs>
      <ellipse cx="100" cy="110" rx="78" ry="86" fill={hsl(t.hue, 90, 60, ready ? 0.5 : 0.22)} filter={`url(#glow-${uid})`} className="egg-aura" />
      <path d={shell} fill={`url(#eg-${uid})`} />
      <g clipPath={`url(#ec-${uid})`} opacity="0.85">
        <circle cx="78" cy="90" r="11" fill={hsl(t.hue2, 70, 62)} />
        <circle cx="124" cy="112" r="15" fill={hsl(t.hue2, 70, 62)} />
        <circle cx="86" cy="148" r="9" fill={hsl(t.hue, 70, 60)} />
        <circle cx="130" cy="160" r="7" fill={hsl(t.hue2, 70, 62)} />
        <path d="M40 128 Q70 118 100 128 T160 126 L160 140 Q130 132 100 142 T40 140 Z" fill={hsl(t.hue, 80, 70, 0.55)} />
      </g>
      {progress > 0.45 && (
        <path d="M96 60 L104 76 L94 88 L106 100" stroke={hsl(t.hue, 30, 25)} strokeWidth="2.5" fill="none" strokeLinecap="round" className="crack" />
      )}
      {progress > 0.8 && (
        <path d="M60 120 L74 126 L70 138 L84 142 M140 112 L128 122 L136 132" stroke={hsl(t.hue, 30, 25)} strokeWidth="2.5" fill="none" strokeLinecap="round" className="crack" />
      )}
      <ellipse cx="78" cy="70" rx="12" ry="20" fill="white" opacity="0.45" transform="rotate(-20 78 70)" />
    </g>
  );
}

function Eyes({ t, cx, y, sleepy, sad, uid }: { t: Traits; cx: number; y: number; sleepy: boolean; sad: boolean; uid: string }) {
  const pupil = "#120a2a";
  const star = (x: number, yy: number, r: number) =>
    `M${x} ${yy - r} L${x + r * 0.3} ${yy - r * 0.3} L${x + r} ${yy} L${x + r * 0.3} ${yy + r * 0.3} L${x} ${yy + r} L${x - r * 0.3} ${yy + r * 0.3} L${x - r} ${yy} L${x - r * 0.3} ${yy - r * 0.3} Z`;
  const one = (x: number, r: number) => (
    <g key={x}>
      <ellipse cx={x} cy={y} rx={r} ry={r * 1.1} fill="white" />
      {t.eyes === 2 ? (
        <path d={star(x, y + 1, r * 0.7)} fill={hsl(t.hue2, 95, 55)} filter={`url(#softglow-${uid})`} />
      ) : (
        <circle cx={x + 1} cy={y + 2} r={r * 0.58} fill={pupil} />
      )}
      <circle cx={x - r * 0.3} cy={y - r * 0.35} r={r * 0.24} fill="white" />
      <circle cx={x + r * 0.35} cy={y + r * 0.35} r={r * 0.1} fill="white" opacity="0.8" />
    </g>
  );
  const lid = sleepy || t.eyes === 1;
  return (
    <g className="eyes" style={{ transformOrigin: `100px ${y}px` }}>
      {t.eyes === 3 ? one(cx, 19) : [one(cx - 21, 12.5), one(cx + 21, 12.5)]}
      {lid && (
        <g fill={hsl(t.hue, t.sat, 50)}>
          {t.eyes === 3 ? (
            <rect x={cx - 22} y={y - 24} width="44" height="22" rx="8" />
          ) : (
            <>
              <rect x={cx - 36} y={y - 16} width="30" height="13" rx="6" />
              <rect x={cx + 6} y={y - 16} width="30" height="13" rx="6" />
            </>
          )}
        </g>
      )}
      {sad && !lid && (
        <g stroke="#120a2a" strokeWidth="3" strokeLinecap="round">
          <line x1={cx - 32} y1={y - 18} x2={cx - 14} y2={y - 22} />
          <line x1={cx + 32} y1={y - 18} x2={cx + 14} y2={y - 22} />
        </g>
      )}
    </g>
  );
}

export default function PetSvg({ dna, stage, satiety = 80, mood = 80, eggProgress = 0, size = 220 }: PetLook & { size?: number }) {
  const uid = useId().replace(/:/g, "");
  const t = traits(dna);
  const body = BODIES[t.body];
  const top = TOP[t.body];
  const eyeY = EYE_Y[t.body];
  const scale = STAGE_SCALE[stage];
  const happy = mood > 60 && satiety > 40;
  const sad = mood < 25 || satiety < 15;
  const sleepy = satiety < 25 && !sad;
  const main = hsl(t.hue, t.sat, 58);
  const dark = hsl(t.hue, t.sat, 34);
  const accent = hsl(t.hue2, 90, 62);
  const mouthY = eyeY + 26;

  const filters = (
    <defs>
      <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="14" />
      </filter>
      <filter id={`softglow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <radialGradient id={`bg-${uid}`} cx="36%" cy="28%" r="80%">
        <stop offset="0%" stopColor={hsl(t.hue, t.sat, 82)} />
        <stop offset="45%" stopColor={main} />
        <stop offset="100%" stopColor={dark} />
      </radialGradient>
      <linearGradient id={`shiny-${uid}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ff7af5" />
        <stop offset="33%" stopColor="#7af0ff" />
        <stop offset="66%" stopColor="#ffe97a" />
        <stop offset="100%" stopColor="#9d7aff" />
      </linearGradient>
      <clipPath id={`clip-${uid}`}>
        <path d={body} />
      </clipPath>
    </defs>
  );

  if (stage === 0) {
    return (
      <svg viewBox="0 0 200 200" width={size} height={size} className="pet-svg">
        {filters}
        <ellipse cx="100" cy="188" rx="50" ry="7" fill="black" opacity="0.35" className="shadow" />
        <Egg t={t} progress={eggProgress} uid={uid} />
      </svg>
    );
  }

  // Пятна — по бокам и снизу, чтобы не закрывать лицо
  const spots = [10, 11, 12, 13, 14, 15].map((i, k) => {
    const left = k % 2 === 0;
    const y = top + 30 + ((dna[i + 6] ?? 0) % 100);
    const below = y > eyeY + 44;
    const x = below ? 70 + (dna[i] % 60) : left ? 46 + (dna[i] % 18) : 136 + (dna[i] % 18);
    return { x, y, r: 5 + (k % 3) * 3 };
  });

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={`pet-svg ${sad ? "is-sad" : ""} ${t.shiny ? "is-shiny" : ""}`}>
      {filters}
      <ellipse cx="100" cy="188" rx={52 * scale} ry="7" fill="black" opacity="0.35" className="shadow" />
      <g className="float">
        <g className="breathe" style={{ animationDuration: `${t.wobble}s`, transformOrigin: "100px 180px" }}>
          <g transform={`translate(${100 - 100 * scale} ${180 - 180 * scale}) scale(${scale})`}>
            {/* аура */}
            <ellipse cx="100" cy="122" rx="70" ry="64" fill={t.shiny ? `url(#shiny-${uid})` : main} opacity={stage === 3 ? 0.55 : 0.32} filter={`url(#glow-${uid})`} className="aura" />

            {/* хвост (взрослые) */}
            {stage === 3 && t.tail === 1 && (
              <g className="flame" style={{ transformOrigin: "150px 160px" }}>
                <path d="M146 164 C182 160 190 124 170 100 C172 122 162 130 156 124 C162 142 152 150 144 148 Z" fill={accent} filter={`url(#softglow-${uid})`} />
                <path d="M150 160 C172 154 176 134 168 120 C166 136 158 142 152 140 C156 150 150 154 148 154 Z" fill="white" opacity="0.55" />
              </g>
            )}
            {stage === 3 && t.tail === 2 && (
              <path d="M150 158 C178 160 182 132 166 128 C154 126 156 142 166 140" stroke={dark} strokeWidth="9" fill="none" strokeLinecap="round" className="tail" style={{ transformOrigin: "150px 158px" }} />
            )}

            {/* рожки/ушки (подростки и взрослые) */}
            {stage >= 2 && t.horns === 1 && (
              <g fill={dark}>
                <path d={`M64 ${top + 34} L58 ${top - 6} L92 ${top + 16} Z`} />
                <path d={`M136 ${top + 34} L142 ${top - 6} L108 ${top + 16} Z`} />
                <path d={`M66 ${top + 26} L63 ${top + 4} L82 ${top + 18} Z`} fill={accent} opacity="0.7" />
                <path d={`M134 ${top + 26} L137 ${top + 4} L118 ${top + 18} Z`} fill={accent} opacity="0.7" />
              </g>
            )}
            {stage >= 2 && t.horns === 2 && (
              <g className="antenna" style={{ transformOrigin: `100px ${top + 6}px` }}>
                <path d={`M100 ${top + 6} Q96 ${top - 18} 108 ${top - 30}`} stroke={dark} strokeWidth="4" fill="none" strokeLinecap="round" />
                <circle cx="108" cy={top - 32} r="8" fill={accent} filter={`url(#softglow-${uid})`} className="orb" />
              </g>
            )}
            {stage >= 2 && t.horns === 3 && (
              <g fill={accent} filter={`url(#softglow-${uid})`}>
                <path d={`M76 ${top + 18} C66 ${top + 2} 70 ${top - 14} 80 ${top - 18} C78 ${top - 4} 84 ${top + 6} 90 ${top + 10} Z`} />
                <path d={`M124 ${top + 18} C134 ${top + 2} 130 ${top - 14} 120 ${top - 18} C122 ${top - 4} 116 ${top + 6} 110 ${top + 10} Z`} />
              </g>
            )}

            {/* ножки */}
            <ellipse cx="78" cy="176" rx="14" ry="7" fill={dark} />
            <ellipse cx="122" cy="176" rx="14" ry="7" fill={dark} />

            {/* тело */}
            <path d={body} fill={`url(#bg-${uid})`} />
            <g clipPath={`url(#clip-${uid})`}>
              {t.pattern === 1 && spots.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={accent} opacity="0.55" />)}
              {t.pattern === 2 && (
                <g fill={accent} opacity="0.45">
                  <path d="M20 92 Q100 80 180 92 L180 100 Q100 88 20 100 Z" />
                  <path d="M20 132 Q100 120 180 132 L180 141 Q100 129 20 141 Z" />
                  <path d="M20 160 Q100 150 180 160 L180 168 Q100 158 20 168 Z" />
                </g>
              )}
              {t.pattern === 3 && <ellipse cx="100" cy="164" rx="44" ry="30" fill={hsl(t.hue, 70, 86)} opacity="0.75" />}
              {/* блик */}
              <ellipse cx="74" cy={top + 30} rx="16" ry="10" fill="white" opacity="0.35" transform={`rotate(-25 74 ${top + 30})`} />
            </g>
            {stage === 3 && <path d={body} fill="none" stroke={t.shiny ? `url(#shiny-${uid})` : accent} strokeWidth="2.5" opacity="0.8" />}

            {/* лицо */}
            <Eyes t={t} cx={100} y={eyeY} sleepy={sleepy} sad={sad} uid={uid} />
            {happy && (
              <g fill="#ff7ab8" opacity="0.55">
                <ellipse cx="66" cy={mouthY - 4} rx="9" ry="5" />
                <ellipse cx="134" cy={mouthY - 4} rx="9" ry="5" />
              </g>
            )}
            {happy ? (
              <path d={`M86 ${mouthY - 4} Q100 ${mouthY + 12} 114 ${mouthY - 4}`} stroke="#120a2a" strokeWidth="4" fill={hsl(340, 80, 60)} strokeLinecap="round" strokeLinejoin="round" />
            ) : sad ? (
              <path d={`M88 ${mouthY + 4} Q100 ${mouthY - 6} 112 ${mouthY + 4}`} stroke="#120a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
            ) : (
              <path d={`M90 ${mouthY} Q100 ${mouthY + 5} 110 ${mouthY}`} stroke="#120a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
            )}
            {sad && <path d={`M${t.eyes === 3 ? 118 : 128} ${eyeY + 10} q4 8 0 12 q-4 -4 0 -12 Z`} fill="#7ad7ff" className="tear" />}
          </g>
        </g>
      </g>
      {t.shiny && (
        <g className="sparkles" fill="white">
          <path d="M40 60 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 Z" />
          <path d="M160 50 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 Z" />
          <path d="M168 140 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" />
        </g>
      )}
    </svg>
  );
}
