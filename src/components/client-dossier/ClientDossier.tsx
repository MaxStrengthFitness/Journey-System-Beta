/**
 * THE CLIENT DOSSIER
 *
 * Replaces the six-tab Client Information modal with one scrolling spine.
 *
 * Why: a coach walking to the floor thinks "tell me about Judy", not "which
 * tab is her A-Fib in". Tabs made every fact conditional on already knowing
 * where it lived, and split data that belongs together — a surgery is a
 * medical fact AND a calendar event AND the reason her load is capped. One
 * spine lets you read the whole client in a single scroll; the nav is demoted
 * from a switch to a jump list for when you already know where you are going.
 *
 * Three things carry the design:
 *   1. The snapshot bar never scrolls away. Liability, contract, critical
 *      notes and the next event are the facts that must not be three tabs deep.
 *   2. Provenance is in the control. An input means you own it; a tabbed
 *      read-only block means Mindbody or the Journal does. See DossierPrimitives.
 *   3. Every section pulls its own journal notes. A "Surgery" note logged
 *      mid-session appears under Medical without anyone re-typing it, because
 *      it is the same document, not a copy.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Calendar,
  HeartPulse,
  Plus,
  RefreshCw,
  Settings2,
  Target,
  Trash2,
  TrendingUp,
  User,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useClientJournal } from "../../hooks/useClientJournal";
import {
  DOSSIER_SECTIONS,
  toDate,
  type DossierSection,
} from "../../types/journal";
import type {
  Client,
  ClientEvent,
  Machine,
  MindbodyContract,
  Studio,
  Trainer,
} from "../../types";
import { CLINICAL_FLAGS_MATRIX } from "../../data/clinical-matrix";
import { OccupationSelect } from "../OccupationSelect";
import { ClientMembershipsCard } from "../mindbody/ClientMembershipsCard";
import { ClientSnapshot, activeContract } from "./ClientSnapshot";
import { JournalRail } from "./JournalRail";
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
  lifestyle: <Activity className="h-5 w-5" />,
  medical: <HeartPulse className="h-5 w-5" />,
  goals: <Target className="h-5 w-5" />,
  admin: <Settings2 className="h-5 w-5" />,
  events: <Calendar className="h-5 w-5" />,
};

const EVENT_TYPES = [
  "Birthday/Anniversary",
  "Vacation",
  "Snowbird",
  "Medical",
  "Progress Report",
  "InBody Scan",
  "Routine Change",
  "Alert",
  "Other",
] as const;

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
  onSyncMindbody?: () => void;
  isSyncingMb?: boolean;
  /**
   * "inner" (default, the full-screen overlay): the spine is its own
   * scroll container. "page" (the Details tab): the spine has no scroller
   * of its own — the page scrolls, and the jump rail sticks alongside it.
   */
  scroll?: "inner" | "page";
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
  onSyncMindbody,
  isSyncingMb = false,
  scroll = "inner",
}: ClientDossierProps) {
  const pageScroll = scroll === "page";
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState<DossierSection>(
    defaultSection || "general",
  );

  const { entries, criticalEntries } = useClientJournal({
    clientId: client.id || null,
    client,
    trainers,
  });

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
  const contract = activeContract(client);
  const contractHistory = useMemo<MindbodyContract[]>(
    () =>
      Object.values(client.mindbodyContracts || {}).sort(
        (a, b) => (toDate(b.startDate)?.getTime() ?? 0) - (toDate(a.startDate)?.getTime() ?? 0),
      ),
    [client.mindbodyContracts],
  );
  const longTermGoal =
    client.mindbodyIndexes?.LongtermGoal ||
    client.mindbodyIndexes?.LongTermGoal ||
    "";
  const otherIndexes = Object.entries(client.mindbodyIndexes || {}).filter(
    ([k]) => k !== "LongtermGoal" && k !== "LongTermGoal",
  );

  const events = formData.events || [];
  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) => (toDate(a.date)?.getTime() ?? 0) - (toDate(b.date)?.getTime() ?? 0),
      ),
    [events],
  );

  /* --- event editing -------------------------------------------------- */
  const addEvent = () => {
    const next: ClientEvent = {
      id: Math.random().toString(36).slice(2, 11),
      title: "",
      type: "Other",
      date: new Date().toISOString().split("T")[0],
      priority: "Medium",
    };
    updateField("events", [...events, next]);
  };
  const patchEvent = (id: string, key: keyof ClientEvent, value: any) =>
    updateField(
      "events",
      events.map((e) => (e.id === id ? { ...e, [key]: value } : e)),
    );
  const removeEvent = (id: string) =>
    updateField("events", events.filter((e) => e.id !== id));

  const toggleFlag = (flagId: string) => {
    const cur = formData.clinicalFlags || [];
    updateField(
      "clinicalFlags",
      cur.includes(flagId) ? cur.filter((f) => f !== flagId) : [...cur, flagId],
    );
  };
  const toggleStudio = (studioId: string) => {
    const cur = formData.approvedCrossTrainStudioIds || [];
    updateField(
      "approvedCrossTrainStudioIds",
      cur.includes(studioId) ? cur.filter((s) => s !== studioId) : [...cur, studioId],
    );
  };

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
          aria-label="Dossier sections"
          className={cn(
            "shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950 md:w-52 md:border-b-0 md:border-r md:px-3 md:py-5 lg:w-56",
            pageScroll && "md:sticky md:top-0 md:self-start md:max-h-dvh md:overflow-y-auto",
          )}
        >
          <span className="mb-2 hidden px-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-400 md:block">
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
                      : "border-l-transparent text-slate-500 hover:bg-slate-200/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200",
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
            "flex-1 bg-white dark:bg-slate-900",
            pageScroll ? "min-w-0" : "min-h-0 overflow-y-auto",
          )}
        >
          <div
            className={cn(
              "mx-auto flex max-w-4xl flex-col gap-9 px-5 py-7 md:px-9",
              pageScroll ? "pb-10 [&_[data-dossier-section]]:scroll-mt-4" : "pb-28",
            )}
          >

            {/* ---------------- GENERAL ---------------- */}
            <DossierSectionShell
              id="general"
              title="General"
              blurb={DOSSIER_SECTIONS[0].blurb}
              icon={SECTION_ICONS.general}
            >
              <FieldGroup title="Identity">
                <TextField label="First name" value={val("firstName")} onChange={set("firstName")} />
                <TextField label="Last name" value={val("lastName")} onChange={set("lastName")} />
                <TextField
                  label="Date of birth"
                  type="date"
                  value={val("dateOfBirth")}
                  onChange={set("dateOfBirth")}
                />
                <SelectField
                  label="Gender"
                  value={val("gender")}
                  onChange={set("gender")}
                  options={["Male", "Female", "Other"]}
                />
              </FieldGroup>

              <FieldGroup title="Contact">
                <TextField label="Phone" value={val("phone")} onChange={set("phone")} />
                <TextField label="Email" type="email" value={val("email")} onChange={set("email")} />
                <div className="sm:col-span-2">
                  <TextField
                    label="Address"
                    value={val("address")}
                    onChange={set("address")}
                    hint="The line trainers edit. City, state and postal come from Mindbody and only fill blanks."
                  />
                </div>
                <ReadOnlyField
                  label="City / State"
                  value={[client.city, client.addressState].filter(Boolean).join(", ")}
                />
                <ReadOnlyField
                  label="Postal / Country"
                  value={[client.postalCode, client.country].filter(Boolean).join(" · ")}
                />
              </FieldGroup>

              <FieldGroup title="Emergency contact">
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
              </FieldGroup>

              <FieldGroup title="Mindbody record" cols={3}>
                <ReadOnlyField label="Mindbody ID" value={client.mindbodyId || ""} />
                <ReadOnlyField
                  label="Liability waiver"
                  value={
                    client.isLiabilityReleased
                      ? `Released ${fmtDate(client.liabilityAgreementDate, "")}`.trim()
                      : "Not on file"
                  }
                  hint={
                    client.isLiabilityReleased
                      ? undefined
                      : "Mindbody reports no signed release for this client."
                  }
                />
                <ReadOnlyField label="Membership status" value={client.mindbodyStatus || ""} />
                <ReadOnlyField label="Client since" value={fmtDate(client.mindbodyCreatedAt, "")} />
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
              </FieldGroup>

              {onSyncMindbody && (
                <button
                  type="button"
                  onClick={onSyncMindbody}
                  disabled={isSyncingMb}
                  className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-[#38BDF8]/30 bg-[#38BDF8]/10 px-4 text-[11px] font-black uppercase tracking-wider text-[#38BDF8] transition-colors hover:bg-[#38BDF8]/20 disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isSyncingMb && "animate-spin")} />
                  {isSyncingMb ? "Syncing" : "Sync from Mindbody"}
                </button>
              )}

              {client.mindbodyNotes && (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel source="mindbody">Mindbody account notes</FieldLabel>
                  <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100/70 p-4 pl-5 dark:border-slate-800 dark:bg-slate-950/40">
                    <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] bg-sky-500" />
                    <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">
                      {client.mindbodyNotes}
                    </p>
                  </div>
                  <p className="text-[10.5px] text-slate-400">
                    First 1,000 characters of the client's Mindbody account notes. Edit them in
                    Mindbody — a sync overwrites anything typed here.
                  </p>
                </div>
              )}

              <JournalRail
                section="general"
                entries={entries}
                machines={machines}
                onOpenJournal={onOpenJournal}
              />
            </DossierSectionShell>

            {/* ---------------- LIFESTYLE ---------------- */}
            <DossierSectionShell
              id="lifestyle"
              title="Lifestyle"
              blurb={DOSSIER_SECTIONS[1].blurb}
              icon={SECTION_ICONS.lifestyle}
            >
              <FieldGroup title="Work">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <FieldLabel>Occupation</FieldLabel>
                  <OccupationSelect
                    value={val("occupation")}
                    onChange={(v) => updateField("occupation", v)}
                  />
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <FieldLabel>Retired</FieldLabel>
                  <button
                    type="button"
                    onClick={() => updateField("isRetired", !formData.isRetired)}
                    className={cn(
                      "flex h-11 items-center justify-between rounded-xl border px-3.5 text-sm font-semibold transition-colors",
                      formData.isRetired
                        ? "border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]"
                        : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400",
                    )}
                  >
                    {formData.isRetired ? "Retired" : "Working"}
                    <span
                      className={cn(
                        "h-5 w-9 rounded-full p-0.5 transition-colors",
                        formData.isRetired ? "bg-[#38BDF8]" : "bg-slate-300 dark:bg-slate-700",
                      )}
                    >
                      <span
                        className={cn(
                          "block h-4 w-4 rounded-full bg-white transition-transform",
                          formData.isRetired && "translate-x-4",
                        )}
                      />
                    </span>
                  </button>
                </div>
              </FieldGroup>

              <FieldGroup title="Load outside the studio">
                <SelectField
                  label="Activity level"
                  value={val("activityLevel")}
                  onChange={set("activityLevel")}
                  options={["Sedentary", "Light", "Moderate", "High", "Manual Labor"]}
                />
                <SelectField
                  label="Recovery"
                  value={val("recoveryMetric")}
                  onChange={set("recoveryMetric")}
                  options={["Poor", "Average", "Optimal"]}
                />
                <SelectField
                  label="Experience level"
                  value={val("experienceLevel")}
                  onChange={set("experienceLevel")}
                  options={["Beginner", "Intermediate", "Advanced"]}
                />
                <SelectField
                  label="Training pedigree"
                  value={val("trainingPedigree")}
                  onChange={set("trainingPedigree")}
                  options={["Novice", "Intermediate", "Advanced", "Protocol Veteran"]}
                />
              </FieldGroup>

              <FieldGroup title="How they found us">
                <TextField label="Lead source" value={val("leadSource")} onChange={set("leadSource")} />
                <TextField
                  label="Referred by"
                  value={val("referredBy")}
                  onChange={set("referredBy")}
                  hint="Mindbody fills this if it is blank; your edit is never overwritten."
                />
              </FieldGroup>

              <JournalRail
                section="lifestyle"
                entries={entries}
                machines={machines}
                onOpenJournal={onOpenJournal}
                emptyHint="No lifestyle notes yet. Notes filed here appear automatically — a general note about her bocce league or her sleep will show up in this spot."
              />
            </DossierSectionShell>

            {/* ---------------- MEDICAL ---------------- */}
            <DossierSectionShell
              id="medical"
              title="Medical"
              blurb={DOSSIER_SECTIONS[2].blurb}
              icon={SECTION_ICONS.medical}
            >
              {/* The rail leads here, before the form fields. On this section
                  what happened in the room outranks what someone typed at
                  intake six months ago. */}
              <JournalRail
                section="medical"
                entries={entries}
                machines={machines}
                onOpenJournal={onOpenJournal}
                emptyHint="No medical notes or incidents logged. Surgery and injury notes, clinical incidents, and anything flagged critical anywhere in the Journal surface here automatically."
              />

              <FieldGroup title="Measurements">
                <TextField label="Height" value={val("height")} onChange={set("height")} placeholder={`e.g. 5'4"`} />
                <TextField label="Weight" value={val("weight")} onChange={set("weight")} placeholder="lbs" />
              </FieldGroup>

              <div className="flex flex-col gap-2.5">
                <FieldLabel>Clinical flags</FieldLabel>
                <p className="text-[11px] text-slate-400">
                  These drive machine-level contraindications in the session tracker.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CLINICAL_FLAGS_MATRIX.map((flag) => {
                    const on = (formData.clinicalFlags || []).includes(flag.id);
                    return (
                      <button
                        key={flag.id}
                        type="button"
                        onClick={() => toggleFlag(flag.id)}
                        className={cn(
                          "h-9 rounded-xl border px-3 text-[10.5px] font-black uppercase tracking-wider transition-all",
                          on
                            ? "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300"
                            : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:bg-slate-800",
                        )}
                      >
                        {flag.conditionName}
                      </button>
                    );
                  })}
                </div>
              </div>

              <FieldGroup cols={1}>
                <TextAreaField
                  label="Medical history"
                  value={val("medicalHistory")}
                  onChange={set("medicalHistory")}
                  rows={5}
                  placeholder="Surgeries, chronic conditions, anything a new coach must read before loading her."
                />
                <TextAreaField
                  label="Contraindications & constraints"
                  value={val("clinicalNotes")}
                  onChange={set("clinicalNotes")}
                  rows={4}
                  placeholder="What the load has to work around. Specific movements, ranges or machines to avoid."
                />
              </FieldGroup>
            </DossierSectionShell>

            {/* ---------------- GOALS ---------------- */}
            <DossierSectionShell
              id="goals"
              title="Goals"
              blurb={DOSSIER_SECTIONS[3].blurb}
              icon={SECTION_ICONS.goals}
            >
              <FieldGroup cols={1}>
                <TextAreaField
                  label={`The original "why"`}
                  value={val("globalNotes")}
                  onChange={set("globalNotes")}
                  rows={4}
                  placeholder="What actually brought them in. In their words, not yours."
                />
                <TextField
                  label="Current SMART goal"
                  value={val("smartGoal")}
                  onChange={set("smartGoal")}
                  placeholder="e.g. Carry both grandkids up the stairs by Thanksgiving"
                />
                <TextAreaField
                  label="Coach strategy"
                  value={val("discoveryNotes")}
                  onChange={set("discoveryNotes")}
                  rows={3}
                  placeholder="How do you coach this client? What cues land?"
                />
              </FieldGroup>

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

              {onOpenReports && (
                <button
                  type="button"
                  onClick={onOpenReports}
                  className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-slate-200 px-4 text-[11px] font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Progress reports
                </button>
              )}

              <JournalRail
                section="goals"
                entries={entries}
                machines={machines}
                onOpenJournal={onOpenJournal}
                emptyHint="Consultation and discovery notes appear here as they are logged."
              />
            </DossierSectionShell>

            {/* ---------------- ADMIN ---------------- */}
            <DossierSectionShell
              id="admin"
              title="Admin"
              blurb={DOSSIER_SECTIONS[4].blurb}
              icon={SECTION_ICONS.admin}
            >
              <FieldGroup cols={3}>
                <SelectField
                  label="Package tier"
                  value={val("packageTier")}
                  onChange={set("packageTier")}
                  options={["None", "6-Month", "12-Month", "18-Month"]}
                />
                <ReadOnlyField
                  label="Home studio"
                  source="derived"
                  value={
                    studios.find((s) => s.id === client.homeStudioId)?.name ||
                    client.homeStudioId ||
                    ""
                  }
                />
                <ReadOnlyField
                  label="Sessions remaining"
                  source="derived"
                  value={
                    typeof client.remainingSessions === "number"
                      ? String(client.remainingSessions)
                      : ""
                  }
                />
              </FieldGroup>

              {/* Contract history — the whole point of the Admin section. */}
              <div className="flex flex-col gap-2.5">
                <FieldLabel source="mindbody">Contract history</FieldLabel>
                {contractHistory.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 dark:border-slate-800">
                    <p className="text-[11.5px] text-slate-400">
                      No contracts synced. These arrive on the clientContract webhooks.
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {contractHistory.map((c) => {
                      const isActive = c.status === "Active";
                      return (
                        <li
                          key={String(c.clientContractId)}
                          className={cn(
                            "relative overflow-hidden rounded-xl border p-3.5 pl-4.5",
                            isActive
                              ? "border-emerald-500/25 bg-emerald-500/[0.05]"
                              : "border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-950/40",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "absolute left-0 top-0 h-full w-[3px]",
                              isActive ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-700",
                            )}
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">
                              {c.contractName || `Contract ${c.clientContractId}`}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {c.isAutoRenewing && (
                                <span className="rounded-md border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-300">
                                  Auto-renew
                                </span>
                              )}
                              <span
                                className={cn(
                                  "rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider",
                                  isActive
                                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                                    : "border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800",
                                )}
                              >
                                {c.status}
                              </span>
                            </div>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                            <span>
                              {fmtDate(c.startDate)} → {fmtDate(c.endDate)}
                            </span>
                            {c.agreementDate && <span>· Signed {fmtDate(c.agreementDate)}</span>}
                            {c.soldByStaffName && <span>· Sold by {c.soldByStaffName}</span>}
                            {String(c.originationLocationId) === "98" && <span>· Bought online</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {contract && (
                  <p className="text-[10.5px] text-slate-400">
                    Read-only. Mindbody owns contracts; changes there flow in on the next webhook.
                  </p>
                )}
              </div>

              <ClientMembershipsCard client={client} />

              <div className="flex flex-col gap-2.5">
                <FieldLabel>Approved cross-train studios</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {studios.filter((s) => s.id !== client.homeStudioId).length === 0 ? (
                    <p className="text-[11.5px] text-slate-400">
                      No other studios available for cross-training.
                    </p>
                  ) : (
                    studios
                      .filter((s) => s.id !== client.homeStudioId)
                      .map((studio) => {
                        const on = (formData.approvedCrossTrainStudioIds || []).includes(
                          studio.id!,
                        );
                        return (
                          <button
                            key={studio.id}
                            type="button"
                            onClick={() => toggleStudio(studio.id!)}
                            className={cn(
                              "h-9 rounded-xl border px-3 text-[10.5px] font-black uppercase tracking-wider transition-all",
                              on
                                ? "border-[#38BDF8]/40 bg-[#38BDF8]/15 text-[#0284c7] dark:text-[#38BDF8]"
                                : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:bg-slate-800",
                            )}
                          >
                            {studio.name}
                          </button>
                        );
                      })
                  )}
                </div>
              </div>
            </DossierSectionShell>

            {/* ---------------- EVENTS ---------------- */}
            <DossierSectionShell
              id="events"
              title="Events"
              blurb={DOSSIER_SECTIONS[5].blurb}
              icon={SECTION_ICONS.events}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11.5px] text-slate-400">
                  These appear on the studio calendar. Birthdays, trips, surgeries and recovery
                  windows.
                </p>
                <button
                  type="button"
                  onClick={addEvent}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#38BDF8] px-4 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-[#0284c7]"
                >
                  <Plus className="h-3.5 w-3.5" /> Add event
                </button>
              </div>

              {sortedEvents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-800">
                  <p className="text-[11.5px] text-slate-400">
                    Nothing on the horizon.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {sortedEvents.map((event) => {
                    const past = (toDate(event.date)?.getTime() ?? 0) < Date.now() - 86400000;
                    return (
                      <li
                        key={event.id}
                        className={cn(
                          "rounded-xl border border-slate-200 p-3.5 dark:border-slate-800",
                          past && "opacity-60",
                        )}
                      >
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <TextField
                            label="Title"
                            value={event.title}
                            onChange={(v) => patchEvent(event.id, "title", v)}
                            placeholder="e.g. Cardiac ablation"
                          />
                          <SelectField
                            label="Type"
                            value={event.type}
                            onChange={(v) => patchEvent(event.id, "type", v)}
                            options={EVENT_TYPES}
                            placeholder="Other"
                          />
                          <TextField
                            label="Date"
                            type="date"
                            value={event.date}
                            onChange={(v) => patchEvent(event.id, "date", v)}
                          />
                          <TextField
                            label="Ends (optional)"
                            type="date"
                            value={event.endDate || ""}
                            onChange={(v) => patchEvent(event.id, "endDate", v)}
                            hint="For blocks — a trip, or a recovery window."
                          />
                          <SelectField
                            label="Priority"
                            value={event.priority}
                            onChange={(v) => patchEvent(event.id, "priority", v)}
                            options={["High", "Medium", "Low"]}
                            placeholder="Medium"
                          />
                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() => removeEvent(event.id)}
                              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 text-[10.5px] font-black uppercase tracking-wider text-slate-400 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-500 dark:border-slate-800"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove
                            </button>
                          </div>
                          <div className="sm:col-span-2">
                            <TextAreaField
                              label="Notes"
                              value={event.notes || ""}
                              onChange={(v) => patchEvent(event.id, "notes", v)}
                              rows={2}
                              placeholder="Anything a coach needs to know around this date."
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <JournalRail
                section="events"
                entries={entries}
                machines={machines}
                onOpenJournal={onOpenJournal}
                emptyHint="Birthday, anniversary, vacation and milestone notes from the Journal show up here too."
              />
            </DossierSectionShell>
          </div>
        </div>
      </div>
    </div>
  );
}
