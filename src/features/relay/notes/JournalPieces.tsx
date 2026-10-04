import { useMemo, useState } from "react";
import {
  Archive,
  BookMarked,
  BookOpenCheck,
  CalendarDays,
  Check,
  Dumbbell,
  History,
  Lightbulb,
  LibraryBig,
  ListOrdered,
  Lock,
  Plus,
  RotateCcw,
  Sprout,
  Trash2,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { PlaybookEntry } from "../../studio-tasks/playbook";
import { staleness } from "../../studio-tasks/playbook";
import { dayLogHeading, dayLogSummary, type DayLog } from "./day-log";
import {
  NOTE_TEMPLATES,
  SHELVES,
  evidenceEntry,
  hunchLine,
  hunchState,
  onThisDayLabel,
  studioShelfDraft,
  type ShelfId,
} from "./journal";
import type { NotesView } from "./notes";
import { excerpt, whenLabel } from "./notes";
import {
  HUNCH_CLAIM_MAX,
  HUNCH_HOW_MAX,
  HUNCH_NEED_MAX,
  HUNCH_SLOTS,
  NOTE_FIELD_MAX,
  NOTE_TYPES,
  LEADER_NOTE_TYPES,
  type Hunch,
  type HunchEvidence,
  type NoteDraft,
  type NoteType,
  type TrainerNote,
} from "./types";

/**
 * THE JOURNAL'S PIECES (the second wave of the Relay room, Sep 28 2026; AJ:
 * "all yes"): Write (the six types), the shelves, a typed note's template,
 * a hunch's evidence, the Studio shelf, the day logs and On this day. The
 * rules and the words are ./journal.ts and ./day-log.ts; NotesPanel and
 * NoteEditor place these. Everything here is private to its author except
 * what the author puts on the Studio shelf (a copy that never names a
 * client).
 */

export const TYPE_ICON: Record<NoteType, LucideIcon> = {
  client: UserRound,
  machine: Dumbbell,
  protocol: ListOrdered,
  research: BookMarked,
  trend: Lightbulb,
  personal: Sprout,
  team: Users,
};

const SHELF_ICON: Record<ShelfId, LucideIcon> = {
  clients: UserRound,
  machines: Dumbbell,
  protocol: ListOrdered,
  research: BookMarked,
  trends: Lightbulb,
  personal: Sprout,
  team: Users,
};

const sameView = (a: NotesView, b: NotesView) =>
  a.kind === b.kind && (a.kind !== "shelf" || a.shelf === (b as { shelf: ShelfId }).shelf);

/* ------------------------------------------------------------------ *
 * Write: the six types, three short lines each
 * ------------------------------------------------------------------ */

export function WriteRow({
  slotsFree,
  onWrite,
  disabled = false,
  leader = false,
}: {
  slotsFree: number;
  onWrite: (type: NoteType) => void;
  disabled?: boolean;
  /** Leads the studio: a note about a team member is offered too (Oct 2 2026). */
  leader?: boolean;
}) {
  const types = NOTE_TYPES.filter((t) => leader || !LEADER_NOTE_TYPES.includes(t));
  return (
    <div className="jn-write" role="group" aria-label="Write in your journal">
      <p className="jn-write__h">
        <Plus size={14} aria-hidden />
        Write <span className="jn-write__sub">{`${types.length === 7 ? "seven" : "six"} kinds, three short lines each`}</span>
      </p>
      <div className="jn-write__row">
        {types.map((type) => {
          const t = NOTE_TEMPLATES[type];
          const Icon = TYPE_ICON[type];
          const full = type === "trend" && slotsFree === 0;
          return (
            <button key={type} type="button" className="jn-type" disabled={disabled || full} onClick={() => onWrite(type)}>
              <span className="jn-type__h">
                <Icon size={15} aria-hidden />
                {t.label}
              </span>
              <span className="jn-type__tpl">
                {full ? `All ${HUNCH_SLOTS} hunch slots are in use: meet one's sample or retire one first.` : t.fields.map((f) => f.label).join(" · ")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The shelves
 * ------------------------------------------------------------------ */

export function ShelfNav({
  view,
  counts,
  openHunches,
  onView,
  leader = false,
}: {
  view: NotesView;
  counts: Record<ShelfId, number>;
  openHunches: number;
  onView: (view: NotesView) => void;
  /** Leads the studio: the Team shelf shows (and for anyone who already has notes on it). */
  leader?: boolean;
}) {
  const chip = (key: string, target: NotesView, label: string, Icon: LucideIcon, n: number | null, sub?: string) => (
    <button key={key} type="button" className="pn__view jn-shelf" aria-pressed={sameView(view, target)} onClick={() => onView(target)}>
      <Icon size={13} aria-hidden />
      {label}
      {sub && <span className="jn-shelf__sub">{sub}</span>}
      {n !== null && <span className="pn__view-n">{n}</span>}
    </button>
  );
  return (
    <nav className="pn__views jn-shelves" aria-label="Shelves">
      {SHELVES.filter((s) => s.id !== "team" || leader || counts.team > 0).map((s) =>
        chip(
          s.id,
          { kind: "shelf", shelf: s.id },
          s.label,
          SHELF_ICON[s.id],
          counts[s.id],
          s.id === "trends" ? `${openHunches} of ${HUNCH_SLOTS} slots in use` : undefined,
        ),
      )}
      {/* Day logs, On this day and the Studio shelf are the Journal's tabs, in the bar under the header (Oct 3 2026). */}
    </nav>
  );
}

/* ------------------------------------------------------------------ *
 * A typed note's template (in the editor)
 * ------------------------------------------------------------------ */

export function TemplateEditor({
  noteId,
  draft,
  onFields,
  onHunch,
  disabled,
  problem,
  teamNames = [],
}: {
  noteId: string;
  draft: NoteDraft;
  onFields: (fields: NoteDraft["fields"]) => void;
  onHunch: (hunch: NonNullable<NoteDraft["hunch"]>) => void;
  disabled: boolean;
  problem?: string;
  /** The team's names, in name order, for a Team member note's Who (Oct 2 2026). */
  teamNames?: readonly string[];
}) {
  const type = draft.noteType;
  if (!type) return null;
  const t = NOTE_TEMPLATES[type];
  const Icon = TYPE_ICON[type];
  const hunch = draft.hunch ?? { claim: "", how: "", need: 8, unit: "clients" as const };
  return (
    <section className="jn-tpl" aria-labelledby={`jn-tpl-${noteId}`}>
      <h3 className="ne__label jn-tpl__h" id={`jn-tpl-${noteId}`}>
        <Icon size={13} aria-hidden /> {t.label} note
      </h3>
      {type === "trend" ? (
        <>
          <label className="jn-field">
            <span className="jn-field__l">{t.fields[0].label}</span>
            <textarea
              className="jn-ta"
              rows={2}
              value={hunch.claim}
              maxLength={HUNCH_CLAIM_MAX}
              placeholder={t.fields[0].placeholder}
              disabled={disabled}
              onChange={(e) => onHunch({ ...hunch, claim: e.target.value })}
            />
          </label>
          <label className="jn-field">
            <span className="jn-field__l">{t.fields[1].label}</span>
            <textarea
              className="jn-ta"
              rows={2}
              value={hunch.how}
              maxLength={HUNCH_HOW_MAX}
              placeholder={t.fields[1].placeholder}
              disabled={disabled}
              onChange={(e) => onHunch({ ...hunch, how: e.target.value })}
            />
          </label>
          <div className="jn-field">
            <span className="jn-field__l">The sample that would show it</span>
            <span className="jn-sample">
              <input
                type="number"
                className="jn-num"
                min={1}
                max={HUNCH_NEED_MAX}
                inputMode="numeric"
                aria-label="How many"
                value={hunch.need}
                disabled={disabled}
                onChange={(e) => onHunch({ ...hunch, need: Math.max(1, Math.min(HUNCH_NEED_MAX, Math.trunc(Number(e.target.value) || 1))) })}
              />
              <span className="rk-seg jn-unit" role="group" aria-label="Of what">
                {(["clients", "sessions"] as const).map((u) => (
                  <button key={u} type="button" aria-pressed={hunch.unit === u} disabled={disabled} onClick={() => onHunch({ ...hunch, unit: u })}>
                    {u}
                  </button>
                ))}
              </span>
            </span>
            <span className="jn-hint">Until the evidence meets it, the hunch says "not enough data yet". It holds one of {HUNCH_SLOTS} slots until then.</span>
          </div>
        </>
      ) : (
        t.fields.map((f) =>
          type === "team" && f.key === "who" ? (
            <label key={f.key} className="jn-field">
              <span className="jn-field__l">{f.label}</span>
              <select
                className="jn-ta"
                value={draft.fields?.who ?? ""}
                disabled={disabled}
                onChange={(e) => onFields({ ...(draft.fields ?? {}), who: e.target.value })}
              >
                <option value="">{f.placeholder}</option>
                {[...new Set([...(draft.fields?.who ? [draft.fields.who] : []), ...teamNames])].map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
          <label key={f.key} className="jn-field">
            <span className="jn-field__l">{f.label}</span>
            <textarea
              className="jn-ta"
              rows={2}
              value={draft.fields?.[f.key] ?? ""}
              maxLength={NOTE_FIELD_MAX}
              placeholder={f.placeholder}
              disabled={disabled}
              onChange={(e) => onFields({ ...(draft.fields ?? {}), [f.key]: e.target.value })}
            />
          </label>
          ),
        )
      )}
      {problem && <p className="ne__problem">{problem}</p>}
      <p className="jn-private">
        <Lock size={13} aria-hidden />
        {t.vis}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * A hunch's evidence
 * ------------------------------------------------------------------ */

export function HunchPanel({
  hunch,
  clients,
  busy,
  onAdd,
  onRemove,
  onRetire,
}: {
  hunch: Hunch;
  /** The clients the note is about: a piece of evidence may name one (private, like the note). */
  clients: { id: string; name: string }[];
  busy: boolean;
  onAdd: (entry: HunchEvidence) => Promise<boolean>;
  onRemove: (entry: HunchEvidence) => void;
  onRetire: (retired: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const s = hunchState(hunch);
  const nameOf = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? "A client" : null);
  const add = async () => {
    const entry = evidenceEntry(text, clientId);
    if (!entry) return;
    if (await onAdd(entry)) {
      setText("");
      setClientId(null);
    }
  };
  return (
    <section className="jn-hunch" aria-label="The hunch's evidence">
      <p className={`jn-hunch__state${s?.ready ? " jn-hunch__state--ready" : ""}`}>
        {s?.ready ? <Check size={14} aria-hidden /> : <Lightbulb size={14} aria-hidden />}
        {hunchLine(s)}
      </p>
      {hunch.evidence.length > 0 && (
        <ul className="jn-evi">
          {hunch.evidence.map((e) => (
            <li key={e.id} className="jn-evi__item">
              <span className="jn-evi__t">
                {e.text}
                <span className="jn-evi__s">
                  {whenLabel(e.at)}
                  {e.clientId ? ` · ${nameOf(e.clientId)}` : ""}
                </span>
              </span>
              <button type="button" className="jn-icon-btn" aria-label={`Take back: ${e.text}`} disabled={busy} onClick={() => onRemove(e)}>
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!s?.retired && (
        <div className="jn-evi__add">
          <label className="jn-field">
            <span className="jn-field__l">Add evidence</span>
            <textarea className="jn-ta" rows={2} value={text} maxLength={NOTE_FIELD_MAX} placeholder="What you saw, and when." disabled={busy} onChange={(e) => setText(e.target.value)} />
          </label>
          {clients.length > 0 && (
            <span className="rk-chips" role="group" aria-label="About a client (optional)">
              {clients.map((c) => (
                <button key={c.id} type="button" className="rk-chip" aria-pressed={clientId === c.id} onClick={() => setClientId((v) => (v === c.id ? null : c.id))}>
                  {c.name}
                </button>
              ))}
            </span>
          )}
          <div className="jn-btns">
            <button type="button" className="pl__btn pl__btn--primary" disabled={busy || !text.trim()} onClick={() => void add()}>
              <Plus size={14} aria-hidden />
              Add evidence
            </button>
            <button type="button" className="pl__btn" disabled={busy} onClick={() => onRetire(true)}>
              <Archive size={14} aria-hidden />
              Retire
            </button>
          </div>
        </div>
      )}
      {s?.retired && (
        <div className="jn-btns">
          <button type="button" className="pl__btn" disabled={busy} onClick={() => onRetire(false)}>
            <RotateCcw size={14} aria-hidden />
            Open it again
          </button>
        </div>
      )}
      <p className="jn-private">
        <Lock size={13} aria-hidden />
        {s?.ready ? "Shared only if you write it up. The Studio shelf never names a client." : "Private to you until its sample is met."}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * The Studio shelf: putting a note there, and reading it
 * ------------------------------------------------------------------ */

export function StudioShelfCard({
  note,
  dirty,
  studioName,
  canWrite,
  onPut,
}: {
  note: Pick<TrainerNote, "noteType" | "fields" | "hunch" | "title" | "body">;
  /** Unsaved changes: the shelf takes what's saved. */
  dirty: boolean;
  studioName: string;
  /** May write at this studio's Playbook (writesForStudio). */
  canWrite: boolean;
  onPut: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const draft = useMemo(() => studioShelfDraft(note), [note]);
  if (!draft) return null;
  const put = async () => {
    setBusy(true);
    try {
      if (await onPut()) setDone(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="jn-studio" aria-label="The Studio shelf">
      <p className="jn-studio__h">
        <LibraryBig size={15} aria-hidden />
        {note.noteType === "trend" ? "Write it up for the Studio shelf" : "Put it on the Studio shelf"}
      </p>
      <p className="jn-studio__lede">
        A copy for everyone at {studioName}, in the Playbook. It never names a client: read it through before it goes.
      </p>
      <div className="jn-studio__draft">
        <span className="jn-studio__t">{draft.title}</span>
        {draft.situation && <span className="jn-studio__s">{draft.situation}</span>}
        {draft.worked && <span className="jn-studio__s">{draft.worked}</span>}
      </div>
      {done ? (
        <p className="jn-private">
          <Check size={13} aria-hidden />
          On the Studio shelf. Your note stays here, private to you.
        </p>
      ) : !canWrite ? (
        <p className="jn-private">Only someone who works at {studioName} can add to its shelf.</p>
      ) : dirty ? (
        <p className="jn-private">Save first: the shelf takes what's saved.</p>
      ) : (
        <div className="jn-btns">
          <button type="button" className="pl__btn pl__btn--primary" disabled={busy} onClick={() => void put()}>
            <BookOpenCheck size={14} aria-hidden />
            {busy ? "Putting it on the shelf…" : "Put it on the Studio shelf"}
          </button>
        </div>
      )}
    </section>
  );
}

export function StudioShelfList({
  entries,
  loading,
  selected,
  onOpen,
  todayKey,
}: {
  entries: PlaybookEntry[];
  loading: boolean;
  selected: string | null;
  onOpen: (id: string) => void;
  todayKey: string;
}) {
  const live = entries.filter((e) => !e.retiredAt);
  if (loading && live.length === 0) return <p className="pn__state">Loading the Studio shelf…</p>;
  if (live.length === 0)
    return (
      <div className="pl__empty">
        <p className="pl__empty-title">Nothing on the Studio shelf yet</p>
        <p className="pl__empty-body">Answers the team keeps, and machine or protocol notes someone puts here, gather on it. It never names a client.</p>
      </div>
    );
  return (
    <ul className="pn__list">
      {live.map((e) => {
        const worked = Object.keys(e.confirmations ?? {}).length;
        return (
          <li key={e.id}>
            <button type="button" className="pn__card" aria-current={selected === e.id ? "true" : undefined} onClick={() => onOpen(e.id)}>
              <span className="pn__card-top">
                <span className="pn__kind">Studio shelf</span>
                {staleness(e, todayKey).state === "stale" && <span className="pn__when">Still true?</span>}
              </span>
              <span className="pn__card-title">{e.title}</span>
              {e.worked && <span className="pn__card-excerpt">{excerpt(e.worked)}</span>}
              <span className="pn__card-foot">
                <span className="pn__card-clients">Kept by {e.authorName || "a teammate"}</span>
                {worked > 0 && <span className="pn__stage">Worked for {worked} {worked === 1 ? "trainer" : "trainers"}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function StudioShelfView({
  entry,
  mine,
  onConfirm,
  onBack,
}: {
  entry: PlaybookEntry;
  /** This trainer already said it worked for them. */
  mine: boolean;
  onConfirm: () => void;
  onBack?: () => void;
}) {
  return (
    <article className="jn-view" aria-label={`Studio shelf: ${entry.title}`}>
      {onBack && (
        <button type="button" className="ne__back" onClick={onBack}>
          Journal
        </button>
      )}
      <p className="ne__label jn-view__k">
        <LibraryBig size={13} aria-hidden /> Studio shelf
      </p>
      <h3 className="jn-view__t">{entry.title}</h3>
      <dl className="jn-dl">
        {entry.situation && (
          <div>
            <dt>The situation</dt>
            <dd>{entry.situation}</dd>
          </div>
        )}
        {entry.tried && (
          <div>
            <dt>What was tried</dt>
            <dd>{entry.tried}</dd>
          </div>
        )}
        <div>
          <dt>What worked</dt>
          <dd>{entry.worked}</dd>
        </div>
      </dl>
      <p className="jn-private">
        <Users size={13} aria-hidden />
        Shared with everyone at the studio. It never names a client. Kept by {entry.authorName || "a teammate"}.
      </p>
      <div className="jn-btns">
        <button type="button" className="pl__btn" aria-pressed={mine} disabled={mine} onClick={onConfirm}>
          <Check size={14} aria-hidden />
          {mine ? "You said it worked for you too" : "Worked for me too"}
        </button>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Day logs, and On this day
 * ------------------------------------------------------------------ */

export function DayLogList({
  logs,
  state,
  selected,
  onOpen,
}: {
  logs: DayLog[];
  state: "loading" | "ready" | "failed";
  selected: string | null;
  onOpen: (id: string) => void;
}) {
  if (state === "failed") return <p className="pn__state">Your day logs couldn't be loaded. Check your connection.</p>;
  if (state === "loading") return <p className="pn__state">Loading your day logs…</p>;
  if (logs.length === 0)
    return (
      <div className="pl__empty">
        <p className="pl__empty-title">No day logs yet</p>
        <p className="pl__empty-body">
          Choose what to carry, and save your day’s one line: both are on Today, the Journal’s first tab. A day log is yours alone, never shown to leaders.
        </p>
      </div>
    );
  return (
    <ul className="pn__list">
      {logs.map((l) => (
        <li key={l.id}>
          <button type="button" className="pn__card" aria-current={selected === l.id ? "true" : undefined} onClick={() => onOpen(l.id)}>
            <span className="pn__card-top">
              <span className="pn__kind">Day log</span>
            </span>
            <span className="pn__card-title">{dayLogHeading(l.day)}</span>
            {dayLogSummary(l) && <span className="pn__card-excerpt">{excerpt(dayLogSummary(l))}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DayLogView({ log, onBack }: { log: DayLog; onBack?: () => void }) {
  return (
    <article className="jn-view" aria-label={`Day log: ${dayLogHeading(log.day)}`}>
      {onBack && (
        <button type="button" className="ne__back" onClick={onBack}>
          Journal
        </button>
      )}
      <p className="ne__label jn-view__k">
        <CalendarDays size={13} aria-hidden /> Day log
      </p>
      <h3 className="jn-view__t">{dayLogHeading(log.day)}</h3>
      {log.carry.length > 0 && (
        <>
          <p className="jn-field__l">What you chose to carry</p>
          <ul className="jn-carry">
            {log.carry.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </>
      )}
      {log.facts.length > 0 && (
        <>
          <p className="jn-field__l">The day, in facts Journey saw</p>
          <p className="jn-draft">{log.facts.join(" ")}</p>
        </>
      )}
      {log.line && (
        <dl className="jn-dl">
          {log.line.what && (
            <div>
              <dt>What happened?</dt>
              <dd>{log.line.what}</dd>
            </div>
          )}
          {log.line.soWhat && (
            <div>
              <dt>So what?</dt>
              <dd>{log.line.soWhat}</dd>
            </div>
          )}
          {log.line.nowWhat && (
            <div>
              <dt>Now what?</dt>
              <dd>{log.line.nowWhat}</dd>
            </div>
          )}
        </dl>
      )}
      <p className="jn-private">
        <Lock size={13} aria-hidden />
        Private to you, never shown to leaders.
      </p>
    </article>
  );
}

export function OnThisDayList({
  notes,
  logs,
  logsState,
  todayKey,
  onOpenNote,
  onOpenLog,
}: {
  notes: { note: TrainerNote; day: string }[];
  logs: DayLog[];
  logsState: "loading" | "ready" | "failed";
  todayKey: string;
  onOpenNote: (id: string) => void;
  onOpenLog: (id: string) => void;
}) {
  const rows = [
    ...notes.map((n) => ({ key: `note:${n.note.id}`, day: n.day, title: n.note.title || "Untitled", kind: "Note", open: () => onOpenNote(n.note.id) })),
    ...logs.map((l) => ({ key: `log:${l.id}`, day: l.day, title: dayLogHeading(l.day), kind: "Day log", open: () => onOpenLog(l.id) })),
  ]
    .map((r) => ({ ...r, label: onThisDayLabel(r.day, todayKey) }))
    .filter((r) => r.label);
  return (
    <>
      <p className="pn__state jn-otd__lede">A month ago and a year ago, from your notes and day logs.</p>
      {logsState === "failed" && <p className="pn__state">Your day logs couldn't be loaded, so this may be missing some.</p>}
      {rows.length === 0 ? (
        logsState === "loading" ? (
          <p className="pn__state">Looking back…</p>
        ) : (
          <p className="pn__state">Nothing from a month ago or a year ago yet.</p>
        )
      ) : (
        <ul className="pn__list">
          {rows.map((r) => (
            <li key={r.key}>
              <button type="button" className="pn__card" onClick={r.open}>
                <span className="pn__card-top">
                  <span className="pn__kind">{r.kind}</span>
                  <span className="pn__when">{r.label}</span>
                </span>
                <span className="pn__card-title">{r.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
