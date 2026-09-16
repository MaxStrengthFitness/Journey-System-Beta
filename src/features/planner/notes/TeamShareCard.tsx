import { useState } from "react";
import { Users } from "lucide-react";
import type { Trainer } from "../../../types";
import { PeoplePicker, Seg } from "../kit";
import { dayWords } from "../jobs/jobs";
import type { ClientStudioCheck } from "./hooks";
import { expiryChoices, SHARE_MESSAGE_MAX, teamShareSentence, type SharePerson, type TeamShare } from "./team-share";

/**
 * SHARE WITH COLLEAGUES — the second half of Publish in a note.
 *
 * Round: Planner rework, Sep 2026. Rules and reasoning in ./team-share.ts.
 * Part of the draft: nothing is shared until the note is saved, and switching
 * it off and saving takes the copy down at once.
 */

/** Everyone who works at (or runs) a studio, but not the author or a placeholder profile. */
export function peopleAtStudio(trainers: Trainer[], studioId: string | null | undefined, meUid: string | null): SharePerson[] {
  if (!studioId) return [];
  return trainers
    .filter(
      (t) =>
        Boolean(t.id) &&
        t.id !== meUid &&
        (t as { isActive?: boolean }).isActive !== false &&
        !t.supersededByUid &&
        !t.pendingClaim &&
        (t.primaryHomeStudioId === studioId ||
          (t.accessibleStudioIds ?? []).includes(studioId) ||
          (t.activeGuestStudioIds ?? []).includes(studioId) ||
          (t.ownedStudioIds ?? []).includes(studioId)),
    )
    .map((t) => ({ id: t.id, name: t.fullName?.trim() || "A trainer" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function TeamShareCard({
  value,
  savedValue,
  onChange,
  studio,
  people,
  canShareHere,
  clientCheck,
  clientCount,
  todayKey,
  disabled,
  problem,
}: {
  value: TeamShare | null;
  savedValue: TeamShare | null;
  onChange: (next: TeamShare | null) => void;
  /** Where a new share goes: the studio the trainer is standing in. */
  studio: { id: string; name: string } | null;
  people: SharePerson[];
  canShareHere: boolean;
  clientCheck: ClientStudioCheck;
  clientCount: number;
  todayKey: string;
  disabled?: boolean;
  problem?: string;
}) {
  const on = Boolean(value);
  const [pickDate, setPickDate] = useState(false);
  const at = value ? { id: value.studioId, name: value.studioName || studio?.name || "the studio" } : studio;
  const blocked = !studio ? "Choose a studio first." : !canShareHere ? `You don't work at ${studio.name}, so you can't share notes there.` : null;
  const days = (key: string) => dayWords(key, todayKey);

  const turnOn = () => {
    if (!studio) return;
    onChange(
      savedValue ?? {
        studioId: studio.id,
        studioName: studio.name,
        audience: "people",
        people: [],
        expiresOn: null,
        message: "",
      },
    );
  };

  const set = (patch: Partial<TeamShare>) => value && onChange({ ...value, ...patch });

  return (
    <section className={`ne__share ne__team${on ? " ne__share--on" : ""}`} aria-labelledby="ne-team-title">
      <div className="ne__share-head">
        <Users size={16} aria-hidden />
        <h3 className="ne__share-title" id="ne-team-title">
          Share with colleagues{on && at ? ` at ${at.name}` : ""}
        </h3>
        <button
          type="button"
          role="switch"
          className="ne__switch"
          aria-checked={on}
          aria-labelledby="ne-team-title"
          disabled={disabled || (!on && Boolean(blocked))}
          onClick={() => (on ? onChange(null) : turnOn())}
        >
          <span className="ne__switch-knob" aria-hidden />
        </button>
      </div>

      {!on ? (
        <p className="ne__share-body">
          {savedValue
            ? "Saving takes it off your colleagues' Notes. It stays here, private to you."
            : blocked ??
              "Hand it over for a vacation or a cover, or give the whole team a plan to follow. They read it in their Notes; only you can change it."}
        </p>
      ) : (
        value && (
          <div className="ne__team-body">
            <Seg
              label="Who"
              value={value.audience}
              options={[
                { value: "people", label: "Specific people" },
                { value: "team", label: `Everyone at ${at?.name ?? "the studio"}` },
              ]}
              onChange={(audience) => set({ audience })}
            />

            {value.audience === "people" && (
              <PeoplePicker
                label="Share with"
                people={people}
                selected={value.people}
                onChange={(sel) => set({ people: sel })}
                emptyText="Nobody else works at this studio yet."
                max={20}
              />
            )}

            <div className="ne__team-row">
              <span className="ne__label">For how long</span>
              <div className="pk-chips" role="group" aria-label="For how long">
                {expiryChoices(todayKey).map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    className="pk-chip"
                    aria-pressed={!pickDate && value.expiresOn === c.expiresOn}
                    onClick={() => {
                      setPickDate(false);
                      set({ expiresOn: c.expiresOn });
                    }}
                  >
                    {c.label}
                  </button>
                ))}
                <button type="button" className="pk-chip" aria-pressed={pickDate} onClick={() => setPickDate(true)}>
                  Pick a date
                </button>
              </div>
              {pickDate && (
                <input
                  type="date"
                  className="pk-input ne__team-date"
                  min={todayKey}
                  value={value.expiresOn ?? ""}
                  onChange={(e) => set({ expiresOn: e.target.value || null })}
                  aria-label="Last day it's shared"
                />
              )}
            </div>

            <label className="ne__team-row">
              <span className="ne__label">A line for them (optional)</span>
              <input
                className="pk-input"
                value={value.message}
                maxLength={SHARE_MESSAGE_MAX}
                placeholder="Covering my Tuesdays while I'm away — follow week 2."
                onChange={(e) => set({ message: e.target.value })}
              />
            </label>

            {clientCount > 0 && clientCheck !== "ok" && (
              <p className={clientCheck === "checking" ? "ne__hint" : "ne__warn"} role="note">
                {clientCheck === "checking"
                  ? "Checking the clients this note is about…"
                  : clientCheck === "elsewhere"
                    ? `A client this note names is coached at another studio, so ${at?.name ?? "this studio"}'s team can't see them. Unlink them, or share from their studio.`
                    : "Couldn't confirm where every client this note names is coached — try again when the connection is back."}
              </p>
            )}

            <p className="ne__share-body">{teamShareSentence(value, { dayWords: days, saved: Boolean(savedValue) })}</p>
          </div>
        )
      )}
      {problem && <p className="ne__problem">{problem}</p>}
    </section>
  );
}
