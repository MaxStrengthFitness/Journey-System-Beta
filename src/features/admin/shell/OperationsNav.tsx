/**
 * OPERATIONS' MENU — the five destinations, drawn two ways.
 *
 * The redesign's Operations room (Sep 28 2026). Today's nine-tab strip ran
 * off an upright iPad with nothing to say so (the pin "part of it is off
 * screen"); Apple's guidance is five tabs or fewer, turning into a sidebar
 * when there is room (research-operations §6.2, [S60]–[S64]).
 *
 *   OpsSidebar   wide (a landscape iPad, a desk): "Looking at" on top, the
 *                five destinations with the pages inside them, Setup's
 *                pages behind a toggle, remembered.
 *   OpsTabs      upright: the five across the top, nothing off screen.
 *   OpsSubs      upright: the pages inside a destination, as a segmented
 *                control under the tabs (the sidebar shows them when wide).
 *   LookingAt    the scope: this studio or all my studios (scope-context).
 *   SetupHome    Setup's own list, one line saying what each screen is for.
 *
 * Every tap goes through the shell's `onGo`, which asks the leave question
 * first (unsaved changes): a page that holds typing is about to unmount.
 * Both shapes are in the page at once and CSS shows one, so a render test can
 * press either.
 */
import { Fragment, type ReactNode } from "react";
import { Building2, CalendarDays, CalendarRange, ChevronDown, ChevronRight, ChevronUp, Download, Dumbbell, KeyRound, Megaphone, ScrollText, SlidersHorizontal, Sunrise, Users, UsersRound, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOperationsScope } from "../scope-context";
import { OPS_PAGES, pageDef, type OpsPage, type OpsPlace } from "./places";
import "./ops.css";

export const PAGE_ICON: Record<OpsPage, ReactNode> = {
  today: <Sunrise className="w-[19px] h-[19px]" aria-hidden />,
  week: <CalendarRange className="w-[19px] h-[19px]" aria-hidden />,
  month: <CalendarDays className="w-[19px] h-[19px]" aria-hidden />,
  clients: <UsersRound className="w-[19px] h-[19px]" aria-hidden />,
  team: <Users className="w-[19px] h-[19px]" aria-hidden />,
  setup: <SlidersHorizontal className="w-[19px] h-[19px]" aria-hidden />,
};

/** Counts beside a destination (Today's "needs you"), hot or quiet. */
export type NavBadges = Partial<Record<OpsPage, { count: number; hot?: boolean }>>;

function Badge({ badge }: { badge?: { count: number; hot?: boolean } }) {
  if (!badge || badge.count <= 0) return null;
  return <b className={cn("ops-badge", badge.hot && "ops-badge--hot")}>{badge.count}</b>;
}

/* ------------------------------------------------------------------ *
 * Looking at
 * ------------------------------------------------------------------ */

/**
 * "Looking at" — the one scope control every page reads. With a choice (a
 * leader of several studios, an owner) it is a select; with none it says
 * which studio, plainly, so the page never hides where it is looking.
 */
export function LookingAt({ variant }: { variant: "side" | "top" }) {
  const { switchable, scope, studio, canSpan, pickStudio, pickAll } = useOperationsScope();
  const options = studio && !switchable.some((s) => s.id === studio.id) ? [studio, ...switchable] : switchable;
  const choice = canSpan || options.length > 1;
  const id = `ops-look-${variant}`;
  const label = scope.kind === "all" ? "All my studios" : (studio?.name ?? "This studio");
  return (
    <div className={cn("ops-look", variant === "top" && "ops-look--top")}>
      {choice ? (
        <label className="ops-look__label" htmlFor={id}>
          Looking at
        </label>
      ) : (
        <span className="ops-look__label">Looking at</span>
      )}
      <div className="ops-look__row">
        <Building2 className="w-4 h-4" aria-hidden />
        {choice ? (
          <select
            id={id}
            className="ops-look__select"
            value={scope.kind === "all" ? "all" : scope.studioId}
            onChange={(e) => (e.target.value === "all" ? pickAll() : pickStudio(e.target.value))}
          >
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {canSpan && <option value="all">All my studios</option>}
          </select>
        ) : (
          <span>{label}</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The sidebar (wide)
 * ------------------------------------------------------------------ */

export interface OpsNavProps {
  place: OpsPlace;
  /** The page each destination would open on (its remembered page). */
  subOf: (page: OpsPage) => string | null;
  onGo: (place: OpsPlace) => void;
  badges?: NavBadges;
}

export function OpsSidebar({ place, subOf, onGo, badges, setupOpen, onToggleSetup, foot }: OpsNavProps & { setupOpen: boolean; onToggleSetup: () => void; foot?: ReactNode }) {
  const main = OPS_PAGES.filter((p) => p.id !== "setup");
  const setup = pageDef("setup");
  const onSetup = place.page === "setup";
  return (
    <aside className="ops-side" aria-label="Operations">
      <LookingAt variant="side" />
      <nav className="ops-nav" aria-label="Operations pages">
        {main.map((p) => {
          const on = place.page === p.id;
          // A destination with pages inside it is "open" when you are in it; the page is the one marked.
          const single = p.subs.length <= 1;
          return (
            <Fragment key={p.id}>
              <button
                type="button"
                className={cn("ops-nav__i", on && (single ? "ops-nav__i--on" : "ops-nav__i--open"))}
                aria-current={on && single ? "page" : undefined}
                onClick={() => onGo({ page: p.id, sub: subOf(p.id) })}
              >
                {PAGE_ICON[p.id]}
                <span>{p.label}</span>
                <Badge badge={badges?.[p.id]} />
              </button>
              {!single &&
                p.subs.map((s) => {
                  const sOn = on && place.sub === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={cn("ops-nav__s", sOn && "ops-nav__s--on")}
                      aria-current={sOn ? "page" : undefined}
                      onClick={() => onGo({ page: p.id, sub: s.id })}
                    >
                      <span>{s.label}</span>
                    </button>
                  );
                })}
            </Fragment>
          );
        })}
        <div className="ops-nav__rule" role="presentation" />
        <div className="ops-nav__grp">
          <button
            type="button"
            className={cn("ops-nav__i", onSetup && !place.sub && "ops-nav__i--on", onSetup && place.sub && "ops-nav__i--open")}
            aria-current={onSetup && !place.sub ? "page" : undefined}
            onClick={() => onGo({ page: "setup", sub: null })}
          >
            {PAGE_ICON.setup}
            <span>{setup.label}</span>
          </button>
          <button type="button" className="ops-nav__tog" aria-expanded={setupOpen} aria-label={setupOpen ? "Hide Setup's pages" : "Show Setup's pages"} onClick={onToggleSetup}>
            {setupOpen ? <ChevronUp className="w-4 h-4" aria-hidden /> : <ChevronDown className="w-4 h-4" aria-hidden />}
          </button>
        </div>
        {setupOpen &&
          setup.subs.map((s) => {
            const sOn = onSetup && place.sub === s.id;
            return (
              <button
                key={s.id}
                type="button"
                className={cn("ops-nav__s", sOn && "ops-nav__s--on")}
                aria-current={sOn ? "page" : undefined}
                onClick={() => onGo({ page: "setup", sub: s.id })}
              >
                <span>{s.label}</span>
              </button>
            );
          })}
      </nav>
      {foot}
    </aside>
  );
}

/* ------------------------------------------------------------------ *
 * Upright: the tabs and the pages inside
 * ------------------------------------------------------------------ */

export function OpsTabs({ place, subOf, onGo, badges }: OpsNavProps) {
  return (
    <nav className="ops-tabs" aria-label="Operations">
      {OPS_PAGES.map((p) => {
        const on = place.page === p.id;
        return (
          <button
            key={p.id}
            type="button"
            className={cn("ops-tab", on && "ops-tab--on")}
            aria-current={on ? "page" : undefined}
            onClick={() => onGo({ page: p.id, sub: p.id === "setup" ? null : subOf(p.id) })}
          >
            {PAGE_ICON[p.id]}
            <span>{p.label}</span>
            <Badge badge={badges?.[p.id]} />
          </button>
        );
      })}
    </nav>
  );
}

/** The pages inside the destination on screen, upright. Setup uses its own list and a Back instead. */
export function OpsSubs({ place, onGo }: Pick<OpsNavProps, "place" | "onGo">) {
  const def = pageDef(place.page);
  if (def.id === "setup" || def.subs.length < 2) return null;
  return (
    <div className="ops-subs">
      <div className="ops-seg" role="group" aria-label={`${def.label} pages`}>
        {def.subs.map((s) => (
          <button key={s.id} type="button" aria-pressed={place.sub === s.id} onClick={() => onGo({ page: def.id, sub: s.id })}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Setup's list
 * ------------------------------------------------------------------ */

const SETUP_ROWS: Record<string, { icon: ReactNode; say: string }> = {
  floor: { icon: <Dumbbell className="w-5 h-5" aria-hidden />, say: "Machines, machine fit and routines. The same floor editor as My Studio → Machines." },
  people: { icon: <KeyRound className="w-5 h-5" aria-hidden />, say: "Who works here and their roles. Letting people in is on My Studio → Team." },
  announcements: { icon: <Megaphone className="w-5 h-5" aria-hidden />, say: "Post a notice to your studio, or further for owners and administrators." },
  mindbody: { icon: <Zap className="w-5 h-5" aria-hidden />, say: "The link to Mindbody, the last pull, and pulling again." },
  data: { icon: <Download className="w-5 h-5" aria-hidden />, say: "Exports of the studio's sessions and bookings." },
  rules: { icon: <ScrollText className="w-5 h-5" aria-hidden />, say: "The numbers behind every sentence here: the studio's own, set on My Studio → Studio, and Max Strength's." },
};

export function SetupHome({ onGo }: { onGo: (place: OpsPlace) => void }) {
  const setup = pageDef("setup");
  return (
    <div className="ops-client">
      <div>
        <span className="ops-client__eyebrow">Setup</span>
        <h1 className="ops-client__name">How the studio is set up</h1>
        <p className="ops-client__meta">Looking lives on the other four. Changing how the studio is set up lives here. The studio's own settings are on My Studio → Studio.</p>
      </div>
      <nav className="ops-setup" aria-label="Setup">
        {setup.subs.map((s) => (
          <button key={s.id} type="button" className="ops-setup__row" onClick={() => onGo({ page: "setup", sub: s.id })}>
            <span className="ops-setup__icon">{SETUP_ROWS[s.id]?.icon}</span>
            <span className="ops-setup__text">
              <span className="ops-setup__title">{s.label}</span>
              {SETUP_ROWS[s.id] && <span className="ops-setup__say">{SETUP_ROWS[s.id].say}</span>}
            </span>
            <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        ))}
      </nav>
    </div>
  );
}
