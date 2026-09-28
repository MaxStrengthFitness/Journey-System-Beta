/**
 * THE PEEK (calm Hub round, Sep 28 2026): a tap on a Hub card.
 *
 * Hub question 1's default: a tap opens a peek, not the profile. It says
 * every mark in words with its proof (peek-model.ts) and holds Open profile
 * and Start session, so starting a session is still two taps (card, Start)
 * and nothing on the grid depends on a hover to be understood.
 *
 * Beside the card when the Hub is wide (an iPad on its side); centred when it
 * is narrow (upright), so it never covers the bottom bar. A tap outside, the
 * close button or Escape closes it, and the card gets its focus back.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { Activity, AlertTriangle, Award, Cake, FileSignature, Play, RefreshCw, Sparkles, Undo2, UserRound, X } from "lucide-react";
import type { MomentKind, RunSheetEntry } from "../hub-opportunities/moments-today";
import { peekContent } from "./peek-model";
import "./hub-card.css";
import "./peek.css";

const GLYPH: Record<MomentKind, ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>> = {
  critical: AlertTriangle,
  waiver: FileSignature,
  pulse: Activity,
  consult: Sparkles,
  "early-session": Sparkles,
  "first-with-trainer": Sparkles,
  back: Undo2,
  milestone: Award,
  birthday: Cake,
  renew: RefreshCw,
};

/** Wide enough to sit beside the card: an iPad on its side. */
export const PEEK_BESIDE_MIN_WIDTH = 1000;
const PANEL_W = 400;
const GAP = 12;
const EDGE = 16;

export interface PeekProps {
  entry: RunSheetEntry;
  /** The number of the booking tapped (a client booked twice has two). */
  sessionNumber: number | null;
  /** The tapped booking's own time, when it isn't her first of the day. */
  timeText?: string | null;
  /** The card that was tapped: the peek sits beside it, and gives it focus back. */
  anchor: HTMLElement | null;
  onClose: () => void;
  onOpenProfile: (clientId: string) => void;
  onStartSession: (clientId: string) => void;
}

type Place = { mode: "center" } | { mode: "beside"; top: number; left: number };

function besideCard(anchor: HTMLElement | null, height: number): Place {
  if (typeof window === "undefined" || !anchor || window.innerWidth < PEEK_BESIDE_MIN_WIDTH) return { mode: "center" };
  const r = anchor.getBoundingClientRect();
  const w = window.innerWidth;
  const h = window.innerHeight;
  let left = r.right + GAP;
  if (left + PANEL_W > w - EDGE) left = r.left - GAP - PANEL_W;
  if (left < EDGE) return { mode: "center" };
  const top = Math.max(EDGE, Math.min(r.top, h - height - EDGE));
  return { mode: "beside", top, left };
}

export function Peek({ entry, sessionNumber, timeText = null, anchor, onClose, onOpenProfile, onStartSession }: PeekProps) {
  const content = peekContent(timeText ? { ...entry, timeText } : entry, sessionNumber);
  const panel = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<Place>({ mode: "center" });

  // Measured before paint so it never jumps. Nothing here may throw: a throw
  // in a layout effect takes the whole screen down (KNOWN-TRAPS).
  useLayoutEffect(() => {
    try {
      setPlace(besideCard(anchor, panel.current?.offsetHeight ?? 0));
    } catch {
      setPlace({ mode: "center" });
    }
  }, [anchor, entry.key]);

  // The Hub hands a new onClose on every render; the listener reads the latest.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // The card that opened it gets its focus back.
      if (anchor && document.contains(anchor)) anchor.focus({ preventScroll: true });
    };
  }, [anchor]);

  const id = entry.clientId;
  return (
    <>
      <div className="hp-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        className="hp"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hp-name"
        tabIndex={-1}
        data-mode={place.mode}
        style={place.mode === "beside" ? { top: place.top, left: place.left } : undefined}
      >
        <div className="hp-head">
          <div>
            <h2 id="hp-name" className="hp-name">
              {content.name}
            </h2>
            <p className="hp-sub">{content.subtitle}</p>
          </div>
          <button type="button" className="hp-close" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>

        {content.critical && (
          <div className="hp-critical">
            <AlertTriangle size={16} strokeWidth={2.5} aria-hidden />
            <span>
              <strong>Read first:</strong> {content.critical}
            </span>
          </div>
        )}

        {content.lines.length > 0 && (
          <ul className="hp-lines">
            {content.lines.map((l) => {
              const I = GLYPH[l.kind];
              return (
                <li key={l.kind}>
                  <span className="hs-g" data-family={l.family} aria-hidden>
                    <I size={13} strokeWidth={2.4} aria-hidden />
                  </span>
                  <span>{l.text}</span>
                </li>
              );
            })}
          </ul>
        )}

        <ul className="hp-facts">
          {content.facts.map((f) => (
            <li key={f.label}>
              <span className="hp-fact-label">{f.label}</span>
              <span className="hp-fact-text" data-muted={f.muted ? "true" : "false"}>
                {f.text}
              </span>
            </li>
          ))}
        </ul>

        {content.notes.length > 0 && (
          <ul className="hp-notes">
            {content.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        {id && (
          <div className="hp-actions">
            <button type="button" className="hp-btn" onClick={() => onOpenProfile(id)}>
              <UserRound size={18} aria-hidden />
              {"Open profile"}
            </button>
            <button type="button" className="hp-btn" data-primary="true" onClick={() => onStartSession(id)}>
              <Play size={18} aria-hidden />
              {"Start session"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default Peek;
