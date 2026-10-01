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
import { Activity, AlertTriangle, Award, Cake, FileSignature, History, MessageCircle, Pencil, Play, RefreshCw, Sparkles, Undo2, UserRound, X } from "lucide-react";
import type { MomentKind, RunSheetEntry } from "../hub-opportunities/moments-today";
import { peekContent, peekState, type PeekState } from "./peek-model";
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
  "ask-about": MessageCircle,
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
  /** What the card may leave out when space is short ("New to Journey", a service), said here in full. */
  extras?: ReadonlyArray<string>;
  /** The card that was tapped: the peek sits beside it, and gives it focus back. */
  anchor: HTMLElement | null;
  onClose: () => void;
  onOpenProfile: (clientId: string) => void;
  /** Start session, and Open session / Resume (the Active Session decides by its own rules). */
  onStartSession: (clientId: string) => void;
  /**
   * What happened to the booking and the main button that follows it (hub
   * fixes, Oct 1 2026; peek-model's peekState). Absent: Start session, as
   * before.
   */
  state?: PeekState | null;
  /** Edit session: the day's logged session in the Activity Archive's own pop-up. */
  onEditSession?: (clientId: string) => void;
  /** Log past session: her Activity Archive, where the form is. */
  onLogPast?: (clientId: string) => void;
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

export function Peek({ entry, sessionNumber, timeText = null, extras, anchor, onClose, onOpenProfile, onStartSession, state = null, onEditSession, onLogPast }: PeekProps) {
  const view = state ?? peekState(null);
  const primary = view.primary;
  const runPrimary = (id: string) => {
    if (!primary) return;
    if (primary.kind === "edit") onEditSession?.(id);
    else if (primary.kind === "log-past") onLogPast?.(id);
    else onStartSession(id);
  };
  // A button only where its door exists here.
  const primaryShown =
    !!primary && (primary.kind === "edit" ? !!onEditSession : primary.kind === "log-past" ? !!onLogPast : true);
  const content = peekContent(timeText ? { ...entry, timeText } : entry, sessionNumber, { extras });
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
            {/* What happened to the booking (hub fixes, Oct 1 2026): the card's own state, in words. */}
            {view.words && (
              <p className="hp-state" data-state={state ? "said" : undefined}>
                {view.words}
              </p>
            )}
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

        {/* All stars (wave 2 hub): the nightly marks' word, with its proof. */}
        {content.star && <p className="hp-star">{content.star}</p>}

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
            {primaryShown && primary && (
              <button type="button" className="hp-btn" data-primary="true" onClick={() => runPrimary(id)}>
                {primary.kind === "edit" ? <Pencil size={18} aria-hidden /> : primary.kind === "log-past" ? <History size={18} aria-hidden /> : <Play size={18} aria-hidden />}
                {primary.label}
              </button>
            )}
          </div>
        )}
        {id && primaryShown && view.note && <p className="hp-action-note">{view.note}</p>}
      </div>
    </>
  );
}

export default Peek;
