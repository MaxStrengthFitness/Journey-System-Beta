import React, { useEffect, useRef, useState } from "react";

/**
 * The Wrap-up's confetti: a short burst as the screen opens, a little over a
 * second, then quiet. AJ kept it (Sep 27 2026, asked in the Sep 21 audit and
 * again in the voice review: "I like it keep it"). It never blocks a tap
 * (pointer-events: none) and never repeats. Its colours are tokens, so it
 * shows on the light theme's pale page as well as the dark one.
 *
 * Drawn by CSS (the iPad round, Oct 6 2026; wrap-up.css): each bit is one
 * @keyframes on transform and opacity, which the compositor runs, and the
 * whole layer is unmounted once the last bit has finished, so nothing stays
 * on the page at opacity 0. It used to be 36 motion components animated in
 * JavaScript every frame while the Wrap-up mounted. A touch screen gets 24
 * bits rather than 36: the same burst, less to draw on an iPad.
 */

export const CONFETTI_BITS = 36;
export const CONFETTI_BITS_TOUCH = 24;
/** The burst's longest bit: 1.3 s plus at most 0.15 s of delay. The layer is
 *  taken away after this even if no animationend arrives (reduced motion,
 *  a hidden tab), with a little room. */
export const CONFETTI_GONE_AFTER_MS = 1_700;

const TONES = ["bg-cta", "bg-cyan", "bg-(--eq-ok)", "bg-(--jg-q-star)", "bg-(--eq-live)"];

interface Bit {
  id: number;
  x: number;
  y: number;
  tone: string;
  size: number;
  delay: number;
}

function coarsePointer(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

export function makeBits(count: number, random: () => number = Math.random): Bit[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.round((random() - 0.5) * 360),
    y: Math.round((random() - 0.6) * 300 - 40),
    tone: TONES[i % TONES.length],
    size: Math.round((random() * 7 + 4) * 10) / 10,
    delay: Math.round(random() * 150) / 1000,
  }));
}

export function WrapUpConfetti() {
  const [bits] = useState(() => makeBits(coarsePointer() ? CONFETTI_BITS_TOUCH : CONFETTI_BITS));
  const [done, setDone] = useState(false);
  const ended = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDone(true), CONFETTI_GONE_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  if (done) return null;
  return (
    <div
      className="wu-confetti"
      aria-hidden="true"
      onAnimationEnd={() => {
        ended.current += 1;
        if (ended.current >= bits.length) setDone(true);
      }}
    >
      {bits.map((b) => (
        <span
          key={b.id}
          className={`wu-confetti__bit ${b.tone}`}
          style={
            {
              width: b.size,
              height: b.size,
              "--wu-x": `${b.x}px`,
              "--wu-y": `${b.y}px`,
              "--wu-delay": `${b.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
