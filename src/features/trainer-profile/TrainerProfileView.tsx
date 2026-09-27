import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { useOptionalActiveStudio } from "../../contexts/ActiveStudioContext";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import type {
  Client,
  ScheduleEntry,
  Studio,
  Trainer,
  WorkoutSession,
} from "../../types";
import { EditTrainerModal } from "./EditTrainerModal";
import { IdentityBar } from "./IdentityBar";
import { AboutPanel } from "./AboutPanel";
import { StudioAccessPanel } from "./StudioAccessPanel";
import { TodaySchedule } from "./TodaySchedule";
import { RecentlyCoached } from "./RecentlyCoached";
import { upcomingFor } from "./adapters";
import { CoachingLoad } from "./CoachingLoad";
import { KaizenRoster } from "./KaizenRoster";
import { deriveTrainerStats } from "./stats";
import { useTrainerRollups } from "./useTrainerRollups";
import { useRecentlyCoached } from "./useRecentlyCoached";
import { resolveProfileVisibility, scopeNotice } from "./visibility";
import { MyRenewals } from "../renewals/MyRenewals";
import { MyStandingWeek } from "../standing-week/MyStandingWeek";
import { ColleagueStandingWeek } from "../standing-week/ColleagueStandingWeek";
import { mayReadWeeks, worksAt } from "../standing-week/present";
import { YourWeek } from "./YourWeek";
import { MyClients } from "./MyClients";
import { cutoverOf } from "../../lib/client-coverage";
import type { RosterStatus } from "../../hooks/useStudioRoster";
import "./trainer-profile.css";

/**
 * TRAINER PROFILE.
 *
 * Replaces src/components/TrainerProfileView.tsx, which was written in a
 * military register nothing else in the app shares ("Tactical Command
 * Center", "Combat Grade Certifications", "Total Ops Vol", "Guest Credentials
 * (Temporary)") and rendered on a hardcoded navy background that ignored both
 * themes.
 *
 * Two structural changes beyond the surface:
 *
 *  1. It is a FEATURE, not a page. Identity, about, access, schedule and
 *     coached list are separate components over a tested adapter layer,
 *     matching how equipment/ and journey-grid/ are built.
 *  2. Anyone can open it. `visibility` decides what they see, and the rule is
 *     that client names need a studio in common — see visibility.ts.
 */
export interface TrainerProfileViewProps {
  trainer: Trainer;
  authTrainer: Trainer | null;
  schedules: ScheduleEntry[];
  sessions: WorkoutSession[];
  clients: Client[];
  studios: Studio[];
  onSelectClient: (clientId: string) => void;
  setView: (view: any) => void;
  /**
   * The studio client list's state (`useStudioRoster`), so My clients can say
   * "can't read" while it loads or after its read failed rather than listing
   * nobody. Absent (AppContent doesn't pass it yet — a handoff of the
   * Openings round): My clients never says you trained nobody, and with no
   * rows says it can't read.
   */
  rosterStatus?: RosterStatus;
}

export function TrainerProfileView({
  trainer,
  authTrainer,
  schedules,
  sessions,
  clients,
  studios,
  onSelectClient,
  setView,
  rosterStatus,
}: TrainerProfileViewProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const active = useOptionalActiveStudio();
  const activeStudioId = active?.activeStudioId ?? null;

  const visibility = useMemo(
    () => resolveProfileVisibility(authTrainer, trainer),
    [authTrainer, trainer],
  );

  const firstName = (trainer.fullName || "This trainer").split(" ")[0];
  const notice = scopeNotice(visibility.scope, firstName);

  const upcoming = useMemo(
    () => (visibility.showSchedule ? upcomingFor(schedules, trainer, clients, sessions) : []),
    [schedules, trainer, clients, sessions, visibility.showSchedule],
  );

  const counters = useTrainerRollups(trainer?.id);
  const stats = useMemo(() => deriveTrainerStats(trainer, Date.now(), counters), [trainer, counters]);

  const { rows: coached } = useRecentlyCoached(trainer, clients, sessions, {
    enabled: visibility.showRecentlyCoached,
  });

  const openClient = (clientId: string) => {
    onSelectClient(clientId);
    setView("profile");
  };

  const handleSaveProfile = async (updates: Partial<Trainer>) => {
    if (!trainer.id) return;
    try {
      const ref = doc(db, "trainers", trainer.id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, updates);
      } else {
        // The old fallback spread the WHOLE trainer object back in, which now
        // means re-sending `rollups` and `mindbody` — both server-write-only
        // since this round, so the rules would reject the save. Strip them:
        // they are derived data and a client has no business restating them.
        const { rollups: _rollups, mindbody: _mindbody, ...seed } = trainer;
        await setDoc(ref, { ...seed, ...updates, createdAt: new Date() });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `trainers/${trainer.id}`);
      throw e;
    }
  };

  return (
    <div className="tp">
      {notice && (
        <div className="tp-notice">
          <Eye size={15} aria-hidden />
          {notice}
        </div>
      )}

      <IdentityBar
        trainer={trainer}
        studios={studios}
        visibility={visibility}
        onEdit={() => setIsEditOpen(true)}
        onOpenCalendar={() => setView("calendar")}
      />

      {visibility.showCoachingLoad && <CoachingLoad stats={stats} />}

      <div className="tp-band">
        <AboutPanel trainer={trainer} visibility={visibility} />
        <StudioAccessPanel trainer={trainer} studios={studios} />
      </div>

      {/* Above the schedule on purpose: the schedule answers "what is next",
          the roster answers "who am I actually working on", and the second is
          the question a profile page exists for. Only the owner can curate it
          -- leadership can change someone's role and studio access without
          editing who they watch, which firestore.rules enforces too. */}
      {visibility.showRoster && (
        <KaizenRoster
          trainer={trainer}
          clients={clients}
          schedules={schedules}
          canEdit={visibility.scope === "self"}
          onSelectClient={openClient}
        />
      )}

      {/* Openings round, phase 12 (Sep 27 2026): the clients you have trained
          most in Journey at the studio the iPad is in, coached lately first.
          Right after the Kaizen Roster, and yours alone: the roster is who
          you chose to track, this is who you have trained. No new read. */}
      {visibility.scope === "self" && activeStudioId && (
        <MyClients
          trainer={trainer}
          uid={auth.currentUser?.uid ?? null}
          clients={clients}
          studioId={activeStudioId}
          studioName={active?.activeStudio?.name ?? "this studio"}
          cutover={active?.activeStudio?.journeyCutoverDate ?? cutoverOf(studios, activeStudioId)}
          rosterStatus={rosterStatus}
          tz={active?.activeStudio?.timezone || undefined}
          onSelectClient={openClient}
        />
      )}

      {/* Renewals round (Sep 2026): the trainer's own list only. */}
      {visibility.scope === "self" && (
        <MyRenewals trainer={trainer} onSelectClient={openClient} />
      )}

      {/* Voice-review round (Sep 27 2026): the trainer proposes their usual
          week at the studio the iPad is in; a leader agrees it on My Studio
          -> Team. Only where they work, which is what the rules ask too. The
          document is keyed by the Auth uid, never trainer.id. */}
      {visibility.scope === "self" && activeStudioId && worksAt(trainer, activeStudioId) && (
        <MyStandingWeek
          trainer={trainer}
          authUid={auth.currentUser?.uid ?? trainer.authUid ?? trainer.id}
          studioId={activeStudioId}
          studioName={active?.activeStudio?.name ?? "this studio"}
          clients={clients}
        />
      )}

      {/* Openings round, phase 11 (Sep 27 2026): Your week at the studio
          the iPad is in -- clients trained, sessions, session time and first
          session to last. The trainer's own profile only; leaders already
          see clients and training hours on Operations -> Insights -> Hours. */}
      {visibility.scope === "self" && activeStudioId && trainer.id && (
        <YourWeek
          trainerId={trainer.id}
          studioId={activeStudioId}
          studioName={active?.activeStudio?.name ?? "this studio"}
          studio={active?.activeStudio ?? null}
          tz={active?.activeStudio?.timezone || undefined}
        />
      )}

      {/* Voice review follow-up (Sep 27 2026), AJ: "schedules are open to
          all". A colleague's agreed week and days away, read only, at the
          studio the iPad is in: where they work, where you may read the
          weeks, and where you share a floor (it names their regulars). */}
      {visibility.scope !== "self" &&
        visibility.showSchedule &&
        activeStudioId &&
        worksAt(trainer, activeStudioId) &&
        mayReadWeeks(authTrainer, activeStudioId) && (
          <ColleagueStandingWeek
            trainer={trainer}
            studioId={activeStudioId}
            studioName={active?.activeStudio?.name ?? "this studio"}
            tz={active?.activeStudio?.timezone || undefined}
          />
        )}

      {(visibility.showSchedule || visibility.showRecentlyCoached) && (
        <div className="tp-band tp-band--even">
          {visibility.showSchedule && (
            <TodaySchedule rows={upcoming} onSelectClient={openClient} />
          )}
          {visibility.showRecentlyCoached && (
            <RecentlyCoached
              rows={coached}
              windowLabel="Last 30 days"
              onSelectClient={openClient}
            />
          )}
        </div>
      )}

      {visibility.canEdit && (
        <EditTrainerModal
          trainer={trainer}
          authTrainer={authTrainer}
          studios={studios}
          isOpen={isEditOpen}
          onOpenChange={setIsEditOpen}
          onSave={handleSaveProfile}
        />
      )}
    </div>
  );
}
