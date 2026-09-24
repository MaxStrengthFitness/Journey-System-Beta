/**
 * BODY & PULSE — the page of Notes & Profile about her body: how she is
 * built as the machines see her, what the load has to work around, and how
 * she says she feels, side by side.
 *
 * Client codex, Sep 2026 (phase 12). It takes over the long scroll's Body and
 * Pulse sections, which were input boxes and the whole Pulse editor. Read
 * first, top to bottom, as the approved mockup has it:
 *
 *   How to coach her   the team's lead line, quoted, with a door to Goals
 *   Build              her build against the machines' baseline, and the
 *                      Training story (moved here from Life, decision 6)
 *   Where it matters   the body figure: watch-outs on file (plum diamonds)
 *                      and what she told us (ink rings), and her injury notes
 *   Watch-outs         every instruction her flags carry, quoted in full,
 *                      with the floor machines it names
 *   On our floor       her notes per prescribed machine, then the Academy's
 *                      set-up for her band; clients built like her
 *   Measured, and what she told us   pairs, each side with its own source
 *   Pulse              one line per area; Update Pulse, Hand to client
 *   InBody             every scan, and Add scan
 *
 * (Over time — the arrive/leave track and the timeline — is phase 13.)
 *
 * WHAT IT READS. The tab's one load: the journal (her notes, the critical
 * line's), the Pulse history, the InBody scans. Its OWN reads happen once,
 * when the page is first visited (the shell mounts a page on first visit and
 * keeps it): the client's ONE Pulse draft (`useCheckInDraft`, handed to the
 * editor — never a second one), the machine catalog (its body-type columns,
 * the same collection the app already streams) and machine fit's studio
 * index and company trends for "clients built like her" — the same cached
 * reads Programming → Setup makes, and none at all for a client with no
 * height, who cannot be compared.
 *
 * WHO MAY DO WHAT. `canEdit` (codexAccess — the clients update rule) gives
 * Edit on Build and Watch-outs; the fields go through the shell's ONE form,
 * saved by the ONE Save bar. The Pulse is written only through the draft.
 *
 * The app describes; the trainer decides: no load, no weight to use, no
 * body-type label, and no progression anywhere on the page.
 */
import { useMemo } from "react";
import { ChevronRight, Users } from "lucide-react";
import type { Client, Machine, Trainer } from "../../../types";
import type { JournalLoad, UseClientJournalResult } from "../../../hooks/useClientJournal";
import { useMachineCatalog } from "../../../hooks/useMachineCatalog";
import { useActiveStudio } from "../../../contexts/ActiveStudioContext";
import { useCheckInDraft } from "../../subjective-report/useCheckInDraft";
import { InBodyCard } from "../../inbody/InBodyCard";
import type { InBodyScansState } from "../../inbody/useInBodyScans";
import { useInBodyVariation } from "../../inbody/useInBodyVariation";
import { hasOwnVariation, variationStudioIdOf } from "../../inbody/variation";
import { useSetupModel } from "../../machine-fit/ui/useSetupModel";
import { EMPTY_DRAFTS } from "../../machine-fit/ui/setup-draft";
import { readStoredSpec } from "../../machine-fit/ui/stored-spec";
import { factorsOf } from "../../machine-fit/factors";
import { injuryThreads, threadsByMachine } from "../../client-notes/record-selectors";
import type { RecordForm } from "../useRecordForm";
import type { CodexProgramming, CodexPulse } from "../codex-data";
import type { ProgressReportsStatus } from "../../client-profile/client-answer";
import { Btn, Card, Page, agree, dayKeyDate, type CodexGo, type Pronouns } from "../kit";
import { buildFacts } from "./build";
import { floorReads, floorRows } from "./floor";
import { latestPain, latestPulseReadings, type PulseSource } from "./pulse-read";
import { measuredToldPairs } from "./pairs";
import { builtLikeHer } from "./built-like-her";
import { coachStripHasMore, coachStripLine } from "./page-lines";
import { BuildCard } from "./BuildCard";
import { WhereItMattersCard } from "./WhereItMattersCard";
import { WatchOutsCard } from "./WatchOutsCard";
import { OnOurFloorCard } from "./OnOurFloorCard";
import { MeasuredToldCard } from "./MeasuredToldCard";
import { PulseCard } from "./PulseCard";
import "./body.css";

export interface BodyPulsePageProps {
  client: Client;
  form: Pick<RecordForm, "formData" | "updateField" | "isDirty" | "revision">;
  /** May change the client record (codexAccess().canEdit). */
  canEdit: boolean;
  /** May read FORD (the Pulse stress row's "also shown on FORD"). */
  fordReadable: boolean;
  authTrainer: Trainer | null;
  machines: Machine[];
  /** The tab's ONE journal load, and whether its notes answered. */
  journal: Pick<UseClientJournalResult, "threads" | "criticalEntries">;
  notesState: JournalLoad;
  /** The tab's one read-only Pulse history. */
  pulse: CodexPulse;
  /** Filed progress reports for her, once read; null while unknown. */
  filedReports: number | null;
  /** The tab's ONE InBody scans stream. */
  inbody: InBodyScansState;
  programming: CodexProgramming;
  pronouns: Pronouns;
  /** The studio's day, yyyy-mm-dd. */
  today: string;
  go: CodexGo;
  onOpenNote: (threadId: string) => void;
  onOpenMachine?: (machineId: string) => void;
  onOpenSetup?: () => void;
  onOpenReports: () => void;
}

export function BodyPulsePage({
  client,
  form,
  canEdit,
  fordReadable,
  authTrainer,
  machines,
  journal,
  notesState,
  pulse,
  filedReports,
  inbody,
  programming,
  pronouns: p,
  today,
  go,
  onOpenNote,
  onOpenMachine,
  onOpenSetup,
  onOpenReports,
}: BodyPulsePageProps) {
  const now = useMemo(() => dayKeyDate(today) ?? new Date(), [today]);
  const { formData, updateField, isDirty, revision } = form;

  // The client's ONE Pulse draft: the read grid and the editor show the same answers.
  const draft = useCheckInDraft({ client, trainer: authTrainer, machines });

  const { catalog, loading: catalogLoading, failed: catalogFailed } = useMachineCatalog();
  // The hook hands out a new lookup every render; this one changes with the catalog.
  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const { activeStudio, studios } = useActiveStudio();

  const facts = useMemo(() => buildFacts({ client, formData, pronouns: p, now }), [client, formData, p, now]);

  /* ---- notes: one selection each, from the journal the tab loaded -------- */
  const threads = journal.threads;
  const byMachine = useMemo(() => threadsByMachine(threads ?? [], today), [threads, today]);
  const injury = useMemo(() => injuryThreads(threads ?? [], today, { includeIncidents: true }), [threads, today]);
  const onCriticalLine = useMemo(
    () => new Set((journal.criticalEntries ?? []).map((e) => e.id).filter((id): id is string => !!id)),
    [journal.criticalEntries],
  );
  const machinesById = useMemo(() => new Map(machines.filter((m) => m.id).map((m) => [m.id!, m])), [machines]);

  /* ---- the Pulse: the open draft over the saved rounds ------------------ */
  const source = useMemo<PulseSource>(
    () => ({
      draft:
        !draft.loading && draft.hasDraft
          ? {
              assessment: draft.assessment,
              savedAt: draft.savedAt,
              reviewed: draft.reviewed,
              doneIds: draft.sections.filter((s) => s.isDone).map((s) => s.id),
            }
          : null,
      history: pulse.status === "ready" ? pulse.history : null,
    }),
    [draft.loading, draft.hasDraft, draft.assessment, draft.savedAt, draft.reviewed, draft.sections, pulse],
  );
  const pain = useMemo(() => latestPain(source), [source]);
  const readings = useMemo(() => latestPulseReadings(source), [source]);
  // Whether what she told us is known: the saved rounds AND the open round.
  // Until both answered, a missing answer is "loading", never "not asked";
  // a failed history is unknown.
  const toldStatus: ProgressReportsStatus =
    pulse.status === "failed" ? "failed" : pulse.status === "loading" || draft.loading ? "loading" : "ready";

  /* ---- InBody: her HOME studio's numbers -------------------------------- */
  const variation = useInBodyVariation(client);
  const homeId = variationStudioIdOf(client);
  const home = homeId ? ((studios ?? []).find((s) => s.id === homeId) ?? null) : null;
  const variationOwner = home && hasOwnVariation(home) ? (home.name ?? null) : null;

  const flagIds = (formData.clinicalFlags ?? client.clinicalFlags) as string[] | undefined;
  const pairs = useMemo(
    () =>
      measuredToldPairs({
        client,
        inbody,
        variation,
        variationOwner,
        flagIds,
        pain,
        source,
        readings,
        pulseStatus: toldStatus,
        pronouns: p,
        now,
      }),
    [client, inbody, variation, variationOwner, flagIds, pain, source, readings, toldStatus, p, now],
  );

  /* ---- the floor, and machine fit ---------------------------------------- */
  const { clientSettings, routines, studioClients, activeStudioId } = programming;
  // No height, nothing to compare: machine fit reads nothing for her.
  const hasHeight = useMemo(() => factorsOf(client).heightIn !== null, [client]);
  const spec = useMemo(() => readStoredSpec(), []);
  const model = useSetupModel({
    client,
    clientId: client.id ?? "",
    machines,
    clientSettings,
    routines,
    isBActive: !!client.isRoutineBActive,
    catalog,
    studioMachineSettings: activeStudio?.machineSettings,
    studioClients,
    activeStudioId,
    spec,
    drafts: EMPTY_DRAFTS,
    filter: "routine",
    enabled: hasHeight,
  });
  const floor = useMemo(
    () =>
      floorRows({
        machines,
        routines,
        isBActive: !!client.isRoutineBActive,
        clientSettings,
        byMachine,
        bodyTypeOf: (id) => catalogById.get(id)?.bodyTypeAdjustments ?? null,
        band: facts.band,
        today,
        now,
      }),
    [machines, routines, client.isRoutineBActive, clientSettings, byMachine, catalogById, facts.band, today, now],
  );
  const likeHer = useMemo(
    () => builtLikeHer({ rows: model.rows, allRows: model.allRows, target: model.target, pronouns: p }),
    [model.rows, model.allRows, model.target, p],
  );
  // A read still out is unknown: no "standard set-up" count, no "0 of 16 set up".
  const floorKnown = useMemo(
    () =>
      floorReads({
        band: facts.band,
        programme: programming.status,
        catalog: catalogFailed ? "failed" : catalogLoading ? "loading" : "ready",
        pronouns: p,
      }),
    [facts.band, programming.status, catalogFailed, catalogLoading, p],
  );
  // No height: machine fit read nothing, and the tile asks for a height.
  const fitStatus = !hasHeight ? "ready" : floorKnown.fit !== "ready" ? floorKnown.fit : model.fit.status;

  /* ---- the strip ------------------------------------------------------- */
  const strategy = (formData.discoveryNotes ?? client.discoveryNotes) as string | undefined;
  const lead = coachStripLine(strategy);

  const lede =
    `How ${p.subject} ${agree(p, "is", "are")} built as the machines see ${p.object}, what the load has to work around, ` +
    `and how ${p.subject} ${agree(p, "says", "say")} ${p.subject} ${agree(p, "feels", "feel")}, side by side. The app describes; the trainer decides.`;

  return (
    <Page id="body" title="Body & Pulse" lede={lede} go={go}>
      <div className="bp">
        <Card
          eyebrow={`How to coach ${p.object}`}
          icon={Users}
          actions={
            <Btn iconEnd={ChevronRight} onClick={() => go("goals", "goals-coach")}>
              {lead && coachStripHasMore(strategy) ? "All of it" : "Goals & Focus"}
            </Btn>
          }
        >
          {lead ? (
            <p className="bp-strip__text">{lead}</p>
          ) : (
            // Only what was checked: the coaching and preference notes join the
            // strip with howToCoachLead (Goals & Focus, phase 14).
            <p className="bp-strip__empty">{`No coach strategy on ${p.possessive} record yet.`}</p>
          )}
        </Card>

        <div className="bp-row">
          <BuildCard
            client={client}
            facts={facts}
            formData={formData}
            updateField={updateField}
            canEdit={canEdit}
            dirtyBuild={isDirty("height", "wingspan", "weight")}
            dirtyStory={isDirty(
              "fitnessBackground",
              "needsUnteaching",
              "trainingPedigree",
              "pedigreeHistory",
              "experienceLevel",
            )}
            revision={revision}
            authorName={authTrainer?.fullName ?? null}
            pronouns={p}
            onEditWork={() => go("ford", "ford-occupation")}
          />
          <WhereItMattersCard
            flagIds={flagIds}
            pain={pain}
            pulseStatus={toldStatus}
            injury={injury}
            notesState={notesState}
            onCriticalLine={onCriticalLine}
            machinesById={machinesById}
            onOpenNote={onOpenNote}
            onOpenNotes={() => go("notes")}
            pronouns={p}
            today={today}
            now={now}
          />
          <WatchOutsCard
            flagIds={flagIds}
            medicalHistory={String(formData.medicalHistory ?? client.medicalHistory ?? "")}
            clinicalNotes={String(formData.clinicalNotes ?? client.clinicalNotes ?? "")}
            floorMachines={machines}
            canEdit={canEdit}
            dirty={isDirty("clinicalFlags", "medicalHistory", "clinicalNotes")}
            revision={revision}
            updateField={updateField}
            onOpenMachine={onOpenMachine}
          />
        </div>

        <OnOurFloorCard
          floor={floor}
          band={facts.band}
          setUpLine={`${model.setUpCount} of ${model.allRows.length} machines set up`}
          builtLikeHer={likeHer}
          reads={floorKnown}
          fitStatus={fitStatus}
          minClients={spec.minClients}
          notesState={notesState}
          pronouns={p}
          onOpenSetup={onOpenSetup}
          onOpenNote={onOpenNote}
        />

        <MeasuredToldCard rows={pairs} pronouns={p} />

        <PulseCard
          client={client}
          authTrainer={authTrainer}
          machines={machines}
          draft={draft}
          history={pulse.history}
          historyStatus={pulse.status}
          filedCount={filedReports}
          onOpenReports={onOpenReports}
          fordReadable={fordReadable}
          now={now}
        />

        {/* InBody scans save on their own, not through the Save bar. The
            timeline (phase 13) draws the trends, so the card shows none. */}
        <Card host id="body-inbody">
          <InBodyCard client={client} authTrainer={authTrainer} inbody={inbody} showTrends={false} />
        </Card>
      </div>
    </Page>
  );
}
