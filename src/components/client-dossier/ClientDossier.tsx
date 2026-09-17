/**
 * THE CLIENT DOSSIER — the whole client, in one scroll.
 *
 * Originally this replaced the six-tab Client Information modal with one
 * spine. In the profile merge (Sep 2026) it absorbed the Journal tab as well,
 * so it is now the client's entire non-training record: who they are, their
 * life, their body, their goals, the coaching focus, every note, the reports,
 * and the admin.
 *
 * Why one spine: a coach walking to the floor thinks "tell me about Judy", not
 * "which tab is her A-Fib in". Tabs made every fact conditional on already
 * knowing where it lived, and split data that belongs together — a surgery is
 * a medical fact AND a date AND the reason her load is capped. The nav is
 * demoted from a switch to a jump list for when you already know where you
 * are going.
 *
 * Four things carry the design:
 *   1. The snapshot bar never scrolls away. Liability, contract and critical
 *      notes are the facts that must not be a scroll away.
 *   2. Provenance is in the control. An input means you own it; a read-only
 *      block means Mindbody or the Journal does. See DossierPrimitives.
 *   3. ONE copy of everything. The per-section journal rails are gone except
 *      on Body, where a limitation noticed mid-session is safety information
 *      and belongs beside the clinical fields. Everything else is read in
 *      Notes, which is the single timeline. See the note on DOSSIER_SECTIONS
 *      in types/journal.ts for what moved and what was deleted.
 *   4. The journal areas are mounted with the journal ALREADY LOADED and
 *      passed in, so three sections of journal UI cost one set of Firestore
 *      listeners rather than three.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Heart,
  HeartPulse,
  NotebookPen,
  Settings2,
  Target,
  TrendingUp,
  User,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useScrollerPad } from "../../features/client-profile/use-scroller-pad";
import { mindbodyIdOf } from "../../lib/mindbody-id";
import { waiverState } from "../../lib/client-waiver";
import { clientLegalName } from "../../lib/client-name";
import { ageFromDob, masterSyncLabel } from "../../features/client-profile/sync-label";
import { useClientJournal } from "../../hooks/useClientJournal";
import {
  DOSSIER_SECTIONS,
  toDate,
  type DossierSection,
} from "../../types/journal";
import type {
  Client,
  Machine,
  ProgressReport,
  Studio,
  Trainer,
} from "../../types";
import { WorkBaseline, ActivityExperienceBaseline } from "../../features/client-life/LifeBaseline";
import { ClinicalFlagPicker } from "../../features/clinical-flags/ClinicalFlagPicker";
import { BodyWatchOuts } from "../../features/clinical-flags/BodyWatchOuts";
import { ContractPanel } from "../../features/client-admin/ContractPanel";
import { InBodyCard } from "../../features/inbody/InBodyCard";
import { SharedNotesCard } from "../../features/relay/notes/SharedNotesCard";
import { ClientJotStrip } from "../../features/relay/notes/ClientJotStrip";
import { ClientSnapshot } from "./ClientSnapshot";
import { JournalRail } from "./JournalRail";
import { ClientJournalTab } from "../journal/ClientJournalTab";
import { FordSection } from "../../features/ford/FordSection";
import { GoalsPanel } from "../../features/goals/GoalsPanel";
import type { FordAuthor } from "../../features/ford/ford-write";
import {
  DossierSectionShell,
  FieldGroup,
  FieldLabel,
  ReadOnlyField,
  SelectField,
  TextAreaField,
  TextField,
} from "./DossierPrimitives";

const SECTION_ICONS: Record<DossierSection, React.ReactNode> = {
  general: <User className="h-5 w-5" />,
  life: <Heart className="h-5 w-5" />,
  medical: <HeartPulse className="h-5 w-5" />,
  goals: <Target className="h-5 w-5" />,
  focus: <Crosshair className="h-5 w-5" />,
  notes: <NotebookPen className="h-5 w-5" />,
  reports: <TrendingUp className="h-5 w-5" />,
  admin: <Settings2 className="h-5 w-5" />,
};

/** Read the blurb by id rather than by array position — the order has changed
 *  twice now, and `DOSSIER_SECTIONS[1].blurb` was silently wrong both times. */
const sectionBlurb = (id: DossierSection) =>
  DOSSIER_SECTIONS.find((s) => s.id === id)?.blurb ?? "";

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

const fmtDate = (v: any, fallback = "—") => {
  const d = toDate(v);
  return d
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : fallback;
};

export interface ClientDossierProps {
  client: Client;
  formData: Partial<Client>;
  updateField: (key: keyof Client, value: any) => void;
  studios: Studio[];
  machines?: Machine[];
  trainers?: Trainer[];
  defaultSection?: DossierSection;
  onOpenJournal?: () => void;
  onOpenReports?: () => void;
  /** Signed-in coach, for writing FORD details. Omit and the Life hub is read-only. */
  fordAuthor?: FordAuthor | null;
  /** The report shelf, handed straight to the Reports section. */
  progressReports?: ProgressReport[];
  onSelectReport?: (id: string) => void;
  onDeleteReport?: (report: ProgressReport) => void;
  onNewReport?: () => void;
  /**
   * "inner" (default, the full-screen overlay): the spine is its own
   * scroll container. "page" (the Details tab): the spine has no scroller
   * of its own — the page scrolls, and the jump rail sticks alongside it.
   */
  scroll?: "inner" | "page";
  /** Who is signed in: decides whether the InBody card offers "Add scan". */
  authTrainer?: Trainer | null;
  /** Switch to the Planner — "Write a plan" on Goals → Plans from the team. */
  onOpenPlanner?: () => void;
}

export function ClientDossier({
  client,
  formData,
  updateField,
  studios,
  machines = [],
  trainers = [],
  defaultSection,
  onOpenJournal,
  onOpenReports,
  fordAuthor = null,
  progressReports = [],
  onSelectReport,
  onDeleteReport,
  onNewReport,
  scroll = "inner",
  authTrainer = null,
  onOpenPlanner,
}: ClientDossierProps) {
  const pageScroll = scroll === "page";
  const railRef = useRef<HTMLElement | null>(null);
  useScrollerPad(railRef, pageScroll);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState<DossierSection>(
    defaultSection || "general",
  );

  // Loaded ONCE here and handed to each journal section below. Three areas
  // of journal UI, one set of listeners.
  const journal = useClientJournal({
    clientId: client.id || null,
    client,
    trainers,
  });
  const { entries, criticalEntries } = journal;

  const noop = useCallback(() => {}, []);

  /* --- scroll spy ---------------------------------------------------- */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (records) => {
        // Bias toward whichever qualifying section is highest in the pane, so
        // the nav marks what you are reading rather than what just left.
        const visible = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.getAttribute("data-dossier-section");
        if (id) setActiveSection(id as DossierSection);
      },
      // A null root means the viewport, which is the scroller in page mode.
      { root: pageScroll ? null : root, rootMargin: "0px 0px -65% 0px", threshold: 0 },
    );

    root
      .querySelectorAll("[data-dossier-section]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pageScroll]);

  const jump = useCallback((section: DossierSection) => {
    const el = document.getElementById(`dossier-${section}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(section);
  }, []);

  // Land on the requested section once, without fighting the scroll spy.
  useEffect(() => {
    if (!defaultSection || defaultSection === "general") return;
    const t = window.setTimeout(() => jump(defaultSection), 80);
    return () => window.clearTimeout(t);
  }, [defaultSection, jump]);

  /* --- derived ------------------------------------------------------- */
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
  const longTermGoal =
    client.mindbodyIndexes?.LongtermGoal ||
    client.mindbodyIndexes?.LongTermGoal ||
    "";
  const otherIndexes = Object.entries(client.mindbodyIndexes || {}).filter(
    ([k]) => k !== "LongtermGoal" && k !== "LongTermGoal",
  );

  /* `client.events` is no longer edited here. It is read as FORD entries in
     the Life section (features/ford/ford-rollup.ts), so the array stays on the
     record untouched and there is one dated timeline instead of two. */


  const val = (k: keyof Client) => (formData[k] as string) ?? "";
  const set = (k: keyof Client) => (v: string) => updateField(k, v);

  /* --- render --------------------------------------------------------- */
  return (
    <div className={cn("flex flex-col", !pageScroll && "min-h-0 flex-1")}>
      <ClientSnapshot client={client} criticalEntries={criticalEntries} onJump={jump} />

      <div className={cn("flex flex-col md:flex-row", !pageScroll && "min-h-0 flex-1")}>
        {/* jump list — a shortcut, not a switch. In page mode it sticks:
            the spine is now as long as the page, and a jump list that
            scrolls away at section two is no shortcut at all. */}
        <nav
          ref={railRef}
          aria-label="Dossier sections"
          style={pageScroll ? { top: "var(--scroll-pad-top, 0px)" } : undefined}
          className={cn(
            "shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950 md:w-52 md:border-b-0 md:border-r md:px-3 md:py-5 lg:w-56",
            pageScroll && "md:sticky md:self-start md:max-h-dvh md:overflow-y-auto",
          )}
        >
          <span className="mb-2 hidden px-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground md:block">
            Jump to
          </span>
          <ul className="no-scrollbar flex flex-row gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {DOSSIER_SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0 md:shrink">
                <button
                  type="button"
                  onClick={() => jump(s.id)}
                  aria-current={activeSection === s.id ? "true" : undefined}
                  className={cn(
                    "flex h-10 w-full items-center gap-2.5 whitespace-nowrap rounded-lg border-l-2 px-3 text-[11px] font-black uppercase tracking-widest transition-all",
                    activeSection === s.id
                      ? "border-l-[#38BDF8] bg-[#38BDF8]/10 text-[#38BDF8]"
                      : "border-l-transparent text-muted-foreground hover:bg-slate-200/60 hover:text-slate-800 dark:hover:bg-slate-800/60 dark:hover:text-slate-200",
                  )}
                >
                  <span className="shrink-0 opacity-70">{SECTION_ICONS[s.id]}</span>
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* the spine */}
        <div
          ref={scrollRef}
          className={cn(
            "flex-1 bg-card",
            pageScroll ? "min-w-0" : "min-h-0 overflow-y-auto",
          )}
        >
          <div
            className={cn(
              "mx-auto flex max-w-4xl flex-col gap-9 px-5 py-7 md:px-9",
              pageScroll ? "pb-10 [&_[data-dossier-section]]:scroll-mt-4" : "pb-28",
            )}
          >

            {/* ---------------- WHO THEY ARE ---------------- */}
            {/* The client's ID card (client-profile audit, Sep 2026). Mindbody
                owns who a client is, so once a client is linked every identity
                and contact field is READ-ONLY here and refreshes with Master
                Sync at the top of the profile. The one thing a coach owns is
                what the client is called on the floor. */}
            <DossierSectionShell
              id="general"
              title="Who they are"
              blurb={sectionBlurb("general")}
              icon={SECTION_ICONS.general}
            >
              <FieldGroup title="Goes by" cols={2}>
                <TextField
                  label="Nickname"
                  value={val("nickname")}
                  onChange={set("nickname")}
                  placeholder={client.firstName ? `e.g. what ${client.firstName} likes to be called` : "What they like to be called"}
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

              {client.mindbodyNotes && (
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
              )}

            </DossierSectionShell>

            {/* ---------------- LIFE (FORD) ---------------- */}
            <DossierSectionShell
              id="life"
              title="Life"
              blurb={sectionBlurb("life")}
              icon={SECTION_ICONS.life}
            >
              {/* The structured baseline first (client-profile audit, Sep
                  2026): what their work does to the body, how active they are
                  outside the studio, and where they came from — facts a
                  leader can count across a studio. The stories follow in
                  FORD. features/client-life/. */}
              <WorkBaseline
                client={client}
                formData={formData}
                updateField={updateField}
                authorName={authTrainer?.fullName}
              />
              <ActivityExperienceBaseline
                client={client}
                formData={formData}
                updateField={updateField}
                authorName={authTrainer?.fullName}
              />

              {fordAuthor ? (
                <FordSection client={client} author={fordAuthor} machines={machines} />
              ) : null}

              {/* Personal notes written before FORD existed. Read-only here
                  and quiet: the composer no longer creates them, so this
                  shrinks to nothing on its own over time. */}
              <JournalRail
                section="life"
                entries={entries}
                machines={machines}
                onOpenJournal={onOpenJournal}
                emptyHint=""
              />
            </DossierSectionShell>

            {/* ---------------- BODY ---------------- */}
            <DossierSectionShell
              id="medical"
              title="Body"
              blurb={sectionBlurb("medical")}
              icon={SECTION_ICONS.medical}
            >
              {/* The watch-outs lead (client-profile audit: "highly visible,
                  without digging through paragraphs"). */}
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

              {/* What happened in the room: injury and incident notes,
                  anything flagged critical. */}
              <JournalRail
                section="medical"
                entries={entries}
                machines={machines}
                onOpenJournal={onOpenJournal}
                emptyHint="No injury or incident notes logged. Injury notes, clinical incidents, and anything flagged critical anywhere surface here automatically."
              />

              <FieldGroup title="Biometrics & recovery" cols={3}>
                <TextField label="Height" value={val("height")} onChange={set("height")} placeholder={`e.g. 5'4"`} hint="Used for machine set-up suggestions." />
                <TextField label="Weight" value={val("weight")} onChange={set("weight")} placeholder="lbs" />
                <SelectField
                  label="Recovery between sessions"
                  value={val("recoveryMetric")}
                  onChange={set("recoveryMetric")}
                  options={["Poor", "Average", "Optimal"]}
                  hint="Sleep, food and daily load, as the client describes them. The Pulse tracks the detail."
                />
              </FieldGroup>

              {/* Renewals round, Sep 2026: InBody scans save on their own —
                  not through this form's Save bar. See features/inbody. */}
              <InBodyCard client={client} authTrainer={authTrainer} />
            </DossierSectionShell>

            {/* ---------------- GOALS ---------------- */}
            <DossierSectionShell
              id="goals"
              title="Goals"
              blurb={sectionBlurb("goals")}
              icon={SECTION_ICONS.goals}
            >
              {/* Goals & Focus round, Sep 2026: the original why as the
                  anchor, the current goal with its SMART checklist and target
                  date, and the achieved-goal history. All field edits through
                  updateField, so the Save bar writes them. See features/goals. */}
              <GoalsPanel
                client={client}
                formData={formData}
                updateField={updateField}
                authTrainer={authTrainer}
              />

              <FieldGroup cols={1}>
                <TextAreaField
                  label="Coach strategy"
                  value={val("discoveryNotes")}
                  onChange={set("discoveryNotes")}
                  rows={3}
                  placeholder="How do you coach this client? What cues land?"
                />
              </FieldGroup>

              {/* Learning + Planner round, Sep 2026: plans trainers shared
                  from their Planner. Read-only here — see features/relay/notes. */}
              <SharedNotesCard
                client={client}
                authTrainer={authTrainer ?? null}
                onOpenPlanner={onOpenPlanner}
              />

              {/* Relay, Sep 2026: the trainer's OWN working notes about this
                  client, private by path, with a box to jot from here. */}
              <ClientJotStrip client={client} onOpenPlanner={onOpenPlanner} />

              {(longTermGoal || otherIndexes.length > 0) && (
                <FieldGroup title="Mindbody client indexes">
                  {longTermGoal && (
                    <ReadOnlyField label="Long-term goal" value={longTermGoal} />
                  )}
                  {otherIndexes.map(([k, v]) => (
                    <ReadOnlyField key={k} label={k} value={v} />
                  ))}
                </FieldGroup>
              )}


            </DossierSectionShell>

            {/* ---------------- FOCUS ---------------- */}
            <DossierSectionShell
              id="focus"
              title="Focus"
              blurb={sectionBlurb("focus")}
              icon={SECTION_ICONS.focus}
            >
              <ClientJournalTab
                areas={["focus"]}
                journal={journal}
                clientId={client.id || null}
                client={client}
                machines={machines}
                trainers={trainers}
                authTrainer={authTrainer}
                progressReports={progressReports}
                onSelectReport={onSelectReport ?? noop}
                onDeleteReport={onDeleteReport ?? noop}
                onNewReport={onNewReport ?? noop}
              />
            </DossierSectionShell>

            {/* ---------------- NOTES ---------------- */}
            <DossierSectionShell
              id="notes"
              title="Notes"
              blurb={sectionBlurb("notes")}
              icon={SECTION_ICONS.notes}
            >
              {/* Notes catalog round, Sep 2026: a category-first composer and
                  a catalog (tiles, shelves, search) instead of one feed. FORD /
                  Life notes hand off to the Life section. See features/client-notes. */}
              <ClientJournalTab
                areas={["notes"]}
                journal={journal}
                onOpenFord={() => jump("life")}
                clientId={client.id || null}
                client={client}
                machines={machines}
                trainers={trainers}
                authTrainer={authTrainer}
                progressReports={progressReports}
                onSelectReport={onSelectReport ?? noop}
                onDeleteReport={onDeleteReport ?? noop}
                onNewReport={onNewReport ?? noop}
              />
            </DossierSectionShell>

            {/* ---------------- REPORTS + ASSESSMENT ---------------- */}
            <DossierSectionShell
              id="reports"
              title="Pulse"
              blurb={sectionBlurb("reports")}
              icon={SECTION_ICONS.reports}
            >
              {/* Writing, not reading. The filed shelf moved to Clinical
                  History in the four-tab round — "everything that has already
                  happened" is one tab now, and a list of finalized reports is
                  the past. Composing one is still a thing you do from the
                  record, next to the notes it draws on, so the Assessment
                  panel stays and the archive is one tap away below. */}
              <ClientJournalTab
                areas={["check-in"]}
                journal={journal}
                clientId={client.id || null}
                client={client}
                machines={machines}
                trainers={trainers}
                authTrainer={authTrainer}
                progressReports={progressReports}
                onSelectReport={onSelectReport ?? noop}
                onDeleteReport={onDeleteReport ?? noop}
                onNewReport={onNewReport ?? noop}
              />

              {/* The one line that keeps the two halves joined. Count first,
                  because the number is what decides whether it is worth the
                  tap — the same reason the header's package pill reads
                  "12 left" before it reads the package name. */}
              {onOpenReports && (
                <button
                  type="button"
                  onClick={onOpenReports}
                  className="inline-flex h-11 w-fit items-center gap-2 rounded-xl border border-border px-4 text-[11px] font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  {progressReports.length === 0
                    ? "No filed reports yet"
                    : `${progressReports.length} filed ${progressReports.length === 1 ? "report" : "reports"}`}
                  <span className="opacity-60">· Activity Archive</span>
                </button>
              )}
            </DossierSectionShell>

            {/* ---------------- ADMIN ---------------- */}
            {/* Rebuilt around the contract (client-profile audit, Sep 2026):
                what they are on, what is left, what they have had, and the
                fine print. features/client-admin/ContractPanel.tsx. */}
            <DossierSectionShell
              id="admin"
              title="Admin"
              blurb={sectionBlurb("admin")}
              icon={SECTION_ICONS.admin}
            >
              <ContractPanel
                client={client}
                formData={formData}
                updateField={updateField}
                studios={studios}
                author={authTrainer ? { id: fordAuthor?.id || authTrainer.id, name: authTrainer.fullName } : null}
                acquisition={
                  <FieldGroup title="How they found us">
                    <TextField label="Lead source" value={val("leadSource")} onChange={set("leadSource")} />
                    <TextField
                      label="Referred by"
                      value={val("referredBy")}
                      onChange={set("referredBy")}
                      hint="Mindbody fills this if it is blank; your edit is never overwritten."
                    />
                  </FieldGroup>
                }
              />
            </DossierSectionShell>

          </div>
        </div>
      </div>
    </div>
  );
}
