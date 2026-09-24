/**
 * THE FOUR BANDS — what the record already knows, at the top of each pillar.
 *
 * Client codex, Sep 2026. Each FORD pillar opens with a band of facts that are
 * not FORD details but belong beside them:
 *
 *   Family      the emergency contact and the birthday, from the record
 *               (Mindbody's, for a linked client). Read only here.
 *   Occupation  the Work block: what the work does to the body, the job
 *               title, working or retired — edited here (Edit / Done), saved
 *               by the record's one Save bar with everything else.
 *   Recreation  Active outside the studio: how active, and what they do —
 *               edited the same way.
 *   Dreams      the why, from Goals & Focus, quoted in full; edited there.
 *
 * Two save models sit on one card, so the band says which is which: its
 * fields wait for the Save bar ("Not saved yet" until then), while a FORD
 * detail saves the moment it is added. Done only closes the editor; it never
 * saves. The bands write through `updateField` and nothing else — never a
 * whole client object.
 */
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Client } from "../../../types";
import { mindbodyIdOf } from "../../../lib/mindbody-id";
import { Btn, Chip, Chips, Eyebrow, cap, curly, dayKeyDate, monthDay, type Pronouns } from "../../client-codex/kit";
import { activitySentence, workSentence } from "../../client-life/life";
import { RecreationEditor, WorkEditor } from "../../client-life/LifeBaseline";

/** The form's value when it has one, else the saved one (the old LifeBaseline rule). */
function draftOf<K extends keyof Client>(formData: Partial<Client>, client: Client, key: K): Client[K] {
  return (key in formData ? formData[key] : client[key]) as Client[K];
}

/** Shown on a band whose fields wait for the Save bar. */
export const BAND_CAPTION =
  "Saved with the Save bar at the bottom, like the rest of the record. FORD details save the moment you add them.";

function Band({
  eyebrow,
  dirty,
  children,
}: {
  eyebrow: string;
  dirty?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="fordpg-band">
      <div className="fordpg-band__head">
        <Eyebrow>{eyebrow}</Eyebrow>
        {dirty ? <Chip tone="live">Not saved yet</Chip> : null}
      </div>
      {children}
    </div>
  );
}

/** A date of birth is a calendar day: its digits, never read through UTC. */
function birthdayLabel(dateOfBirth: string | null | undefined): string | null {
  const day = dayKeyDate((dateOfBirth ?? "").slice(0, 10));
  return day ? monthDay(day) : null;
}

/** Family: the emergency contact and the birthday, as the record has them. */
export function FamilyBand({ client, pronouns }: { client: Client; pronouns: Pronouns }) {
  const linked = !!mindbodyIdOf(client) && !client.provisional;
  const name = (client.emergencyContactName ?? "").trim();
  const relationship = (client.emergencyContactRelationship ?? "").trim();
  const birthday = birthdayLabel(client.dateOfBirth);
  const lines: string[] = [];
  if (name) lines.push(`Emergency contact: ${name}${relationship ? ` (${relationship})` : ""}`);
  if (birthday) lines.push(`${cap(pronouns.possessive)} birthday: ${birthday}`);
  return (
    <Band eyebrow={linked ? "From Mindbody" : "From the record"}>
      {lines.length ? (
        lines.map((line) => (
          <p key={line} className="fordpg-band__lede">
            {line}
          </p>
        ))
      ) : (
        <p className="fordpg-band__quiet">
          {linked ? "Mindbody has no emergency contact or birthday on file." : "No emergency contact or birthday on file."}
        </p>
      )}
      <p className="fordpg-band__src">
        {linked ? "Changes in Mindbody arrive with the next sync." : "Contact details are kept on Account."}
      </p>
    </Band>
  );
}

export interface EditableBandProps {
  client: Client;
  formData: Partial<Client>;
  updateField: (key: keyof Client, value: unknown) => void;
  /** Any of this band's fields unsaved. */
  dirty: boolean;
  /** The editor is open (the pillar's Edit / Done). */
  editing: boolean;
  /** The client's pronouns, for "from her record"; left out, "from the record". */
  pronouns?: Pronouns;
}

/** Occupation: the Work block. */
export function OccupationBand({ client, formData, updateField, dirty, editing, pronouns }: EditableBandProps) {
  const eyebrow = `Work · from ${pronouns ? pronouns.possessive : "the"} record`;
  if (editing) {
    return (
      <Band eyebrow="Work" dirty={dirty}>
        <WorkEditor client={client} formData={formData} updateField={updateField} />
        <p className="fordpg-band__src">{BAND_CAPTION}</p>
      </Band>
    );
  }
  const sentence = workSentence({
    occupation: (draftOf(formData, client, "occupation") as string) || "",
    workProfile: (draftOf(formData, client, "workProfile") as string | null | undefined) ?? null,
    isRetired: !!draftOf(formData, client, "isRetired"),
  });
  return (
    <Band eyebrow={eyebrow} dirty={dirty}>
      <p className="fordpg-band__lede">{sentence}</p>
    </Band>
  );
}

/** Recreation: Active outside the studio. */
export function RecreationBand({ client, formData, updateField, dirty, editing, pronouns }: EditableBandProps) {
  const eyebrow = `Active outside the studio · from ${pronouns ? pronouns.possessive : "the"} record`;
  if (editing) {
    return (
      <Band eyebrow="Active outside the studio" dirty={dirty}>
        <RecreationEditor client={client} formData={formData} updateField={updateField} />
        <p className="fordpg-band__src">{BAND_CAPTION}</p>
      </Band>
    );
  }
  const level = activitySentence(draftOf(formData, client, "activityLevel") as string | undefined);
  const what = ((draftOf(formData, client, "recreationActivities") as string[] | undefined) ?? [])
    .map((a) => a.trim())
    .filter(Boolean);
  return (
    <Band eyebrow={eyebrow} dirty={dirty}>
      <p className={level ? "fordpg-band__lede" : "fordpg-band__quiet"}>{level ?? "How active is not recorded yet."}</p>
      {what.length ? (
        <Chips>
          {what.map((a) => (
            <Chip key={a}>{a}</Chip>
          ))}
        </Chips>
      ) : null}
    </Band>
  );
}

/** Dreams: the why, from Goals & Focus, in the client's words. */
export function DreamsBand({
  why,
  pronouns,
  onOpenGoals,
}: {
  why: string | null | undefined;
  pronouns: Pronouns;
  onOpenGoals: () => void;
}) {
  const text = (why ?? "").trim();
  return (
    <Band eyebrow={`${cap(pronouns.possessive)} why · from Goals & Focus`}>
      {text ? (
        <p className="fordpg-band__lede fordpg-band__why">{curly(text)}</p>
      ) : (
        <p className="fordpg-band__quiet">No why on file yet.</p>
      )}
      <div>
        <Btn variant="quiet" iconEnd={ChevronRight} onClick={onOpenGoals}>
          Goals & Focus
        </Btn>
      </div>
    </Band>
  );
}
