/**
 * OPERATIONS → TODAY — the first page of Operations.
 *
 * Operations overhaul, Sep 2026 (then "Overview"). AJ (Sep 19): "studio
 * management opens this every day. A summary layer, not a destination." The
 * redesign's Operations room (Sep 28 2026, phase 2) made it the brief: one
 * bottom line written by rules, then the same sections in the same order
 * every day (TodayBrief.tsx has the page and brief.ts its rules).
 *
 *   one studio         the brief (TodayBrief)
 *   All my studios     the network view (../network/): the setup health and,
 *                      for franchise owners and the company, the network's
 *                      focus and a launch at every studio
 *   a franchise owner  who sees one studio has no All my studios, so the
 *                      network's actions sit at the foot of the brief
 */
import { Activity } from "lucide-react";
import { auth } from "../../../firebase";
import type { Client, FranchiseNetwork, Machine, ScheduleEntry, Studio, Trainer } from "../../../types";
import { studioDateKey } from "../../../lib/studio-time";
import { NetworkOverview } from "../network/NetworkOverview";
import { NetworkActions } from "../network/NetworkActions";
import { mayActForNetwork } from "../network/network-actions";
import { AdminEmpty, AdminHeader, AdminScreen } from "../primitives";
import { useOperationsScope } from "../scope-context";
import { useMinuteClock } from "../shell/useMinuteClock";
import type { OpsDoor } from "../shell/places";
import { TodayBrief } from "./TodayBrief";

/** Where a door on the page goes: the page each old tab moved to, or the week (shell/places.ts, DOOR_PLACE). */
export type OverviewLink = OpsDoor;

export interface OverviewPageProps {
  /** Bumped by the shell when Today is pressed while already on it: the page comes home from the attendance watch. */
  homeSignal?: number;
  authTrainer: Trainer;
  studios: Studio[];
  trainers: Trainer[];
  machines: Machine[];
  clients: Client[];
  /** The app's live schedule. Kept for the shell's call site; the page reads its own week. */
  schedules?: ScheduleEntry[];
  activeStudioId: string | null;
  onNavigateProfile?: (clientId: string) => void;
  onOpen?: (to: OverviewLink) => void;
  /** The franchise networks, for the network's focus (voice-review round, Sep 27 2026). */
  networks?: FranchiseNetwork[];
  /**
   * Switches the app to My Studio, in trainer mode (the shell's
   * `onOpenStudioTasks`). The page says which section first, as the Staff &
   * Roles door does: Openings' line opens Openings, the live floor opens Relay.
   */
  onOpenMyStudio?: () => void;
  /** What Needs you counts, for the menu's badge; null while unknown. */
  onNeedsCount?: (count: number | null) => void;
  /** Opens a client's session on the floor, to finish one left open (Oct 2 2026). */
  onOpenSession?: (clientId: string) => void;
}

export function OverviewPage({ homeSignal = 0, authTrainer, studios, trainers, machines, clients, activeStudioId, onNavigateProfile, onOpen, networks = [], onOpenMyStudio, onNeedsCount, onOpenSession }: OverviewPageProps) {
  const ops = useOperationsScope();
  const now = useMinuteClock();

  const studio = studios.find((s) => s.id === activeStudioId) ?? null;
  const tz = studio?.timezone || undefined;
  const today = studioDateKey(now, tz) ?? "";

  if (ops.scope.kind === "all") {
    return (
      <AdminScreen>
        <AdminHeader icon={<Activity className="w-5 h-5" />} title="All my studios" subtitle={`${ops.studios.length} studios. Is anything wrong at any of them this morning?`} />
        <NetworkOverview studios={ops.studios} trainers={trainers} now={now.getTime()} />
        <NetworkActions trainer={authTrainer} uid={auth.currentUser?.uid ?? null} studios={ops.studios} networks={networks} todayKey={today || studioDateKey(now) || ""} />
      </AdminScreen>
    );
  }

  if (!activeStudioId || !studio) {
    return (
      <AdminScreen>
        <AdminHeader icon={<Activity className="w-5 h-5" />} title="Today" />
        <AdminEmpty title="No studio">Switch the app to a studio to read its day.</AdminEmpty>
      </AdminScreen>
    );
  }

  /* The network's focus and launch moved here from Relay → Network (voice-
     review round, Sep 27 2026) under "All my studios". A franchise owner who
     sees only one studio has no "All my studios" to choose, so they find
     them at the foot of that studio's page instead. */
  const networkFooter =
    !ops.canSpan && mayActForNetwork(authTrainer) ? (
      <NetworkActions trainer={authTrainer} uid={auth.currentUser?.uid ?? null} studios={[studio]} networks={networks} todayKey={today} />
    ) : null;

  return (
    <TodayBrief
      key={studio.id}
      footer={networkFooter}
      homeSignal={homeSignal}
      studio={studio}
      studios={studios}
      today={today}
      now={now}
      me={{ id: auth.currentUser?.uid ?? authTrainer.authUid ?? authTrainer.id ?? "", name: authTrainer.fullName }}
      authTrainer={authTrainer}
      trainers={trainers}
      machines={machines}
      clients={clients}
      onNavigateProfile={onNavigateProfile}
      onOpen={onOpen}
      onOpenMyStudio={onOpenMyStudio}
      onNeedsCount={onNeedsCount}
      onOpenSession={onOpenSession}
    />
  );
}
