import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Building2, Check, ChevronDown, ChevronUp, Crosshair, Plus, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { PHASE_LABEL, gapSentence, minutesToClock, type NowContext } from "../relay/board/now-context";
import { trackedChipWords, type TrackedItem } from "../relay/board/tracked";
import type { MyStudioSection } from "./section-memory";
import "./my-studio.css";

/**
 * THE ONE HEADER — My Studio's masthead, Relay's tabs and the Now Bar, in one
 * bar (Relay room, Sep 28 2026; the redesign's phase 1, AJ's pick).
 *
 * Until now three bars stacked under the app header before any work: My
 * Studio's masthead (the five sections), Relay's own tabs, and the Now Bar.
 * On an upright iPad that was about a quarter of the screen (the blueprint's
 * pin 2). Now there is one:
 *
 *   the section    "My Studio · RELAY ▾" — the five sections live in its
 *                  menu (Relay · Openings · Machines · Team · Studio, each
 *                  only for who may open it). A tap, never a hover.
 *   Relay's tabs   only while Relay is the section.
 *   the time       the shift, how long until your next session and who it
 *                  is; a tap unfolds the day strip under the bar (the Now
 *                  Bar's middle did this). Relay only.
 *   Tracking       the one job you took, on every Relay tab, until it is done
 *                  (relay/board/tracked.ts). Relay only.
 *   + Ask          asking the team.
 *   +              something just for you (a to-do, a reminder, a note), and
 *                  for a studio's leader a studio task or a team job.
 *
 * On a landscape iPad it is one row; upright, two (the time and Tracking
 * take the second). The studio and the day, which the old masthead carried
 * on the right, show on the other sections, where there is room.
 *
 * The section label keeps the old tab's id (`ms-tab-{section}`), so each
 * section's panel is still labelled by it.
 */

export interface HeaderSection {
  id: MyStudioSection;
  label: string;
  icon: LucideIcon;
  /** A word under the name in the menu ("leaders"), when the section is not everyone's. */
  note?: string;
}

export interface HeaderTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

export interface HeaderMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** A second line, in the menu only. */
  hint?: string;
  onSelect: () => void;
}

export interface StudioHeaderProps<T extends string> {
  sections: HeaderSection[];
  shown: MyStudioSection;
  onChooseSection: (id: MyStudioSection) => void;
  relayTabs: HeaderTab<T>[];
  relayTab: T;
  onRelayTab: (id: T) => void;
  now: NowContext;
  dayOpen: boolean;
  onToggleDay: () => void;
  studioName: string;
  todayLabel: string;
  tracked: TrackedItem | null;
  /** "Show it": the tracked job on the Board. */
  onShowTracked: () => void;
  onStopTracking: () => void;
  onAsk: () => void;
  plusItems: HeaderMenuItem[];
}

/** "Next: Barliman Butterbur at 2:40 PM", "Now: … until 3:00 PM", or what the day holds. */
export function nextLine(now: NowContext): string {
  if (now.current) return `Now: ${now.current.clientName} until ${minutesToClock(now.current.endMin)}`;
  if (now.next) return `Next: ${now.next.clientName} at ${minutesToClock(now.next.startMin)}`;
  if (now.total) return `${now.done} of ${now.total} sessions done`;
  return "No sessions on your schedule";
}

/** A small popover: open, closed by a tap outside it or Escape, focus back on its button. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    // The first item takes the focus, so a keyboard can walk the menu.
    wrap.current?.querySelector<HTMLElement>('[role^="menuitem"], .msh__pop-act')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, wrap, button };
}

/**
 * A menu (the sections, the + menu) holds only its items; the Tracking
 * popover says something as well as offering two buttons, so it is a small
 * dialog rather than a menu.
 */
function Popover({
  id,
  label,
  role = "menu",
  children,
}: {
  id: string;
  label: string;
  role?: "menu" | "dialog";
  children: ReactNode;
}) {
  return (
    <div className="msh__pop" role={role} id={id} aria-label={label}>
      {children}
    </div>
  );
}

export function StudioHeader<T extends string>({
  sections,
  shown,
  onChooseSection,
  relayTabs,
  relayTab,
  onRelayTab,
  now,
  dayOpen,
  onToggleDay,
  studioName,
  todayLabel,
  tracked,
  onShowTracked,
  onStopTracking,
  onAsk,
  plusItems,
}: StudioHeaderProps<T>) {
  const sectionMenu = usePopover();
  const plusMenu = usePopover();
  const trackMenu = usePopover();
  const ids = useId();
  const current = sections.find((s) => s.id === shown) ?? sections[0];
  const onRelay = shown === "relay";

  return (
    <header className={cn("msh", onRelay && "msh--relay")}>
      <div className="msh__sect-wrap" ref={sectionMenu.wrap}>
        <button
          type="button"
          ref={sectionMenu.button}
          className="msh__sect"
          aria-haspopup="menu"
          aria-expanded={sectionMenu.open}
          aria-controls={sectionMenu.open ? `${ids}-sections` : undefined}
          aria-label={`My Studio: ${current?.label ?? ""}. Choose a section`}
          onClick={() => sectionMenu.setOpen((v) => !v)}
        >
          <span className="msh__kicker">
            <Building2 size={13} aria-hidden />
            My Studio
          </span>
          <span className="msh__sect-name">
            <span id={`ms-tab-${shown}`}>{current?.label}</span>
            <ChevronDown size={16} aria-hidden />
          </span>
        </button>
        {sectionMenu.open && (
          <Popover id={`${ids}-sections`} label="My Studio sections">
            {sections.map(({ id, label, icon: Icon, note }) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={id === shown}
                className="msh__pop-item"
                onClick={() => {
                  sectionMenu.setOpen(false);
                  if (id !== shown) onChooseSection(id);
                }}
              >
                <Icon size={17} aria-hidden />
                <span className="msh__pop-text">
                  {label}
                  {note && <span className="msh__pop-hint">{note}</span>}
                </span>
                {id === shown && <Check size={16} className="msh__pop-tick" aria-hidden />}
              </button>
            ))}
          </Popover>
        )}
      </div>

      {onRelay && (
        <div className="msh__tabs" role="tablist" aria-label="Relay">
          {relayTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`pl-tab-${id}`}
              aria-selected={relayTab === id}
              aria-controls="pl-panel"
              className="msh__tab"
              onClick={() => relayTab !== id && onRelayTab(id)}
            >
              <Icon size={16} aria-hidden />
              <span className="msh__tab-label">{label}</span>
            </button>
          ))}
        </div>
      )}

      {onRelay ? (
        <button
          type="button"
          className="msh__now"
          aria-expanded={dayOpen}
          aria-controls="relay-daystrip"
          onClick={onToggleDay}
        >
          <span className="msh__now-a">
            <span className={cn("msh__phase", `msh__phase--${now.phase}`)}>
              <span className="msh__phase-dot" aria-hidden />
              {PHASE_LABEL[now.phase]}
            </span>
            <span className="msh__gap">{gapSentence(now)}</span>
          </span>
          <span className="msh__now-b">{nextLine(now)}</span>
          <span className="msh__now-chev" aria-hidden>
            {dayOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>
      ) : (
        <span className="msh__where">
          {studioName} · {todayLabel}
        </span>
      )}

      {onRelay && (
        <div className="msh__track-wrap" ref={trackMenu.wrap}>
          <button
            type="button"
            ref={trackMenu.button}
            className={cn("msh__track", tracked && "msh__track--on")}
            aria-haspopup="menu"
            aria-expanded={trackMenu.open}
            aria-controls={trackMenu.open ? `${ids}-track` : undefined}
            onClick={() => trackMenu.setOpen((v) => !v)}
          >
            <Crosshair size={16} aria-hidden />
            <span className="msh__track-text">{trackedChipWords(tracked)}</span>
          </button>
          {trackMenu.open && (
            <Popover id={`${ids}-track`} label="Tracking" role="dialog">
              {tracked ? (
                <>
                  <p className="msh__pop-head">{tracked.title}</p>
                  <button
                    type="button"
                    className="msh__pop-item msh__pop-act"
                    onClick={() => {
                      trackMenu.setOpen(false);
                      onShowTracked();
                    }}
                  >
                    <Crosshair size={17} aria-hidden />
                    <span className="msh__pop-text">Show it on the Board</span>
                  </button>
                  <button
                    type="button"
                    className="msh__pop-item msh__pop-act"
                    onClick={() => {
                      trackMenu.setOpen(false);
                      onStopTracking();
                    }}
                  >
                    <span className="msh__pop-text">
                      Stop tracking
                      <span className="msh__pop-hint">Your name stays on the job until you hand it back there.</span>
                    </span>
                  </button>
                </>
              ) : (
                <p className="msh__pop-note">
                  Nothing yet. Take a job on the Board and it rides along here, on every tab, until it's done.
                </p>
              )}
            </Popover>
          )}
        </div>
      )}

      <button type="button" className="msh__ask" onClick={onAsk}>
        <Plus size={16} aria-hidden />
        Ask
      </button>

      <div className="msh__plus-wrap" ref={plusMenu.wrap}>
        <button
          type="button"
          ref={plusMenu.button}
          className="msh__plus"
          aria-label="Add something just for you"
          aria-haspopup="menu"
          aria-expanded={plusMenu.open}
          aria-controls={plusMenu.open ? `${ids}-plus` : undefined}
          onClick={() => plusMenu.setOpen((v) => !v)}
        >
          <Plus size={20} aria-hidden />
        </button>
        {plusMenu.open && (
          <Popover id={`${ids}-plus`} label="Add something just for you">
            <p className="msh__pop-head" role="none">
              Just for you
            </p>
            {plusItems.map(({ id, label, icon: Icon, hint, onSelect }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                className="msh__pop-item"
                onClick={() => {
                  plusMenu.setOpen(false);
                  onSelect();
                }}
              >
                <Icon size={17} aria-hidden />
                <span className="msh__pop-text">
                  {label}
                  {hint && <span className="msh__pop-hint">{hint}</span>}
                </span>
              </button>
            ))}
            <p className="msh__pop-note" role="none">
              Ask is for asking the team.
            </p>
          </Popover>
        )}
      </div>
    </header>
  );
}
