import { useId } from "react";
import { cn } from "../../lib/utils";
import type { Client } from "../../types";
import { Picks, TextInput } from "../client-codex/kit";
import { ChipPicks, PickGroup } from "./controls";
import {
  ACTIVITY_LEVELS,
  FITNESS_BACKGROUNDS,
  JOB_TITLE_MAX,
  OCCUPATION_SUGGESTIONS,
  PEDIGREE_LEVELS,
  RECREATION_CHOICES,
  WORK_PROFILES,
  nextPedigreeHistory,
  pedigreeTrail,
  workProfileOf,
} from "./life";
import "./client-life.css";

/**
 * The structured half of a client's life: work, activity outside the studio,
 * and experience. All coach fields on the client record, all saved by the
 * record's ONE Save bar — these editors only call `updateField`. See life.ts
 * for the reasoning.
 *
 * Client codex, Sep 2026: three editors, mounted where each belongs.
 *   WorkEditor        FORD → Occupation (the Work band's Edit)
 *   RecreationEditor  FORD → Recreation (the Active band's Edit)
 *   ExperienceEditor  Body & Pulse → Training story (AJ's decision 6)
 * The job title is free text with suggestions now (it was a closed list that
 * showed any title typed elsewhere — ConsultationWizard, the client list — as
 * blank); the structured value is the work category, which a picked title
 * still maps onto. Retired is two picks, Working and Retired.
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

const STATUS_OPTIONS = [
  { value: "working", label: "Working" },
  { value: "retired", label: "Retired" },
] as const;

/** FORD → Occupation: what the work does to the body, the job title, working or retired. */
export function WorkEditor({ client, formData, updateField }: LifeBaselineProps) {
  const listId = useId();
  const occupation = (pick(formData, client, "occupation") as string) || "";
  const workProfile = (pick(formData, client, "workProfile") as string | undefined) || "";
  const isRetired = !!pick(formData, client, "isRetired");
  const derived = workProfileOf({ occupation, workProfile });

  return (
    <div className="clf-block">
      <PickGroup
        label="What the work does to the body"
        options={WORK_PROFILES.map((p) => ({ value: p.id, label: p.label }))}
        value={workProfile || (derived?.id ?? "")}
        // Tapping the category read from the job title CONFIRMS it; tapping a
        // confirmed one clears it back to the reading.
        onChange={(v) => updateField("workProfile", v || (workProfile ? null : derived?.id ?? null))}
      />
      {derived ? (
        <p className="clf-note">
          {derived.note}
          {!workProfile ? " (read from the job title — tap to confirm)" : ""}
        </p>
      ) : null}
      <div className="clf-two">
        <div className="clf-field">
          <TextInput
            label="Job title (optional)"
            value={occupation}
            list={listId}
            maxLength={JOB_TITLE_MAX}
            placeholder="e.g. Dental hygienist"
            onChange={(v) => updateField("occupation", v)}
            onBlur={(v) => {
              if (v !== v.trim()) updateField("occupation", v.trim());
            }}
          />
          <datalist id={listId}>
            {OCCUPATION_SUGGESTIONS.map((title) => (
              <option key={title} value={title} />
            ))}
          </datalist>
        </div>
        <Picks
          label="Status"
          options={STATUS_OPTIONS}
          value={isRetired ? "retired" : "working"}
          onChange={(v) => updateField("isRetired", v === "retired")}
        />
      </div>
      {isRetired ? <p className="clf-note">Retired keeps the previous work: forty years of it still shapes the body.</p> : null}
    </div>
  );
}

/** FORD → Recreation: how active outside the studio, and what they do. */
export function RecreationEditor({ client, formData, updateField }: LifeBaselineProps) {
  const activity = (pick(formData, client, "activityLevel") as string) || "";
  const recreation = (pick(formData, client, "recreationActivities") as string[] | undefined) || [];
  return (
    <div className="clf-block">
      <PickGroup
        label="How active outside the studio"
        options={ACTIVITY_LEVELS}
        value={activity as (typeof ACTIVITY_LEVELS)[number]["value"]}
        onChange={(v) => updateField("activityLevel", v)}
      />
      <ChipPicks
        label="What they do"
        choices={RECREATION_CHOICES}
        value={recreation}
        onChange={(v) => updateField("recreationActivities", v)}
        allowCustom
      />
      <p className="clf-note">The stories behind these — the golf trip, the pickleball league — are Recreation's details, below.</p>
    </div>
  );
}

/** Body & Pulse → Training story: where they came from, and how far they have come in the protocol. */
export function ExperienceEditor({ client, formData, updateField, authorName }: LifeBaselineProps) {
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
    <div className="clf-block">
      <ChipPicks
        label="Before Max Strength"
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

      <PickGroup
        label="Protocol mastery — moves up over time"
        options={PEDIGREE_LEVELS.map((l) => ({ value: l, label: l }))}
        value={pedigree}
        onChange={(v) => setPedigree(v)}
      />
      <p className="clf-note">{trail ?? "Each step up is dated when you save."}</p>

      <PickGroup
        label="Strength experience (sets suggested starting weights)"
        options={["Beginner", "Intermediate", "Advanced"].map((l) => ({ value: l, label: l }))}
        value={(pick(formData, client, "experienceLevel") as string) || ""}
        onChange={(v) => updateField("experienceLevel", v)}
      />
    </div>
  );
}
