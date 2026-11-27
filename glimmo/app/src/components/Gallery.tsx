// Витрина: 24 случайных ДНК — показывает, насколько разными бывают Глиммы.
import { useState } from "react";
import PetSvg from "./PetSvg";
import { BODY_NAMES, randomBytes, traits } from "../game/model";

export default function Gallery() {
  const [seed, setSeed] = useState(0);
  const dnas = Array.from({ length: 24 }, () => randomBytes(32));
  return (
    <div className="app">
      <header className="topbar">
        <div className="logo"><span className="logo-mark">◉</span>GLIMMO<small>каждая ДНК — свой питомец</small></div>
        <div className="chips">
          <button className="btn btn-ghost" onClick={() => setSeed(seed + 1)}>🎲 Ещё</button>
          <a className="btn" href="./">В игру</a>
        </div>
      </header>
      <div className="gallery">
        {dnas.map((d, i) => (
          <div key={`${seed}-${i}`} className="panel gallery-item">
            <PetSvg dna={d} stage={i % 6 === 5 ? 2 : 3} size={150} />
            <span className="muted small">{BODY_NAMES[traits(d).body]}{traits(d).shiny ? " ✦" : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
