import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Building2, Check, ChevronDown, Plus, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import type { MyStudioSection } from "./section-memory";
import "./my-studio.css";

/**
 * THE ONE HEADER — My Studio's masthead and Relay's tabs, in one bar (Relay
 * room, Sep 28 2026), made calm in the Relay Board rebuild (Oct 3 2026).
 *
 * AJ, Oct 3 2026, on the bar above the Board: "lets clean the top header up
 * theres just a a lot going on up here its hard to not just skim read
 * everything". He picked "Tabs are the header": one row, and the Board's
 * parts of the day joined under it (the sub-bar MyStudioView draws, which
 * the Board fills).
 *
 *   the section    "My Studio · RELAY ▾" — the five sections live in its
 *                  menu (Relay · Openings · Machines · Team · Studio, each
 *                  only for who may open it). A tap, never a hover.
 *   Relay's tabs   Board · Tracker · Journal, only while Relay is the section.
 *   the day        "Sat, Oct 3".
 *   what's new     "● 2 new": Since you were in, drawn into its slot by the
 *                  Board, which holds what it reads.
 *   Ask            asking the team.
 *   +              something just for you (a to-do, a reminder, a note), and
 *                  for a studio's leader a studio task or a team job.
 *
 * The time button (the shift, the minutes free, the day strip) and the
 * Tracking chip went (AJ, Oct 3 2026: "Drop both"): a job you took says
 * "You're on it" on its own card, and "I need cover" is a tile in Ask.
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
  studioName: string;
  todayLabel: string;
  /** Where the Board draws "● 2 new" (Since you were in): a slot in the bar, Relay only. */
  newsSlot?: (el: HTMLSpanElement | null) => void;
  onAsk: () => void;
  plusItems: HeaderMenuItem[];
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
  studioName,
  todayLabel,
  newsSlot,
  onAsk,
  plusItems,
}: StudioHeaderProps<T>) {
  const sectionMenu = usePopover();
  const plusMenu = usePopover();
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
        <>
          <span className="msh__day">{todayLabel}</span>
          <span className="msh__news" ref={newsSlot} />
        </>
      ) : (
        <span className="msh__where">
          {studioName} · {todayLabel}
        </span>
      )}

      <button type="button" className="msh__ask" onClick={onAsk}>
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
