/**
 * The front door's pieces: the pane every screen sits in, the three squares,
 * the "who is signed in" chip, and the provider marks. See README.md.
 */
import type { ReactNode } from "react";
import "./front-door.css";

/**
 * The scroll pane. These screens return before the app's shell exists, so the
 * pane is its own scroller (`touch-pane`, index.css) and pays the top inset
 * itself; html and body never scroll (the Sep 5 scroll-trap lesson).
 */
export function FrontDoorPane({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="touch-pane border-t-safe overflow-y-auto overscroll-contain fd" aria-label={label}>
      {children}
    </div>
  );
}

const GLYPHS = {
  m: "M140 284V139l72.5 145L285 139v145",
  a: "M140 284l72.5-145L285 284",
  x: "M140 139l145 145m0-145l-145 145",
} as const;

function Glyph({ k }: { k: keyof typeof GLYPHS }) {
  return (
    <svg viewBox="0 0 425 425" fill="none" stroke="#fff" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={GLYPHS[k]} />
    </svg>
  );
}

export type TilesMode = "still" | "assemble" | "steps" | "open";

/**
 * The logo's three squares, M A X. They are the front door's motion: they
 * assemble on the sign-in screen, light one by one as the three check steps
 * (`step` = how many are done), and part like doors into the studio.
 */
export function Tiles({ mode = "still", step = 0, small = false }: { mode?: TilesMode; step?: number; small?: boolean }) {
  const keys = ["m", "a", "x"] as const;
  return (
    <div
      className={`fd-tiles fd-tiles--${mode}${small ? " fd-tiles--sm" : ""}`}
      role="img"
      aria-label="Max Strength Fitness"
    >
      {keys.map((k, i) => (
        <div
          key={k}
          className={`fd-tile-sq fd-tile-sq--${k}${mode === "steps" ? (i < step ? " is-done" : i === step ? " is-now" : "") : ""}`}
        >
          <Glyph k={k} />
        </div>
      ))}
    </div>
  );
}

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toUpperCase();
}

/**
 * Who is signed in on this iPad, with the way out beside it. iPads change
 * hands at the start of the day (AJ, Oct 3 2026: "sometimes trainers pick up
 * the wrong ipad"), so after sign-in every front-door screen says whose it is.
 */
export function WhoChip({ name, photoUrl, onSignOut }: { name: string; photoUrl?: string | null; onSignOut: () => void }) {
  const first = name.trim().split(/\s+/)[0] || name;
  return (
    <button type="button" className="fd-chip fd-chip--who" onClick={onSignOut} aria-label={`Signed in as ${name}. Not you? Sign out.`}>
      <span className="fd-avatar" aria-hidden="true">
        {photoUrl ? <img src={photoUrl} alt="" referrerPolicy="no-referrer" /> : initialsOf(name)}
      </span>
      <span>
        <b>{first}</b> <span className="fd-chip__muted">· Not you? Sign out</span>
      </span>
    </button>
  );
}

export const GoogleMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

export const MicrosoftMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#F25022" d="M1 1h10.4v10.4H1z" />
    <path fill="#7FBA00" d="M12.6 1H23v10.4H12.6z" />
    <path fill="#00A4EF" d="M1 12.6h10.4V23H1z" />
    <path fill="#FFB900" d="M12.6 12.6H23V23H12.6z" />
  </svg>
);

export const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const WarnIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </svg>
);

/** True when the iPad asks for less motion: the door opens at once. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** "Good morning" by the studio's clock hour. */
export function greetingFor(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
