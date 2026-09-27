import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Client } from "../../types";
import { NAME_SEARCH_PROPS } from "../../lib/name-search-input";
import { timeLabel } from "./check";
import {
  LAST_CLOCK_MINUTES,
  clockChoices,
  daysOf,
  defaultHours,
  outsideHours,
  rangeLabel,
  tidyForm,
  type WeekForm,
} from "./present";
import { MAX_NOTE, MAX_REGULARS, clockOf, minutesOf, newRegularId, type Regular, type WorkHours } from "./week";
import "./standing-week.css";

/**
 * THE WEEK EDITOR — a standing week, day by day (voice-review round, Sep 27
 * 2026). One editor, two doors: the trainer proposes their week with it on
 * My Profile, and a leader changes a proposal with it before agreeing it on
 * My Studio → Team.
 *
 * Controlled: the form lives with the screen, which saves it. Every time is
 * picked, never typed — a quarter-hour clock, and an end that can only come
 * after its start — so the editor cannot build a week the save would have to
 * drop. A regular's client comes from the studio's own roster.
 */

export interface WeekEditorProps {
  value: WeekForm;
  onChange: (next: WeekForm) => void;
  /** The studio's clients, for choosing a regular. */
  clients: Client[];
  /** The note's label: "Note for your studio leader" on My Profile. */
  noteLabel: string;
  disabled?: boolean;
}

const MAX_RANGES_A_DAY = 2;
const MATCHES_SHOWN = 8;

const clientName = (c: Pick<Client, "firstName" | "lastName">) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();

export function WeekEditor({ value, onChange, clients, noteLabel, disabled = false }: WeekEditorProps) {
  const [adding, setAdding] = useState<number | null>(null);
  // The rows below are value's own objects (daysOf filters, never copies),
  // so an edit finds its row by identity.
  const days = daysOf(value);
  const update = (next: Partial<WeekForm>) => onChange(tidyForm({ ...value, ...next }));

  const setRange = (old: WorkHours, next: WorkHours) =>
    update({ hours: value.hours.map((h) => (h === old ? next : h)) });
  const setFrom = (h: WorkHours, from: string) => {
    // An end the new start has passed moves with it, keeping the range's length.
    const start = minutesOf(from)!;
    const end = minutesOf(h.to)!;
    const to = end > start ? h.to : clockOf(Math.min(start + (end - minutesOf(h.from)!), LAST_CLOCK_MINUTES));
    setRange(h, { ...h, from, to });
  };

  return (
    <div className="stw" aria-disabled={disabled || undefined}>
      {days.map((day) => {
        const outOfRegulars = value.regulars.length >= MAX_REGULARS;
        return (
          <section key={day.weekday} className="stw-day" aria-label={day.name}>
            <h3 className="stw-day__name">{day.name}</h3>
            <div className="stw-day__body">
              <div className="stw-hours">
                {day.hours.length === 0 && <span className="stw-quiet">Not in</span>}
                {day.hours.map((h, i) => (
                  <div key={i} className="stw-range">
                    <select
                      className="stw-select"
                      aria-label={`${day.name}: starts`}
                      value={h.from}
                      disabled={disabled}
                      onChange={(e) => setFrom(h, e.target.value)}
                    >
                      {clockChoices({ keep: h.from }).filter((c) => minutesOf(c)! < LAST_CLOCK_MINUTES).map((c) => (
                        <option key={c} value={c}>
                          {timeLabel(c)}
                        </option>
                      ))}
                    </select>
                    <span className="stw-dash" aria-hidden>
                      –
                    </span>
                    <select
                      className="stw-select"
                      aria-label={`${day.name}: ends`}
                      value={h.to}
                      disabled={disabled}
                      onChange={(e) => setRange(h, { ...h, to: e.target.value })}
                    >
                      {clockChoices({ after: h.from, keep: h.to }).map((c) => (
                        <option key={c} value={c}>
                          {timeLabel(c)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="stw-x"
                      aria-label={`Remove ${day.name}, ${rangeLabel(h)}`}
                      disabled={disabled}
                      onClick={() => update({ hours: value.hours.filter((x) => x !== h) })}
                    >
                      <X size={16} aria-hidden />
                    </button>
                  </div>
                ))}
                {day.hours.length < MAX_RANGES_A_DAY && (
                  <button
                    type="button"
                    className="stw-add"
                    disabled={disabled}
                    aria-label={day.hours.length === 0 ? `Add hours on ${day.name}` : `Add more hours on ${day.name}`}
                    onClick={() => update({ hours: [...value.hours, defaultHours(value, day.weekday)] })}
                  >
                    <Plus size={15} aria-hidden />
                    {day.hours.length === 0 ? "Hours" : "More hours"}
                  </button>
                )}
              </div>

              {day.regulars.length > 0 && (
                <ul className="stw-regulars" aria-label={`Regulars on ${day.name}`}>
                  {day.regulars.map((r) => (
                    <li key={r.id} className="stw-regular">
                      <select
                        className="stw-select"
                        aria-label={`${r.clientName}'s time on ${day.name}`}
                        value={r.start}
                        disabled={disabled}
                        onChange={(e) => update({ regulars: value.regulars.map((x) => (x.id === r.id ? { ...x, start: e.target.value } : x)) })}
                      >
                        {clockChoices({ keep: r.start }).map((c) => (
                          <option key={c} value={c}>
                            {timeLabel(c)}
                          </option>
                        ))}
                      </select>
                      <span className="stw-regular__name">{r.clientName || "A client"}</span>
                      {outsideHours(value, r) && <span className="stw-note-chip">Outside the day's hours</span>}
                      <button
                        type="button"
                        className="stw-x"
                        aria-label={`Remove ${r.clientName || "this regular"} from ${day.name}`}
                        disabled={disabled}
                        onClick={() => update({ regulars: value.regulars.filter((x) => x.id !== r.id) })}
                      >
                        <X size={16} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {adding === day.weekday ? (
                <RegularAdder
                  dayName={day.name}
                  defaultStart={day.hours[0]?.from ?? "08:00"}
                  clients={clients}
                  taken={day.regulars}
                  onCancel={() => setAdding(null)}
                  onAdd={(start, client) => {
                    const regular: Regular = {
                      id: newRegularId(value.regulars),
                      weekday: day.weekday,
                      start,
                      clientId: client.id!,
                      clientName: clientName(client),
                    };
                    update({ regulars: [...value.regulars, regular] });
                    setAdding(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="stw-add"
                  disabled={disabled || outOfRegulars}
                  aria-label={`Add a regular on ${day.name}`}
                  onClick={() => setAdding(day.weekday)}
                >
                  <Plus size={15} aria-hidden />
                  Regular
                </button>
              )}
            </div>
          </section>
        );
      })}

      {value.regulars.length >= MAX_REGULARS && (
        <p className="stw-hint">A week holds up to {MAX_REGULARS} regulars.</p>
      )}

      <label className="stw-note">
        <span className="stw-note__label">{noteLabel}</span>
        <textarea
          className="stw-textarea"
          value={value.note}
          maxLength={MAX_NOTE}
          rows={2}
          disabled={disabled}
          placeholder="Anything the week doesn't show: “Back from vacation Nov 3”, “Mornings only until December”."
          onChange={(e) => update({ note: e.target.value })}
        />
      </label>
    </div>
  );
}

/** Add a regular: a time, then a client from the studio's roster. */
function RegularAdder({
  dayName,
  defaultStart,
  clients,
  taken,
  onAdd,
  onCancel,
}: {
  dayName: string;
  defaultStart: string;
  clients: Client[];
  taken: Regular[];
  onAdd: (start: string, client: Client) => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState(defaultStart);
  const [term, setTerm] = useState("");
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = useMemo(() => {
    const typed = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (typed.length === 0) return [];
    const takenIds = new Set(taken.map((r) => r.clientId));
    return clients
      .filter((c) => c.id && !takenIds.has(c.id) && c.isActive !== false)
      .filter((c) => {
        const name = clientName(c).toLowerCase();
        return name !== "" && typed.every((w) => name.includes(w));
      })
      .sort((a, b) => clientName(a).localeCompare(clientName(b)))
      .slice(0, MATCHES_SHOWN);
  }, [clients, term, taken]);

  return (
    <div className="stw-adder" role="group" aria-label={`Add a regular on ${dayName}`}>
      <div className="stw-adder__row">
        <select className="stw-select" aria-label={`Time on ${dayName}`} value={start} onChange={(e) => setStart(e.target.value)}>
          {clockChoices({ keep: start }).map((c) => (
            <option key={c} value={c}>
              {timeLabel(c)}
            </option>
          ))}
        </select>
        <input
          className="stw-input"
          type="search"
          value={term}
          autoFocus
          placeholder="Client's name"
          aria-label={`Find the client for ${dayName}`}
          onChange={(e) => setTerm(e.target.value)}
          {...NAME_SEARCH_PROPS}
        />
        <button type="button" className="stw-add" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {words.length === 0 ? (
        <p className="stw-hint">Type a name to find the client at this studio.</p>
      ) : matches.length === 0 ? (
        <p className="stw-hint">No client by that name at this studio{taken.length > 0 ? " who isn't already a regular that day" : ""}.</p>
      ) : (
        <div className="stw-picks" role="group" aria-label="Matching clients">
          {matches.map((c) => (
            <button key={c.id} type="button" className="stw-pick" onClick={() => onAdd(start, c)}>
              {clientName(c)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
