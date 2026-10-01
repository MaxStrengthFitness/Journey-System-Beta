/**
 * THE CLIENT DIRECTORY — one smart table (directory round, Sep 27 2026).
 *
 * AJ called the old screen "a sad list". What he wants from it: "when they
 * are in next, when they were in last, how many sessions they have left",
 * sortable, so "I can search Nancy and then sort by last seen and then know
 * which Nancy was here last of all Nancys" — and to ask the roster questions
 * ("female nurses over 60", "everyone who's 5'6").
 *
 * Research-directory §6 Direction A, run on the engine in this folder:
 *   row.ts      what every cell says (and "Unknown", with its reason)
 *   buckets.ts  the sort, said in words, as sticky sections
 *   search.ts   names, nicknames both ways, typos, O'Brien
 *   tokens.ts   descriptions as removable filters, with honest counts
 *   views.ts    All · Mine · Kaizen · In today, and the remembered sort
 *
 * READS. None per client, ever. The rows ride on what AppContent already
 * streams — the studio roster, the held bookings (about 8 days), the last
 * day's sessions, the trainers, the studios — plus ONE small document, the
 * studio's package table (`useRenewalSettings`, the same read the profile
 * makes), so "left" says the profile's number. "All my studios" keeps the
 * old screen's query path exactly: the two name-prefix queries, scoped by
 * `queryStudioIds`, run only when a name is typed. The old unordered
 * `limit(100)` Last Session query is gone.
 *
 * The note marks (a dot for a note you haven't marked off) are out of scope
 * this round: `marks` is the seam, and it defaults to none. They need a
 * roll-up AJ has to OK (a Firestore structure change).
 */
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { db } from "../../firebase";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import type { Client, KaizenRosterEntry, ScheduleEntry, Studio, Trainer, WorkoutSession } from "../../types";
import { NAME_SEARCH_PROPS } from "../../lib/name-search-input";
import { queryStudioIds, realmStudioIds } from "../../lib/tenancy";
import { myTrainerIds } from "../../lib/live-session";
import { formatStudioDate, formatStudioTime, studioDateKey, studioTodayKey } from "../../lib/studio-time";
import { SCHEDULE_STALE_MS } from "../../lib/schedule-window";
import { LoadingArea } from "../../components/LoadingMark";
import { KaizenToggle } from "../trainer-profile/KaizenToggle";
import { KaizenMark } from "../trainer-profile/KaizenMark";
import "../trainer-profile/trainer-profile.tokens.css";
import { useRenewalSettings } from "../renewals/useRenewalSettings";
import { buildPackageNameIndex } from "../renewals/settings";
import { buildDirectoryRows, prepareDirectory, type DirectoryRow } from "./row";
import { SORTS, SORT_MENU, nextSortForTap, sectionRows, sortWords, type SortKey, type SortSpec } from "./buckets";
import { buildNameIndex, searchNames, type NameMatch, type Range } from "./search";
import { applyTokens, buildNameVocab, buildOccupationVocab, notOnFileWords, parseQuery, type Token } from "./tokens";
import {
  MINE_DEFINITION,
  TODAY_DEFINITION,
  TODAY_SORT,
  VIEWS,
  browserStorage,
  inView,
  readSavedSort,
  saveSort,
  viewCounts,
  type ViewId,
} from "./views";
import { rosterCutWords } from "../../lib/studio-roster";
import "./client-directory.css";

/** How long the held bookings may go unread before "Nothing booked" is no longer said. */
export const BOOKINGS_FRESH_MS = 2 * SCHEDULE_STALE_MS;

/** A mark in the attention gutter. The seam for note marks; nothing draws one yet. */
export interface DirectoryMark {
  kind: "note" | "critical";
  /** The accessible label: "2 open notes you haven't marked off, 1 critical." */
  label: string;
}

export interface ClientDirectoryProps {
  clients: Client[];
  onSelectClient: (clientId: string) => void;
  /** Header action: start a session now and assign the client at the end. */
  onStartOpenSession?: () => void;
  /** In today's Start: the Hub's own path (select the client, open the session). */
  onStartSession?: (clientId: string) => void;
  onStartNewClientOnboarding?: (name: string) => void;
  authTrainer?: Trainer | null;
  /** The LIVE trainer document — the Kaizen toggle rewrites the whole roster from it. */
  liveAuthTrainer?: Trainer | null;
  /** Kept for callers that pass only the ids; the live roster's entries win. */
  kaizenClientIds?: Set<string>;
  uid?: string | null;
  rosterStatus?: "loading" | "ready" | "error";
  /**
   * The studio's client list stopped at its limit (useStudioRoster's `cut`;
   * hub fixes, Oct 1 2026): said in words, and a typed name is also asked
   * of Firestore, so nobody past the cut is out of reach.
   */
  rosterCut?: boolean;
  /** The bookings AppContent holds (useLiveSchedule). */
  schedules?: ReadonlyArray<ScheduleEntry> | null;
  /** When they were last read (useLiveSchedule's lastFetchedAt), epoch ms. */
  schedulesFetchedAt?: number | null;
  /** The studio's sessions of the last day (useSessions). */
  sessions?: ReadonlyArray<WorkoutSession> | null;
  sessionsKnown?: boolean;
  trainers?: ReadonlyArray<Trainer>;
  studios?: ReadonlyArray<Studio>;
  /** Note marks per client id. Out of scope this round: defaults to none. */
  marks?: ReadonlyMap<string, DirectoryMark> | null;
  /** A fixed clock, for tests. */
  now?: Date;
}

type Scope = "studio" | "all";
type ExtraColumn = "total" | "age" | "height";
const EXTRA_COLUMNS: ExtraColumn[] = ["total", "age", "height"];
const COLUMN_WORDS: Record<string, string> = {
  client: "Client",
  lastIn: "Last in",
  next: "Next",
  left: "Left",
  total: "Total",
  age: "Age",
  height: "Height",
};

/* ------------------------------------------------------------------ */
/* The old screen's query path, for studios the roster does not hold    */
/* ------------------------------------------------------------------ */

/**
 * The two name-prefix queries the old directory ran for "Search entire
 * corporate network", unchanged: `homeStudioId in` the studios this trainer
 * may read (tenancy), first and last name from the first three letters,
 * thirty each. Only while `enabled` and a name is typed.
 */
function useStudiosNameQuery(term: string, studioIds: string[], enabled: boolean): { results: Client[]; searching: boolean; failed: boolean } {
  const [state, setState] = useState<{ results: Client[]; searching: boolean; failed: boolean }>({ results: [], searching: false, failed: false });
  const key = studioIds.join(",");
  useEffect(() => {
    const alpha = term.trim().toLowerCase().replace(/[^a-z]/g, "");
    const prefix = alpha.slice(0, 3);
    if (!enabled || !prefix || studioIds.length === 0) {
      setState({ results: [], searching: false, failed: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, searching: true }));
    const timer = setTimeout(async () => {
      const cap = prefix.charAt(0).toUpperCase() + prefix.slice(1);
      try {
        const clientsRef = collection(db, "clients");
        const byField = (field: "firstName" | "lastName") =>
          query(clientsRef, where("homeStudioId", "in", studioIds), where(field, ">=", cap), where(field, "<=", `${cap}\uf8ff`), limit(30));
        const [a, b] = await Promise.all([getDocs(byField("firstName")), getDocs(byField("lastName"))]);
        if (cancelled) return;
        const byId = new Map<string, Client>();
        for (const d of [...a.docs, ...b.docs]) byId.set(d.id, { id: d.id, ...(d.data() as object) } as Client);
        setState({ results: [...byId.values()], searching: false, failed: false });
      } catch (err) {
        if (cancelled) return;
        console.error("Client search failed:", err);
        // A failed read is unknown, never "nobody": keep what was found.
        setState((s) => ({ ...s, searching: false, failed: true }));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` stands for studioIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, key, enabled]);
  return state;
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/** A field's text with the matched letters marked. */
function Highlighted({ text, ranges }: { text: string; ranges?: Range[] }) {
  if (!ranges || ranges.length === 0) return <>{text}</>;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let at = 0;
  sorted.forEach(([s, e], i) => {
    if (s < at) return;
    if (s > at) parts.push(text.slice(at, s));
    parts.push(<mark key={i}>{text.slice(s, e)}</mark>);
    at = e;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

function NameLine({ row, match }: { row: DirectoryRow; match: NameMatch | null }) {
  const { first, nickname, last } = row.name;
  return (
    <span className="cd-name-text">
      {first && <Highlighted text={first} ranges={match?.ranges.first} />}
      {nickname && (
        <>
          {" \u201c"}
          <Highlighted text={nickname} ranges={match?.ranges.nickname} />
          {"\u201d"}
        </>
      )}
      {match?.alias && !nickname && <span className="cd-why-match">{` (${match.alias})`}</span>}
      {last && (
        <>
          {" "}
          <Highlighted text={last} ranges={match?.ranges.last} />
        </>
      )}
    </span>
  );
}

/** A cell's value, its second line, and — for an unknown — the reason on a tap. */
function Cell({
  value,
  sub,
  reason,
  state,
  sorted,
  label,
  extra = false,
}: {
  value: string;
  sub: string | null;
  reason: string | null;
  state: string;
  sorted: boolean;
  label: string;
  extra?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const explain = !!reason && (state === "unknown" || state === "before-journey" || state === "nothing-recorded" || state === "none");
  return (
    <div className={extra ? "cd-cell cd-x" : "cd-cell"} data-state={state} data-sorted={sorted ? "true" : "false"} data-col={label}>
      {explain ? (
        <button
          type="button"
          className="cd-why cd-hit-target"
          aria-expanded={open}
          aria-label={`${label}: ${value}. Why?`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <span className="cd-val">{value}</span>
          <span className="cd-why-mark" aria-hidden="true">
            i
          </span>
        </button>
      ) : (
        <span className="cd-val">{value}</span>
      )}
      {sub && <span className="cd-sub">{sub}</span>}
      {open && reason && <span className="cd-reason">{reason}</span>}
    </div>
  );
}

function kaizenLine(entry: KaizenRosterEntry, tz?: string): string {
  const review = entry.reviewBy ? formatStudioDate(entry.reviewBy as never, { month: "short", day: "numeric" }, tz, "") : "";
  return [`Watching: ${entry.reason.toLowerCase()}${entry.note ? ` \u2014 ${entry.note}` : ""}`, review ? `check back ${review}` : null]
    .filter(Boolean)
    .join(" \u00b7 ");
}

/** What leads the identity line in bold when the sort has no column on screen. */
function sortedLead(row: DirectoryRow, key: SortKey, wide: Set<ExtraColumn>): string | null {
  switch (key) {
    case "age":
      return wide.has("age") ? null : row.age.value === null ? null : `${row.age.value}`;
    case "height":
      return wide.has("height") ? null : row.height.inches === null ? null : row.height.text;
    case "total":
      return wide.has("total") ? null : row.total.value === null ? null : `${row.total.text} sessions`;
    case "since":
      return row.since.year === null ? null : `Since ${row.since.text}`;
    case "time":
      return row.today ? `${row.today.text}${row.today.with ? ` ${row.today.with}` : ""}` : null;
    default:
      return null;
  }
}

function identityLine(row: DirectoryRow, view: ViewId, lead: string | null, scope: Scope, tz?: string): string {
  if (view === "kaizen" && row.kaizen) return kaizenLine(row.kaizen, tz);
  const age = lead && lead === `${row.age.value}` ? null : row.age.value !== null ? `${row.age.value}` : null;
  const occupation = row.occupation.text ? (row.occupation.retired && !/retir/i.test(row.occupation.text) ? `${row.occupation.text} \u00b7 retired` : row.occupation.text) : row.occupation.retired ? "retired" : null;
  // Under "This studio" a client from elsewhere is here because she is
  // booked here; under "All my studios" she is simply someone else's.
  const home = row.visitingFrom ? (scope === "studio" ? `Visiting from ${row.visitingFrom}` : `Home: ${row.visitingFrom}`) : null;
  return [age, occupation, row.age.birthdayPhrase, home].filter(Boolean).join(" \u00b7 ");
}

/* ------------------------------------------------------------------ */
/* The screen                                                          */
/* ------------------------------------------------------------------ */

export function ClientDirectory({
  clients,
  onSelectClient,
  onStartOpenSession,
  onStartSession,
  onStartNewClientOnboarding,
  authTrainer,
  liveAuthTrainer,
  kaizenClientIds,
  uid,
  rosterStatus = "ready",
  rosterCut = false,
  schedules = null,
  schedulesFetchedAt = null,
  sessions = null,
  sessionsKnown = false,
  trainers = [],
  studios,
  marks = null,
  now: fixedNow,
}: ClientDirectoryProps) {
  const { activeStudioId, availableStudios } = useActiveStudio();
  const studioList: ReadonlyArray<Studio> = studios ?? availableStudios ?? [];

  /* ---- the clock: a minute is fine for "today" and "next" ---- */
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (fixedNow) return;
    const t = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [fixedNow]);
  const now = useMemo(() => fixedNow ?? new Date(tick), [fixedNow, tick]);
  const today = studioTodayKey(now);

  /* ---- the controls ---- */
  const trainerKey = authTrainer?.id ?? uid ?? null;
  const [searchText, setSearchText] = useState("");
  const deferredSearch = useDeferredValue(searchText);
  const [view, setView] = useState<ViewId>("all");
  const [scope, setScope] = useState<Scope>("studio");
  const [asOccupation, setAsOccupation] = useState<Set<string>>(() => new Set());
  const [chosenSort, setChosenSort] = useState<SortSpec>(() => readSavedSort(browserStorage(), trainerKey));
  const [wide, setWide] = useState<Set<ExtraColumn>>(() => new Set(EXTRA_COLUMNS));
  // Another trainer signing in on this iPad gets their own remembered sort.
  useEffect(() => setChosenSort(readSavedSort(browserStorage(), trainerKey)), [trainerKey]);
  const [todaySort, setTodaySort] = useState<SortSpec>(TODAY_SORT);
  const sort = view === "today" ? todaySort : chosenSort;
  const setSort = useCallback(
    (next: SortSpec) => {
      if (view === "today") {
        setTodaySort(next);
        return;
      }
      setChosenSort(next);
      saveSort(browserStorage(), trainerKey, next);
    },
    [view, trainerKey],
  );

  /* ---- who am I ---- */
  const myIds = useMemo(() => myTrainerIds(authTrainer ?? null, uid ?? null), [authTrainer, uid]);
  const kaizen = useMemo<KaizenRosterEntry[]>(() => {
    const live = liveAuthTrainer?.kaizenRoster;
    if (live && live.length > 0) return live;
    return [...(kaizenClientIds ?? [])].map((clientId) => ({ clientId, clientName: "", reason: "Other", addedAt: null, addedByTrainerId: "" }) as KaizenRosterEntry);
  }, [liveAuthTrainer, kaizenClientIds]);
  const trainerNames = useMemo(() => new Map(trainers.map((t) => [t.id, t.nickname?.trim() || t.fullName])), [trainers]);

  /* ---- the studio's package table: the profile's own read ---- */
  const renewalSettings = useRenewalSettings(activeStudioId);
  const packageIndex = useMemo(() => {
    if (renewalSettings.loading || renewalSettings.error || renewalSettings.forStudioId !== activeStudioId) return null;
    return buildPackageNameIndex(renewalSettings.settings);
  }, [renewalSettings.loading, renewalSettings.error, renewalSettings.forStudioId, renewalSettings.settings, activeStudioId]);

  /* ---- freshness ---- */
  const bookingsFresh = schedulesFetchedAt !== null && now.getTime() - schedulesFetchedAt <= BOOKINGS_FRESH_MS;
  const bookingsAsOf =
    schedulesFetchedAt === null
      ? null
      : studioDateKey(new Date(schedulesFetchedAt)) === today
        ? formatStudioTime(new Date(schedulesFetchedAt))
        : `${formatStudioDate(new Date(schedulesFetchedAt), { weekday: "short" })} ${formatStudioTime(new Date(schedulesFetchedAt))}`;

  /* ---- the other studios' query path ---- */
  // The realm rule: inside Demo Mode there is no "all my studios" to offer.
  const readable = realmStudioIds(authTrainer ?? null, activeStudioId);
  const canSearchAll = readable.length > 1;
  const rosterReady = rosterStatus === "ready";
  const typedName = deferredSearch.trim();
  const queryIds = useMemo(
    () => queryStudioIds(authTrainer ?? null, activeStudioId, { includeAll: scope === "all" }),
    [authTrainer, activeStudioId, scope],
  );

  /* ---- the rows ---- */
  const ctx = useMemo(
    () =>
      prepareDirectory({
        today,
        now,
        studios: studioList,
        activeStudioId,
        schedules: schedules ?? null,
        bookingsFresh,
        bookingsAsOf,
        recentSessions: sessionsKnown ? sessions : null,
        packageIndex,
        packageStudioId: activeStudioId,
        kaizen,
        myIds,
        myName: authTrainer?.fullName ?? null,
        trainerNameOf: (id) => trainerNames.get(id) ?? null,
      }),
    [today, now, studioList, activeStudioId, schedules, bookingsFresh, bookingsAsOf, sessionsKnown, sessions, packageIndex, kaizen, myIds, authTrainer?.fullName, trainerNames],
  );

  // This studio's clients, and anyone booked here (a visitor). The selected
  // client from elsewhere, which AppContent also carries, is not one of them.
  const studioClients = useMemo(
    () => clients.filter((c) => !!c.id && ((c.homeStudioId || (c as { studioId?: string }).studioId) === activeStudioId || !!ctx.bookingsByClient?.has(c.id))),
    [clients, activeStudioId, ctx.bookingsByClient],
  );

  const parsedForQuery = useMemo(() => parseQuery(deferredSearch, { words: new Map() }), [deferredSearch]);
  const firstNameWord = parsedForQuery.nameText.split(/\s+/)[0] ?? "";
  const queryEnabled = (scope === "all" && canSearchAll) || !rosterReady || rosterCut;
  const remote = useStudiosNameQuery(firstNameWord, queryIds, queryEnabled && firstNameWord.length > 0);

  const scopeClients = useMemo(() => {
    if (remote.results.length === 0) return studioClients;
    const byId = new Map(studioClients.map((c) => [c.id as string, c]));
    for (const c of remote.results) if (c.id && !byId.has(c.id)) byId.set(c.id, c);
    return [...byId.values()];
  }, [studioClients, remote.results]);

  const rows = useMemo(() => buildDirectoryRows(scopeClients, ctx), [scopeClients, ctx]);
  const nameIndex = useMemo(() => buildNameIndex(rows.map((r) => ({ id: r.id, first: r.name.first, nickname: r.name.nickname, last: r.name.last }))), [rows]);
  const occupations = useMemo(() => buildOccupationVocab(rows), [rows]);
  const nameVocab = useMemo(() => buildNameVocab(rows), [rows]);
  const counts = useMemo(() => viewCounts(rows, myIds), [rows, myIds]);

  const parsed = useMemo(() => parseQuery(deferredSearch, occupations, { names: nameVocab, asOccupation }), [deferredSearch, occupations, nameVocab, asOccupation]);
  const viewRows = useMemo(() => rows.filter((r) => inView(r, view, myIds)), [rows, view, myIds]);
  const tokenFilter = useMemo(() => applyTokens(viewRows, parsed.tokens), [viewRows, parsed.tokens]);
  const nameResult = useMemo(() => searchNames(nameIndex, parsed.nameText), [nameIndex, parsed.nameText]);
  const shown = useMemo(
    () => (parsed.nameText.trim() ? tokenFilter.rows.filter((r) => nameResult.matches.has(r.id)) : tokenFilter.rows),
    [parsed.nameText, tokenFilter.rows, nameResult],
  );
  const sections = useMemo(
    () => sectionRows(shown, sort, { today, now, bookingsAsOf, horizonDays: ctx.horizonDays }),
    [shown, sort, today, now, bookingsAsOf, ctx.horizonDays],
  );

  /* ---- actions ---- */
  const removeToken = (t: Token) => {
    const at = searchText.toLowerCase().indexOf(t.source.toLowerCase());
    const next = at < 0 ? searchText : `${searchText.slice(0, at)} ${searchText.slice(at + t.source.length)}`;
    setSearchText(next.replace(/\s+/g, " ").trim());
  };
  const tapColumn = (key: SortKey) => setSort(nextSortForTap(sort, key));
  const studioName = studioList.find((s) => s.id === activeStudioId)?.name ?? null;

  /* ---- the grid's columns ---- */
  const showGutter = !!marks;
  const showStart = view === "today" && !!onStartSession;
  const base = [showGutter ? "24px" : null, "40px", "minmax(0, 1fr)", "minmax(96px, 120px)", "minmax(112px, 140px)", "minmax(84px, 104px)"];
  const tailCol = showStart ? "auto" : null;
  const cols = [...base, tailCol].filter(Boolean).join(" ");
  const colsWide = [
    ...base,
    wide.has("total") ? "72px" : null,
    wide.has("age") ? "52px" : null,
    wide.has("height") ? "64px" : null,
    tailCol,
  ]
    .filter(Boolean)
    .join(" ");
  const gridVars = { "--cd-cols": cols, "--cd-cols-wide": colsWide } as React.CSSProperties;

  const total = rows.length;
  const describing = parsed.tokens.length > 0 || !!parsed.nameText.trim();
  const countWords = describing ? `${shown.length} of ${viewRows.length} match` : `${viewRows.length} ${viewRows.length === 1 ? "client" : "clients"}`;
  const notOnFile = notOnFileWords(tokenFilter, parsed.tokens);

  const colHead = (key: string, sortKey: SortKey | null, extra = false) => {
    const active = sortKey !== null && sort.key === sortKey;
    const arrow = active ? (sort.dir === "asc" ? " \u2191" : " \u2193") : "";
    return (
      <div key={key} className={extra ? "cd-x" : undefined}>
        {sortKey ? (
          <button
            type="button"
            className="cd-colbtn"
            aria-pressed={active}
            aria-label={active ? `${COLUMN_WORDS[key]}: ${sortWords(sort)}. Tap to reverse.` : `Sort by ${COLUMN_WORDS[key]}`}
            onClick={() => tapColumn(sortKey)}
          >
            {`${COLUMN_WORDS[key]}${arrow}`}
          </button>
        ) : (
          <span className="cd-colhead-label">{COLUMN_WORDS[key] ?? ""}</span>
        )}
      </div>
    );
  };

  const firstLoad = rosterStatus === "loading" && rows.length === 0 && !typedName;

  return (
    <div className="cd" data-view={view}>
      <header className="cd-head">
        <div className="cd-title-row">
          <h1 className="cd-title">
            {"Clients"}
            {studioName && <span className="cd-title-studio">{` \u00b7 ${studioName}`}</span>}
          </h1>
          <div className="cd-actions">
            {onStartOpenSession && (
              <Button
                variant="outline"
                onClick={() => onStartOpenSession()}
                className="font-bold uppercase tracking-widest rounded-xl h-12 px-5 cursor-pointer"
                title="Start a session now and assign the client at the end"
              >
                Open session
              </Button>
            )}
            {onStartNewClientOnboarding && (
              <Button
                onClick={() => onStartNewClientOnboarding("")}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-widest rounded-xl h-12 px-6 transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Client
              </Button>
            )}
          </div>
        </div>

        <div className="cd-search-row">
          <label className="cd-search">
            <Search className="cd-search-icon" size={20} aria-hidden="true" />
            <input
              className="cd-search-input"
              // Text, not "search": Safari adds its own clear button to a
              // search field, beside this screen's 44px one.
              type="text"
              enterKeyHint="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={"Name or nickname \u2014 or describe: \u201cnurses over 60\u201d"}
              aria-label="Search clients by name, or describe them"
              {...NAME_SEARCH_PROPS}
            />
            {searchText && (
              <button type="button" className="cd-search-clear" aria-label="Clear the search" onClick={() => setSearchText("")}>
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </label>
          {canSearchAll && (
            <select className="cd-select" aria-label="Which studios" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="studio">This studio</option>
              <option value="all">All my studios</option>
            </select>
          )}
          <span className="cd-display" role="group" aria-label="Columns shown on a wide screen">
            {EXTRA_COLUMNS.map((c) => (
              <button
                key={c}
                type="button"
                className="cd-display-toggle"
                aria-pressed={wide.has(c)}
                onClick={() =>
                  setWide((prev) => {
                    const next = new Set(prev);
                    if (next.has(c)) next.delete(c);
                    else next.add(c);
                    return next;
                  })
                }
              >
                {COLUMN_WORDS[c]}
              </button>
            ))}
          </span>
        </div>

        <div className="cd-chips" role="group" aria-label="Views">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className="cd-chip" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
              <span>{v.label}</span>
              <span className="cd-chip-count">{counts[v.id]}</span>
            </button>
          ))}
        </div>
        {view === "mine" && <p className="cd-line">{MINE_DEFINITION}</p>}
        {view === "today" && <p className="cd-line">{TODAY_DEFINITION}</p>}

        {parsed.tokens.length > 0 && (
          <div className="cd-understood" aria-live="polite">
            <span>Understood as:</span>
            {parsed.tokens.map((t) => (
              <button key={t.label} type="button" className="cd-token" aria-label={`Remove ${t.label}`} onClick={() => removeToken(t)}>
                {t.label}
                <X size={16} aria-hidden="true" />
              </button>
            ))}
            <button type="button" className="cd-link" onClick={() => setSearchText("")}>
              Clear
            </button>
          </div>
        )}
        {parsed.ambiguous.map((a) => (
          <p key={a.word} className="cd-line">
            {`\u201c${a.word}\u201d is a name (${a.asName}) and an occupation (${a.asOccupation}). Searching it as a name.`}
            <button
              type="button"
              className="cd-link"
              onClick={() => setAsOccupation((prev) => new Set(prev).add(a.word.toLowerCase()))}
            >
              {`Search \u201c${a.occupation}\u201d as an occupation`}
            </button>
          </p>
        ))}

        <div className="cd-status" aria-live="polite">
          <span>
            <strong>{countWords}</strong>
            {notOnFile.map((w) => ` \u00b7 ${w}`).join("")}
          </span>
          <select className="cd-select" aria-label="Sort" value={`${sort.key}:${sort.dir}`} onChange={(e) => {
            const [key, dir] = e.target.value.split(":") as [SortKey, SortSpec["dir"]];
            setSort({ key, dir });
          }}>
            {(view === "today" ? (["time", ...SORT_MENU] as SortKey[]) : SORT_MENU).flatMap((key) =>
              (["asc", "desc"] as const).map((dir) => (
                <option key={`${key}:${dir}`} value={`${key}:${dir}`}>
                  {SORTS[key].words[dir]}
                </option>
              )),
            )}
          </select>
          <span>{bookingsAsOf ? `bookings as of ${bookingsAsOf}` : "bookings not loaded yet"}</span>
          {bookingsAsOf && !bookingsFresh && <span className="cd-warn">{"Bookings haven\u2019t been read lately, so a next booking may be missing."}</span>}
          {rosterStatus === "loading" && rows.length > 0 && <span className="cd-warn">{"Still loading this studio\u2019s clients \u2014 the list may be incomplete."}</span>}
          {rosterCut && <span className="cd-warn">{rosterCutWords()}</span>}
          {rosterStatus === "error" && <span className="cd-warn">{"Couldn\u2019t load this studio\u2019s clients \u2014 retrying. The list may be incomplete."}</span>}
          {scope === "all" && !typedName && <span>Type a name to search all your studios.</span>}
          {remote.searching && <span>Searching your studios{"\u2026"}</span>}
          {remote.failed && <span className="cd-warn">{"Couldn\u2019t search the other studios \u2014 the list may be incomplete."}</span>}
        </div>
        {nameResult.closeOnly && <p className="cd-line">{"No exact match. Close matches:"}</p>}
      </header>

      {firstLoad ? (
        <LoadingArea label={"Loading this studio\u2019s clients\u2026"} />
      ) : (
        <div className="cd-scroll" role="region" aria-label={`Clients, ${sortWords(sort)}`}>
          <div className="cd-grid cd-colhead" role="group" aria-label="Sort by a column" style={gridVars}>
            {showGutter && <div aria-hidden="true" />}
            <div aria-hidden="true" />
            {colHead("client", view === "today" ? "time" : "name")}
            {colHead("lastIn", "lastIn")}
            {colHead("next", "next")}
            {colHead("left", "left")}
            {wide.has("total") && colHead("total", "total", true)}
            {wide.has("age") && colHead("age", "age", true)}
            {wide.has("height") && colHead("height", "height", true)}
            {showStart && <div aria-hidden="true" />}
          </div>

          {sections.length === 0 ? (
            <p className="cd-empty">
              {describing ? "Nobody matches that. Remove a filter or check the spelling." : view === "all" ? "No clients on this studio\u2019s list yet." : "Nobody in this view."}
            </p>
          ) : (
            sections.map((section) => (
              <section key={section.id} aria-label={`${section.label}, ${section.rows.length}`}>
                <div className="cd-sechead" data-tail={section.tail ? "true" : "false"}>
                  {`${section.label} \u00b7 ${section.rows.length}`}
                </div>
                {section.rows.map((row) => {
                  const match = nameResult.matches.get(row.id) ?? null;
                  const lead = sortedLead(row, sort.key, wide);
                  const ident = identityLine(row, view, lead, scope);
                  const mark = marks?.get(row.id) ?? null;
                  return (
                    <div key={row.id} className="cd-grid cd-row" data-client-id={row.id} style={gridVars}>
                      <button
                        type="button"
                        className="cd-open"
                        aria-label={`Open ${row.name.display}. Last in: ${row.lastIn.text}. Next: ${row.next.text}. Left: ${row.left.text}.`}
                        onClick={() => onSelectClient(row.id)}
                      />
                      {showGutter && (
                        <div className="cd-gutter" title={mark?.label}>
                          {mark ? "\u25cf" : null}
                        </div>
                      )}
                      <div className="cd-avatar" aria-hidden="true">
                        {row.name.initials}
                      </div>
                      <div className="cd-client">
                        <div className="cd-name">
                          <NameLine row={row} match={match} />
                          {/* The Kaizen Roster toggle, as the old directory had it (the
                              only place a trainer adds a client from the client's
                              side), now 40px. Without the live trainer document it
                              is the read-only mark: the toggle rewrites the whole
                              roster, and from a stale copy that would drop entries. */}
                          {liveAuthTrainer ? (
                            <span className="cd-kaizen cd-hit-target" onClick={(e) => e.stopPropagation()}>
                              <KaizenToggle trainer={liveAuthTrainer} client={row.client} variant="icon" className="h-10 w-10 border-none bg-transparent" />
                            </span>
                          ) : row.kaizen ? (
                            <span className="cd-kaizen">
                              <KaizenMark quiet size={15} title="On your Kaizen Roster" />
                            </span>
                          ) : null}
                          {row.badges.map((b) => (
                            <span key={b} className="cd-badge">
                              {b}
                            </span>
                          ))}
                          {match?.why && <span className="cd-why-match">{match.why}</span>}
                        </div>
                        {(lead || ident) && (
                          <div className="cd-ident">
                            {lead && <strong>{lead}</strong>}
                            {lead && ident ? " \u00b7 " : ""}
                            {ident}
                          </div>
                        )}
                      </div>
                      <Cell label="Last in" value={row.lastIn.text} sub={row.lastIn.sub} reason={row.lastIn.reason} state={row.lastIn.state} sorted={sort.key === "lastIn"} />
                      <Cell label="Next" value={row.next.text} sub={row.next.sub} reason={row.next.reason} state={row.next.state} sorted={sort.key === "next"} />
                      <Cell label="Left" value={row.left.text} sub={row.left.sub} reason={row.left.reason} state={row.left.state} sorted={sort.key === "left"} />
                      {wide.has("total") && (
                        <Cell extra label="Total" value={row.total.text} sub={row.total.sub} reason={row.total.reason} state={row.total.state} sorted={sort.key === "total"} />
                      )}
                      {wide.has("age") && <Cell extra label="Age" value={row.age.text} sub={null} reason={null} state={row.age.value === null ? "unknown" : "known"} sorted={sort.key === "age"} />}
                      {wide.has("height") && (
                        <Cell extra label="Height" value={row.height.text} sub={null} reason={null} state={row.height.inches === null ? "unknown" : "known"} sorted={sort.key === "height"} />
                      )}
                      {showStart && (
                        <div>
                          {row.today && (
                            <button
                              type="button"
                              className="cd-start cd-hit-target"
                              aria-label={`Start ${row.name.goesBy}\u2019s session`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartSession?.(row.id);
                              }}
                            >
                              Start
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            ))
          )}
          {total > 0 && view === "all" && !describing && <p className="cd-empty">{`All ${total} ${total === 1 ? "client" : "clients"} are listed \u2014 sorted on this iPad.`}</p>}
        </div>
      )}
    </div>
  );
}

export default ClientDirectory;
