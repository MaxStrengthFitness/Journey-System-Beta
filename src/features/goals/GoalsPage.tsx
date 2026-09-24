/**
 * GOALS & FOCUS — the page of Notes & Profile about how to coach her, why
 * she came, what she is working toward and what each coach is working on.
 *
 * Client codex, Sep 2026 (phase 14). It takes over the long scroll's Goals
 * and Focus sections, which were input boxes over a focus board. Read first,
 * three rows as the approved mockup has them (one column under 760px, two
 * from 760 — portrait first):
 *
 *   How to coach her | Her why
 *       the coach strategy and her Preference and Coaching-tip notes as they
 *       are on Notes; her why, with the other places it is written (Mindbody,
 *       the consultation, the sign-up notes, her Dreams in FORD)
 *   Working toward now | Coach focuses
 *       the goal, its SMART squares and target, Mark achieved; every coach's
 *       running focus, with its history folded underneath
 *   Plans from the team (and your working notes) | Reached
 *       the team's shared plans with this trainer's private jots in the same
 *       panel; every goal and focus reached, newest first
 *
 * THREE SAVE MODELS, EACH SAID ON ITS CARD. Record fields — the coach
 * strategy, the why, the goal and its checklist, target and history — are
 * edits to the shell's ONE record form: Done only closes an editor, and the
 * Save bar saves ("Goals & Focus · Working toward"). Focuses and check-ins
 * write at once (`useFocusActions`: the Auth uid, the check-in carries its
 * focus id). Plans live in Relay; jots are private to the trainer.
 *
 * WHAT IT READS. The tab's one load: the journal (her notes, the focuses and
 * their check-ins), FORD (the Dreams line, only for a reader FORD lets in)
 * and the record. Its OWN reads — the shared plans and the trainer's jots —
 * open the first time the page is visited (the shell mounts a page on first
 * visit and keeps it), so switching back costs nothing.
 *
 * WHO MAY DO WHAT. `canEdit` (codexAccess — the clients update rule) gives
 * Edit and Mark achieved; a cross-train reader sees the read views. Any
 * trainer may set a focus and check in (the clientFocuses and journal rules
 * let them); closing a focus is its coach's or an owner's (`canManageFocus`).
 *
 * The app describes; the trainer decides. Nothing here suggests a goal, a
 * focus or a progression, and "How to coach her" is the team's own words.
 */
import { useMemo } from "react";
import { Target } from "lucide-react";
import type { Client, Machine, Trainer } from "../../types";
import type { JournalLoad, UseClientJournalResult } from "../../hooks/useClientJournal";
import type { HistoryCoverage } from "../../lib/prior-history";
import type { FordEntry } from "../ford/types";
import { FocusBoard } from "../../components/journal/FocusBoard";
import { SharedNotesCard } from "../relay/notes/SharedNotesCard";
import { ClientJotStrip } from "../relay/notes/ClientJotStrip";
import type { RecordForm } from "../client-codex/useRecordForm";
import type { CodexFordStatus } from "../client-codex/codex-data";
import { Card, Meta, Page, agree, type CodexGo, type Pronouns } from "../client-codex/kit";
import { HowToCoachCard } from "./HowToCoachCard";
import { HerWhyCard } from "./HerWhyCard";
import { WorkingTowardCard } from "./WorkingTowardCard";
import { ReachedShelf } from "./ReachedShelf";
import { herWhyLinks, reachedShelf } from "./goals-page";
import { useFocusActions } from "./useFocusActions";
import "./goals.css";

export interface GoalsPageProps {
  client: Client;
  form: Pick<RecordForm, "formData" | "updateField" | "isDirty" | "revision">;
  /** May change the client record (codexAccess().canEdit). */
  canEdit: boolean;
  authTrainer: Trainer | null;
  machines: Machine[];
  /** The tab's ONE journal load: her notes, the focuses and their check-ins, and what answered. */
  journal: Pick<UseClientJournalResult, "entries" | "threads" | "focuses" | "loadState" | "capped">;
  /** Whether her notes answered (the tab's `notes.state`). */
  notesState: JournalLoad;
  /** The tab's one FORD stream, and what it could read for this reader. */
  ford: { status: CodexFordStatus; entries: readonly FordEntry[] };
  /** How much of her story Journey holds: Reached's caveat. */
  coverage: HistoryCoverage;
  pronouns: Pronouns;
  /** The studio's day, yyyy-mm-dd. */
  today: string;
  go: CodexGo;
  /** Opens one thread on Notes. */
  onOpenThread: (threadId: string) => void;
  onOpenPlanner?: () => void;
  /**
   * The Goals lines of her Mindbody sign-up notes, verbatim — the intake
   * matcher's (client codex, phase 17). Read only here.
   */
  signUpGoals?: readonly string[];
}

export function GoalsPage({
  client,
  form,
  canEdit,
  authTrainer,
  machines,
  journal,
  notesState,
  ford,
  coverage,
  pronouns: p,
  today,
  go,
  onOpenThread,
  onOpenPlanner,
  signUpGoals,
}: GoalsPageProps) {
  const { formData, updateField, isDirty, revision } = form;
  const focusActions = useFocusActions({ clientId: client.id || null, client, authTrainer });
  const focusesState: JournalLoad = journal.loadState?.focuses ?? "loading";

  /** The form's value when it has one, else what is on the record. */
  const text = (key: "discoveryNotes" | "globalNotes"): string => {
    const v = formData[key];
    return ((v !== undefined ? v : client[key]) as string | undefined) ?? "";
  };

  const links = useMemo(
    () => herWhyLinks({ client, fordStatus: ford.status, fordEntries: ford.entries, signUp: signUpGoals }),
    [client, ford.status, ford.entries, signUpGoals],
  );
  const reached = useMemo(
    () =>
      reachedShelf({
        current: formData.goalHistory !== undefined ? formData.goalHistory : client.goalHistory,
        saved: client.goalHistory,
        focuses: focusesState === "ready" ? journal.focuses : null,
      }),
    [formData.goalHistory, client.goalHistory, focusesState, journal.focuses],
  );

  const lede =
    `How to be the best trainer for ${p.object}, ${p.possessive} why, what ${p.subject} ${agree(p, "is", "are")} ` +
    "working toward now, and what each coach is working on.";

  return (
    <Page id="goals" title="Goals & Focus" lede={lede} go={go}>
      <div className="gf-page">
        <div className="gf-grid gf-grid--coach">
          <HowToCoachCard
            value={text("discoveryNotes")}
            updateField={updateField}
            threads={journal.threads}
            notesState={notesState}
            today={today}
            machines={machines}
            canEdit={canEdit}
            dirty={isDirty("discoveryNotes")}
            revision={revision}
            pronouns={p}
            go={go}
            onOpenThread={onOpenThread}
          />
          <HerWhyCard
            value={text("globalNotes")}
            updateField={updateField}
            links={links}
            canEdit={canEdit}
            dirty={isDirty("globalNotes")}
            revision={revision}
            pronouns={p}
            go={go}
          />
        </div>

        <div className="gf-grid gf-grid--now">
          <WorkingTowardCard
            client={client}
            formData={formData}
            updateField={updateField}
            authTrainer={authTrainer}
            canEdit={canEdit}
            dirty={isDirty("smartGoal", "smartChecks", "goalTargetDate", "goalHistory")}
            revision={revision}
            pronouns={p}
          />
          {focusesState === "ready" ? (
            <FocusBoard
              anchor="goals-focus"
              historyCollapsed
              focuses={journal.focuses}
              entries={journal.entries}
              machines={machines}
              viewerIds={focusActions.viewerIds}
              viewerRole={focusActions.viewerRole}
              onCreate={focusActions.onCreate}
              onAchieve={focusActions.onAchieve}
              onExtend={focusActions.onExtend}
              onRetire={focusActions.onRetire}
              onCheckIn={focusActions.onCheckIn}
            />
          ) : (
            // Unknown is not "no focus running": the board, and its Set a
            // focus, wait for the focuses to be read.
            <Card eyebrow="Coach focuses" icon={Target} id="goals-focus">
              <Meta>
                {focusesState === "failed"
                  ? `The focuses couldn't be loaded just now, so what each coach is working on with ${p.object} isn't shown.`
                  : "Loading the focuses…"}
              </Meta>
            </Card>
          )}
        </div>

        <div className="gf-grid gf-grid--now">
          <SharedNotesCard
            client={client}
            authTrainer={authTrainer}
            onOpenPlanner={onOpenPlanner}
            pronouns={p}
            anchor="goals-plans"
          >
            <ClientJotStrip client={client} onOpenPlanner={onOpenPlanner} pronouns={p} />
          </SharedNotesCard>
          <ReachedShelf rows={reached} focusesState={focusesState} coverage={coverage} />
        </div>

        {journal.capped ? (
          <Meta>This record is unusually large: some of its focuses or notes aren't loaded, so a count here may run short.</Meta>
        ) : null}
      </div>
    </Page>
  );
}
