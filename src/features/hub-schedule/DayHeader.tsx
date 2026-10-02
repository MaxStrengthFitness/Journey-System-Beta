/**
 * THE HUB'S TOP (calm Hub round, Sep 28 2026).
 *
 * AJ on the Blueprints page (Sep 27): the top bar "is very jumbled". The old
 * strip put two tiles that weren't doors, the date, seven day buttons with no
 * counts and the layer switch in one line. Now:
 *
 *   DayHeader   the layers, the week (each day's count, a dot for a day with
 *               something to celebrate, Mindbody's Keep), Today when you are
 *               elsewhere, and two small doors: Tasks (Relay) and the Key.
 *   DaySummary  Schedule only: the day in words ("Monday, Sep 28 · 57
 *               sessions · 5 trainers") and the Opportunities list's own
 *               chips (six since Get to know, wave 2 hub; a zero is never
 *               drawn). A chip lights its cards on the grid (the spotlight);
 *               the bar then says what it shows, steps to the next card, and
 *               opens the same group as a list. At its end, for someone with
 *               a column that day, Focus: Me | Everyone (hub cherry round) —
 *               on the same line, so the top keeps its two rows.
 *   KeySheet    every mark and state in words, on both layers.
 *
 * Presentational; the pure half is day-summary.ts.
 */
import type { ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  Award,
  Cake,
  ChevronRight,
  Eye,
  FileSignature,
  KeyRound,
  ListChecks,
  MessageCircle,
  PartyPopper,
  RefreshCw,
  Sparkles,
  Undo2,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LayerSwitch, type HubLayer } from "../hub-opportunities/LayerSwitch";
import type { MomentFamily } from "../hub-opportunities/moments-today";
import type { StripDay, SummaryChip } from "./day-summary";
import type { HubFocus } from "./focus";
import type { DayReadState } from "../../lib/schedule-window";
import "./hub-card.css";
import "./day-header.css";

type Icon = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;

const FAMILY_ICON: Record<MomentFamily, Icon> = {
  "read-first": AlertTriangle,
  watch: Eye,
  welcome: Sparkles,
  celebrate: PartyPopper,
  renew: RefreshCw,
  "get-to-know": MessageCircle,
};

function FamilyIcon({ family }: { family: MomentFamily }) {
  const I = FAMILY_ICON[family];
  return (
    <span className="hd-fam" data-family={family} aria-hidden>
      <I size={16} strokeWidth={2.4} aria-hidden />
    </span>
  );
}

export interface DayHeaderProps {
  layer: HubLayer;
  onLayer: (next: HubLayer) => void;
  days: ReadonlyArray<StripDay>;
  /** The day on screen. */
  selected: string;
  onSelectDay: (dayKey: string) => void;
  /** Open tasks for the day, or null while they load (never a grey 0). */
  openTasks: number | null;
  /** Relay, where the day's tasks are. Absent: no door. */
  onOpenTasks?: () => void;
  onOpenKey: () => void;
}

export function DayHeader({ layer, onLayer, days, selected, onSelectDay, openTasks, onOpenTasks, onOpenKey }: DayHeaderProps) {
  const today = days.find((d) => d.isToday);
  return (
    <div className="hd">
      <LayerSwitch value={layer} onChange={onLayer} />
      <div className="hd-week" role="tablist" aria-label="Pick a day">
        {days.map((d) => (
          <button
            key={d.key}
            type="button"
            role="tab"
            className="hd-day"
            aria-selected={d.key === selected}
            data-today={d.isToday ? "true" : "false"}
            aria-label={[`${d.weekday} ${d.date}`, d.isToday ? "today" : null, d.count ? `${d.count} booked` : "nothing booked", d.celebrate ? "something to celebrate" : null]
              .filter(Boolean)
              .join(", ")}
            onClick={() => onSelectDay(d.key)}
          >
            <span className="hd-day-name">
              {`${d.weekday} `}
              <strong>{d.date}</strong>
            </span>
            <span className="hd-day-count">
              {d.count ?? ""}
              {d.celebrate && <span className="hd-dot" />}
            </span>
          </button>
        ))}
      </div>
      <div className="hd-tools">
        {today && today.key !== selected && (
          <button type="button" className="hd-btn" onClick={() => onSelectDay(today.key)}>
            Today
          </button>
        )}
        {onOpenTasks && (
          <button type="button" className="hd-btn" onClick={onOpenTasks} aria-label={openTasks ? `Tasks: ${openTasks} open. Opens Relay` : "Tasks. Opens Relay"}>
            <ListChecks size={16} aria-hidden />
            <span className="hd-btn-word">{"Tasks"}</span>
            {openTasks ? <strong>{openTasks}</strong> : null}
          </button>
        )}
        <button type="button" className="hd-btn" onClick={onOpenKey} aria-label="Key: what the marks mean">
          <KeyRound size={16} aria-hidden />
          <span className="hd-btn-word">{"Key"}</span>
        </button>
      </div>
    </div>
  );
}

export interface DaySummaryProps {
  /** "Monday, Sep 28". */
  title: string;
  sessions: number;
  trainers: number;
  chips: ReadonlyArray<SummaryChip>;
  /** The family lit on the grid, or null. */
  spot: MomentFamily | null;
  /** What the spotlight shows, in words (spotWords). */
  spotText: string;
  onSpot: (family: MomentFamily | null) => void;
  /** Scroll to the next lit card. */
  onNext: () => void;
  /** The same group on the Opportunities list. */
  onAsList: () => void;
  /**
   * Me / Everyone (hub cherry round, Hub direction B): your own column in
   * words, or every column alike. Offered only to someone with a column on
   * the day; absent, no switch.
   */
  focus?: { value: HubFocus; onChange: (next: HubFocus) => void } | null;
  /**
   * Whether the day's bookings were read (hub fixes, Oct 1 2026): "nothing
   * booked" only when they were. Absent: read.
   */
  bookings?: DayReadState;
}

function FocusSwitch({ value, onChange }: { value: HubFocus; onChange: (next: HubFocus) => void }) {
  return (
    <div className="hd-focus">
      <span className="hd-focus-label" aria-hidden>
        Focus
      </span>
      <div className="hd-seg" role="group" aria-label="Focus">
        <button type="button" className="hd-seg-btn" aria-pressed={value === "me"} onClick={() => onChange("me")}>
          My day
        </button>
        <button type="button" className="hd-seg-btn" aria-pressed={value === "everyone"} onClick={() => onChange("everyone")}>
          Everyone
        </button>
      </div>
    </div>
  );
}

export function DaySummary({ title, sessions, trainers, chips, spot, spotText, onSpot, onNext, onAsList, focus = null, bookings = "ready" }: DaySummaryProps) {
  if (spot) {
    return (
      <div className="hd-sum" data-spot="true" role="status">
        <span className="hd-spot-words">
          <FamilyIcon family={spot} />
          {`Showing ${spotText} on the grid`}
        </span>
        <div className="hd-spot-actions">
          <button type="button" className="hd-btn" onClick={onNext}>
            <ArrowDown size={16} aria-hidden />
            {"Next"}
          </button>
          <button type="button" className="hd-btn" data-primary="true" onClick={onAsList}>
            {"See them as a list"}
            <ChevronRight size={16} aria-hidden />
          </button>
          <button type="button" className="hd-btn" onClick={() => onSpot(null)}>
            Done
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="hd-sum" data-focus-switch={focus ? "true" : undefined}>
      <span className="hd-sum-words">
        <strong>{title}</strong>
        {sessions > 0
          ? ` · ${sessions} ${sessions === 1 ? "session" : "sessions"} · ${trainers} ${trainers === 1 ? "trainer" : "trainers"}`
          : bookings === "failed"
            ? " · couldn't load the bookings"
            : bookings === "loading"
              ? " · reading the bookings\u2026"
              : " · nothing booked"}
      </span>
      {chips.length > 0 && (
        <div className="hd-chips" role="group" aria-label="Light them up on the grid">
          {chips.map((c) => (
            <button key={c.id} type="button" className="hd-chip" onClick={() => onSpot(c.id)}>
              <FamilyIcon family={c.id} />
              {`${c.label} ${c.count}`}
            </button>
          ))}
        </div>
      )}
      {focus && <FocusSwitch value={focus.value} onChange={focus.onChange} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The Key                                                             */
/* ------------------------------------------------------------------ */

const MARKS: ReadonlyArray<{ family: MomentFamily; icon: Icon; name: string; means: string }> = [
  { family: "read-first", icon: AlertTriangle, name: "Read first", means: "A Critical note that matters today. The only red mark." },
  { family: "watch", icon: FileSignature, name: "No waiver signed", means: "Mindbody has no signed liability waiver (its red “nw” corner). It never stops a session." },
  { family: "watch", icon: Activity, name: "Pulse flag", means: "Her last Pulse check scored red where the reference flags it." },
  { family: "welcome", icon: Sparkles, name: "New", means: "A consultation, sessions 1 to 3, or her first time with this trainer." },
  { family: "welcome", icon: Undo2, name: "Back after a break", means: "About 3 or more sessions missed at her own pace." },
  { family: "celebrate", icon: Award, name: "Milestone", means: "The 50th, 100th, 150th… session." },
  { family: "celebrate", icon: Cake, name: "Birthday", means: "Within a week either side. A decade is said aloud." },
  { family: "renew", icon: RefreshCw, name: "Renewal talk", means: "The Wrap-up says it’s time to talk about renewing." },
  {
    family: "get-to-know",
    icon: MessageCircle,
    name: "Ask about",
    means: "Something from her FORD: a day that comes round this week, or something noted in the last two weeks. What it is stays in the peek and the list, never on the card.",
  },
];

const STATES: ReadonlyArray<{ state: string; name: string; means: string }> = [
  { state: "live", name: "Coming up", means: "Every mark shows until the session is done." },
  { state: "in-session", name: "In session", means: "A Journey session is open for her." },
  {
    state: "left-open",
    name: "Left open",
    means: "A session was started and has gone quiet for over an hour (the app’s one rule for an unfinished session). Tap it to resume it or close it.",
  },
  { state: "done", name: "Done or not logged", means: "It steps back and goes quiet. “Not logged” says nobody pressed End Session." },
  { state: "unlinked", name: "Not synced yet", means: "No Max Strength profile yet; the next Mindbody sync links it." },
  {
    state: "unlinked",
    name: "Unassigned",
    means: "The last column: a booking with no trainer Journey can match by id (the studio rotation, a blank, or a Mindbody staff member not linked to a trainer). Its card says Mindbody’s name. Never matched by a name.",
  },
  { state: "staff", name: "Not a session", means: "Mindbody’s “Unavailable”: lunch, a one-on-one. Never counted." },
  { state: "off", name: "Not working", means: "Outside the trainer’s agreed week, or a day away. Nothing is shaded without an agreed week." },
];

export function KeySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>The Key</DialogTitle>
        <DialogDescription>
          One set of marks for the grid, the peek and the list. The grid shows marks only; their words are in the peek and the
          list, because clients stand next to this iPad.
        </DialogDescription>
        <ul className="hd-key-list">
          {MARKS.map((row) => {
            const I = row.icon;
            return (
              <li key={row.name}>
                {row.family === "read-first" ? (
                  <span className="hs-tri" aria-hidden>
                    <I size={14} strokeWidth={2.5} aria-hidden />
                  </span>
                ) : (
                  <span className="hs-g" data-family={row.family} aria-hidden>
                    <I size={13} strokeWidth={2.4} aria-hidden />
                  </span>
                )}
                <span>
                  <strong>{row.name}.</strong> {row.means}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="hd-key-note">
          <strong>#43</strong> in a card’s top-right corner is the session this booking will be, shown only where Journey holds her
          whole story or someone wrote the rest down. Sessions 1 to 3 are the Welcome mark’s to say.
        </p>
        <h3 className="hd-key-h">On the grid</h3>
        <ul className="hd-key-list">
          {STATES.map((row) => (
            <li key={row.name}>
              <span className="hd-swatch" data-state={row.state} aria-hidden />
              <span>
                <strong>{row.name}.</strong> {row.means}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
