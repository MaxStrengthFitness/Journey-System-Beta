/**
 * THE LONG SCROLL'S SECTIONS, MOVED — the interim content of the codex pages.
 *
 * Client codex, Sep 2026 (the shell phase). The record tab stopped being one
 * scroll (ClientInfoSheet → ClientDossier) and became seven pages. The shell
 * ships before the pages are rebuilt, so the old sections' JSX lives here,
 * MOVED UNCHANGED from ClientDossier.tsx — Who they are, Life, Body, Goals and
 * Admin — minus the section frames (each page draws its own cards) and minus
 * the "Recovery between sessions" select, retired from every screen (AJ's
 * decision 7; the field stays on the record, nothing writes it).
 *
 * Each page area replaces its block with the real page in its own phase, and
 * the cleanup phase deletes this file. Until then it is a HOSTED file: the
 * codex's scale test counts its off-scale text sizes against a budget rather
 * than failing on them (kit/scale.test.ts, HOSTED_FILES).
 *
 * Every field writes through the shell's one record form (`updateField`),
 * and the Save bar saves them together.
 */
import { TrendingUp } from "lucide-react";
import { cn } from "../../../lib/utils";
import { mindbodyIdOf } from "../../../lib/mindbody-id";
import { waiverState } from "../../../lib/client-waiver";
import { clientLegalName } from "../../../lib/client-name";
import { ageFromDob, masterSyncLabel } from "../../client-profile/sync-label";
import { toDate } from "../../../types/journal";
import type { Client, Machine } from "../../../types";
import { ClinicalFlagPicker } from "../../clinical-flags/ClinicalFlagPicker";
import { BodyWatchOuts } from "../../clinical-flags/BodyWatchOuts";
import {
  FieldGroup,
  FieldLabel,
  ReadOnlyField,
  SelectField,
  TextAreaField,
  TextField,
} from "../../../components/client-dossier/DossierPrimitives";

/** The form's value and its setter, as every block takes them. */
export interface LegacyFieldProps {
  client: Client;
  formData: Partial<Client>;
  updateField: (key: keyof Client, value: unknown) => void;
}

/** A date of birth is a calendar day: read the digits, never through UTC. */
const fmtDob = (v: string) => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return v;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const fmtDate = (v: unknown, fallback = "—") => {
  const d = toDate(v as Parameters<typeof toDate>[0]);
  return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : fallback;
};

const valOf = (formData: Partial<Client>) => (k: keyof Client) => (formData[k] as string) ?? "";
const setOf = (updateField: LegacyFieldProps["updateField"]) => (k: keyof Client) => (v: string) => updateField(k, v);

/* ------------------------------------------------------------------ */
/* Account · Contact (was "Who they are")                              */
/* ------------------------------------------------------------------ */

/**
 * The client's ID card. Mindbody owns who a client is, so once a client is
 * linked every identity and contact field is READ-ONLY here and refreshes
 * with Master Sync at the top of the profile. The one thing a coach owns is
 * what the client is called on the floor.
 */
export function WhoTheyAreBlock({ client, formData, updateField }: LegacyFieldProps) {
  const val = valOf(formData);
  const set = setOf(updateField);
  const mbId = mindbodyIdOf(client);
  // Linked to Mindbody → Mindbody owns identity and contact (read-only here).
  const mbLinked = !!mbId && !client.provisional;
  const waiver = waiverState(client);
  const age = ageFromDob(client.dateOfBirth);
  const fullAddress = [
    client.address,
    [client.city, client.addressState].filter(Boolean).join(", "),
    [client.postalCode, client.country].filter(Boolean).join(" "),
  ]
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup title="Goes by" cols={2}>
        <TextField
          label="Nickname"
          value={val("nickname")}
          onChange={set("nickname")}
          placeholder="What they like to be called"
          hint="Replaces the first name in the profile header, the briefing and the session. The legal name stays on the record."
        />
        {mbLinked ? (
          <ReadOnlyField label="Legal name" value={clientLegalName(client)} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <TextField label="First name" value={val("firstName")} onChange={set("firstName")} />
            <TextField label="Last name" value={val("lastName")} onChange={set("lastName")} />
          </div>
        )}
      </FieldGroup>

      <FieldGroup title="Identity" cols={3}>
        {mbLinked ? (
          <>
            <ReadOnlyField
              label="Date of birth"
              value={
                client.dateOfBirth
                  ? `${fmtDob(client.dateOfBirth)}${age !== null ? ` · ${age}` : ""}`
                  : ""
              }
            />
            <ReadOnlyField label="Gender" value={client.gender || ""} />
          </>
        ) : (
          <>
            <TextField
              label="Date of birth"
              type="date"
              value={val("dateOfBirth")}
              onChange={set("dateOfBirth")}
              hint={age !== null ? `${age} years old` : undefined}
            />
            <SelectField
              label="Gender"
              value={val("gender")}
              onChange={set("gender")}
              options={["Male", "Female", "Other"]}
            />
          </>
        )}
        <ReadOnlyField label="Mindbody ID" value={mbId || ""} hint={mbId ? undefined : "Not linked to Mindbody."} />
      </FieldGroup>

      <FieldGroup title="Contact">
        {mbLinked ? (
          <>
            <ReadOnlyField label="Phone" value={client.phone || ""} />
            <ReadOnlyField label="Email" value={client.email || ""} />
            <div className="sm:col-span-2">
              <ReadOnlyField label="Address" value={fullAddress} />
            </div>
          </>
        ) : (
          <>
            <TextField label="Phone" value={val("phone")} onChange={set("phone")} />
            <TextField label="Email" type="email" value={val("email")} onChange={set("email")} />
            <div className="sm:col-span-2">
              <TextField label="Address" value={val("address")} onChange={set("address")} />
            </div>
          </>
        )}
      </FieldGroup>

      <FieldGroup title="Emergency contact" cols={3}>
        {mbLinked ? (
          <>
            <ReadOnlyField label="Name" value={client.emergencyContactName || ""} />
            <ReadOnlyField label="Relationship" value={client.emergencyContactRelationship || ""} />
            <ReadOnlyField label="Phone" value={client.emergencyContactPhone || ""} />
          </>
        ) : (
          <>
            <TextField
              label="Name"
              value={val("emergencyContactName")}
              onChange={set("emergencyContactName")}
            />
            <TextField
              label="Phone"
              value={val("emergencyContactPhone")}
              onChange={set("emergencyContactPhone")}
            />
          </>
        )}
      </FieldGroup>

      <FieldGroup title="Account" cols={3}>
        <ReadOnlyField
          label="Liability waiver"
          value={
            waiver.state === "unknown" ? (
              ""
            ) : (
              <span
                className={cn(
                  waiver.tone === "ok" && "text-emerald-700 dark:text-emerald-400",
                  waiver.tone === "warn" && "text-amber-700 dark:text-amber-400",
                )}
              >
                {waiver.label}
              </span>
            )
          }
          hint={waiver.detail}
        />
        <ReadOnlyField label="Membership status" value={client.mindbodyStatus || ""} />
        <ReadOnlyField label="In Mindbody since" value={fmtDate(client.mindbodyCreatedAt, "")} />
        <ReadOnlyField
          label="First appointment"
          value={fmtDate(client.firstAppointmentDate, "")}
        />
        <ReadOnlyField
          label="Visits at site"
          value={
            typeof client.clientsNumberOfVisitsAtSite === "number"
              ? String(client.clientsNumberOfVisitsAtSite)
              : ""
          }
          hint="Mindbody's count. Separate from this app's completed-session count."
        />
        <ReadOnlyField
          label="Last Master Sync"
          value={client.mindbodyMasterSyncedAt ? masterSyncLabel(client.mindbodyMasterSyncedAt).replace(/^Synced /, "") : ""}
          hint="Everything on this card refreshes with Sync at the top of the profile."
        />
      </FieldGroup>
    </div>
  );
}

/** The first 1,000 characters of the client's Mindbody account notes, read only. */
export function MindbodyNotesBlock({ client }: { client: Client }) {
  if (!client.mindbodyNotes) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel source="mindbody">Mindbody account notes</FieldLabel>
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100/70 p-4 pl-5 dark:border-slate-800 dark:bg-slate-950/40">
        <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] bg-sky-500" />
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">
          {client.mindbodyNotes}
        </p>
      </div>
      <p className="text-[10.5px] text-muted-foreground">
        First 1,000 characters of the client's Mindbody account notes. Edit them in
        Mindbody — the next sync brings the change here.
      </p>
    </div>
  );
}

/** Account · How they found us — the coach's text fields beside the contract. */
export function AcquisitionBlock({ formData, updateField }: Omit<LegacyFieldProps, "client">) {
  const val = valOf(formData);
  const set = setOf(updateField);
  return (
    <FieldGroup title="How they found us">
      <TextField label="Lead source" value={val("leadSource")} onChange={set("leadSource")} />
      <TextField
        label="Referred by"
        value={val("referredBy")}
        onChange={set("referredBy")}
        hint="Mindbody fills this if it is blank; your edit is never overwritten."
      />
    </FieldGroup>
  );
}

/* ------------------------------------------------------------------ */
/* Body & Pulse                                                        */
/* ------------------------------------------------------------------ */

/**
 * The watch-outs lead (client-profile audit: "highly visible, without
 * digging through paragraphs"), then the flags and the two medical fields.
 * The journal rail of injury and incident notes that followed them is drawn
 * by the page, outside the record lock (it is read only anyway).
 */
export function WatchOutsBlock({
  client,
  formData,
  updateField,
  machines,
}: LegacyFieldProps & { machines: Machine[] }) {
  const val = valOf(formData);
  const set = setOf(updateField);
  return (
    <div className="flex flex-col gap-6">
      <BodyWatchOuts
        flagIds={formData.clinicalFlags ?? client.clinicalFlags}
        machines={machines}
        hasMedicalText={!!(val("medicalHistory").trim() || val("clinicalNotes").trim())}
      />

      <div className="flex flex-col gap-2.5">
        <FieldLabel>Clinical flags</FieldLabel>
        <p className="text-[11px] text-muted-foreground">
          Flags show in the briefing, and the ones that name a machine appear on that
          machine in Programming, the machine window and the session.
        </p>
        <ClinicalFlagPicker
          value={formData.clinicalFlags || []}
          onChange={(next) => updateField("clinicalFlags", next)}
        />
      </div>

      <FieldGroup cols={1}>
        <TextAreaField
          label="Medical history"
          value={val("medicalHistory")}
          onChange={set("medicalHistory")}
          rows={7}
          placeholder="Surgeries, chronic conditions, anything a new coach must read before loading them."
        />
        <TextAreaField
          label="Contraindications & constraints"
          value={val("clinicalNotes")}
          onChange={set("clinicalNotes")}
          rows={5}
          placeholder="What the load has to work around. Specific movements, ranges or machines to avoid."
        />
      </FieldGroup>

    </div>
  );
}

/**
 * Height, wingspan and weight — the machine set-up inputs. (The "Recovery
 * between sessions" select that sat here is retired: decision 7.)
 */
export function BuildBlock({ formData, updateField }: Omit<LegacyFieldProps, "client">) {
  const val = valOf(formData);
  const set = setOf(updateField);
  return (
    <FieldGroup cols={3}>
      <TextField label="Height" value={val("height")} onChange={set("height")} placeholder={`e.g. 5'4"`} hint="Used for machine set-up suggestions." />
      <TextField
        label="Wingspan"
        value={val("wingspan")}
        onChange={set("wingspan")}
        placeholder={`inches, e.g. 66`}
        hint="Optional. Fingertip to fingertip, arms out. Sharpens set-up suggestions on rows, presses and pulldowns."
      />
      <TextField label="Weight" value={val("weight")} onChange={set("weight")} placeholder="lbs" />
    </FieldGroup>
  );
}

/**
 * The one line that keeps the Pulse and its filed reports joined. Count
 * first, because the number is what decides whether it is worth the tap.
 */
export function ReportsLinkBlock({ count, onOpenReports }: { count: number | null; onOpenReports: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenReports}
      className="inline-flex h-11 w-fit items-center gap-2 rounded-xl border border-border px-4 text-[11px] font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <TrendingUp className="h-3.5 w-3.5" />
      {count === null
        ? "Filed reports"
        : count === 0
          ? "No filed reports yet"
          : `${count} filed ${count === 1 ? "report" : "reports"}`}
      <span className="opacity-60">· Activity Archive</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Goals & Focus                                                       */
/* ------------------------------------------------------------------ */

export function CoachStrategyBlock({ formData, updateField }: Omit<LegacyFieldProps, "client">) {
  const val = valOf(formData);
  const set = setOf(updateField);
  return (
    <FieldGroup cols={1}>
      <TextAreaField
        label="Coach strategy"
        value={val("discoveryNotes")}
        onChange={set("discoveryNotes")}
        rows={3}
        placeholder="How do you coach this client? What cues land?"
      />
    </FieldGroup>
  );
}

/** Mindbody's client indexes, read only (the long-term goal first). */
export function MindbodyIndexesBlock({ client }: { client: Client }) {
  const longTermGoal =
    client.mindbodyIndexes?.LongtermGoal ||
    client.mindbodyIndexes?.LongTermGoal ||
    "";
  const otherIndexes = Object.entries(client.mindbodyIndexes || {}).filter(
    ([k]) => k !== "LongtermGoal" && k !== "LongTermGoal",
  );
  if (!longTermGoal && otherIndexes.length === 0) return null;
  return (
    <FieldGroup title="Mindbody client indexes">
      {longTermGoal && <ReadOnlyField label="Long-term goal" value={longTermGoal} />}
      {otherIndexes.map(([k, v]) => (
        <ReadOnlyField key={k} label={k} value={v} />
      ))}
    </FieldGroup>
  );
}
