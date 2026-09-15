import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Client } from "../../types";
import { OccupationSelect } from "../../components/OccupationSelect";
import {
  ACTIVITY_LEVELS,
  FITNESS_BACKGROUNDS,
  PEDIGREE_LEVELS,
  RECREATION_CHOICES,
  WORK_PROFILES,
  nextPedigreeHistory,
  pedigreeTrail,
  workProfileOf,
  workSentence,
} from "./life";
import "./client-life.css";

/**
 * The structured half of Life: work, activity outside the studio, and
 * experience. All coach fields, all saved by the record's Save bar.
 * See life.ts for the reasoning.
 */

export interface LifeBaselineProps {
  client: Client;
  formData: Partial<Client>;
  updateField: (key: keyof Client, value: unknown) => void;
  /** Who is signed in, for dating a protocol-mastery step. */
  authorName?: string | null;
}

/** The form's value when it has one, else the saved one. */
function pick<K extends keyof Client>(formData: Partial<Client>, client: Client, key: K): Client[K] {
  return (key in formData ? formData[key] : client[key]) as Client[K];
}

function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string; hint?: string }[];
  value: T | "" | null | undefined;
  onChange: (v: T | "") => void;
  label: string;
}) {
  return (
    <div className="clf-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={cn("clf-seg__opt", on && "clf-seg__opt--on")}
            // Tapping the chosen option again clears it: nothing is assessed
            // until someone says so.
            onClick={() => onChange(on ? "" : o.value)}
          >
            <span className="clf-seg__label">{o.label}</span>
            {o.hint && <span className="clf-seg__hint">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ChipSet({
  choices,
  value,
  onChange,
  label,
  allowCustom = false,
}: {
  choices: readonly string[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  label: string;
  allowCustom?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const set = new Set(value);
  const extras = value.filter((v) => !choices.includes(v));
  const toggle = (v: string) => onChange(set.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const add = () => {
    const v = draft.trim().replace(/\s+/g, " ");
    if (v && !set.has(v)) onChange([...value, v].slice(0, 24));
    setDraft("");
  };
  return (
    <div className="clf-chips" role="group" aria-label={label}>
      {[...choices, ...extras].map((c) => {
        const on = set.has(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            className={cn("clf-chip", on && "clf-chip--on")}
            onClick={() => toggle(c)}
          >
            {c}
            {on && !choices.includes(c) ? <X size={12} aria-hidden /> : null}
          </button>
        );
      })}
      {allowCustom && (
        <span className="clf-add">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Something else…"
            aria-label={`Add to ${label}`}
            maxLength={40}
          />
          <button type="button" onClick={add} disabled={!draft.trim()} aria-label="Add">
            <Plus size={14} />
          </button>
        </span>
      )}
    </div>
  );
}

export function WorkBaseline({ client, formData, updateField }: LifeBaselineProps) {
  const occupation = (pick(formData, client, "occupation") as string) || "";
  const workProfile = (pick(formData, client, "workProfile") as string | undefined) || "";
  const isRetired = !!pick(formData, client, "isRetired");
  const derived = workProfileOf({ occupation, workProfile });

  return (
    <div className="clf-block">
      <div className="clf-row">
        <span className="clf-kicker">Work</span>
        <span className="clf-sentence">{workSentence({ occupation, workProfile, isRetired })}</span>
      </div>
      <Seg
        label="What their work does to the body"
        options={WORK_PROFILES.map((p) => ({ value: p.id, label: p.label }))}
        value={workProfile || (derived?.id ?? "")}
        // Tapping the category read from the occupation CONFIRMS it; tapping a
        // confirmed one clears it back to the reading.
        onChange={(v) => updateField("workProfile", v || (workProfile ? null : derived?.id ?? null))}
      />
      {derived && <p className="clf-note">{derived.note}{!workProfile ? " (read from the occupation — tap to confirm)" : ""}</p>}
      <div className="clf-two">
        <div className="clf-field">
          <span className="clf-label">Job title (optional)</span>
          <OccupationSelect value={occupation} onChange={(v) => updateField("occupation", v)} />
        </div>
        <div className="clf-field">
          <span className="clf-label">Status</span>
          <button
            type="button"
            role="switch"
            aria-checked={isRetired}
            className={cn("clf-switch", isRetired && "clf-switch--on")}
            onClick={() => updateField("isRetired", !isRetired)}
          >
            <span>{isRetired ? "Retired — previous work kept" : "Working"}</span>
            <span className="clf-switch__track" aria-hidden>
              <span className="clf-switch__knob" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function ActivityExperienceBaseline({ client, formData, updateField, authorName }: LifeBaselineProps) {
  const activity = (pick(formData, client, "activityLevel") as string) || "";
  const recreation = (pick(formData, client, "recreationActivities") as string[] | undefined) || [];
  const background = (pick(formData, client, "fitnessBackground") as string[] | undefined) || [];
  const unteach = !!pick(formData, client, "needsUnteaching");
  const pedigree = (pick(formData, client, "trainingPedigree") as string) || "";
  const history = (pick(formData, client, "pedigreeHistory") as Client["pedigreeHistory"]) || client.pedigreeHistory || [];
  const trail = pedigreeTrail(history);

  const setPedigree = (level: string) => {
    updateField("trainingPedigree", level);
    updateField(
      "pedigreeHistory",
      level
        ? nextPedigreeHistory(client.pedigreeHistory, client.trainingPedigree, level, new Date().toISOString(), authorName || undefined)
        : client.pedigreeHistory ?? [],
    );
  };

  return (
    <>
      <div className="clf-block">
        <div className="clf-row">
          <span className="clf-kicker">Active outside the studio</span>
        </div>
        <Seg
          label="Activity outside the studio"
          options={ACTIVITY_LEVELS}
          value={activity as (typeof ACTIVITY_LEVELS)[number]["value"]}
          onChange={(v) => updateField("activityLevel", v)}
        />
        <ChipSet
          label="What they do"
          choices={RECREATION_CHOICES}
          value={recreation}
          onChange={(v) => updateField("recreationActivities", v)}
          allowCustom
        />
        <p className="clf-note">The stories behind these — the golf trip, the pickleball league — go in Recreation below.</p>
      </div>

      <div className="clf-block">
        <div className="clf-row">
          <span className="clf-kicker">Experience</span>
        </div>
        <span className="clf-label">Before Max Strength</span>
        <ChipSet
          label="Fitness background"
          choices={FITNESS_BACKGROUNDS}
          value={background}
          onChange={(v) => updateField("fitnessBackground", v)}
        />
        <button
          type="button"
          role="switch"
          aria-checked={unteach}
          className={cn("clf-switch", unteach && "clf-switch--on")}
          onClick={() => updateField("needsUnteaching", !unteach)}
        >
          <span>{unteach ? "Has habits to unteach" : "No habits to unteach noted"}</span>
          <span className="clf-switch__track" aria-hidden>
            <span className="clf-switch__knob" />
          </span>
        </button>

        <span className="clf-label">Protocol mastery — moves up over time</span>
        <Seg
          label="Protocol mastery"
          options={PEDIGREE_LEVELS.map((l) => ({ value: l, label: l }))}
          value={pedigree}
          onChange={(v) => setPedigree(v)}
        />
        {trail ? <p className="clf-note">{trail}</p> : <p className="clf-note">Each step up is dated when you save.</p>}

        <span className="clf-label">Strength experience (sets suggested starting weights)</span>
        <Seg
          label="Strength experience"
          options={["Beginner", "Intermediate", "Advanced"].map((l) => ({ value: l, label: l }))}
          value={(pick(formData, client, "experienceLevel") as string) || ""}
          onChange={(v) => updateField("experienceLevel", v)}
        />
      </div>
    </>
  );
}
