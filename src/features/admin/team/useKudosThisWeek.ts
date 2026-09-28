/**
 * THE KUDOS EACH PERSON WAS GIVEN THIS WEEK — Relay's own roll-up, read the
 * way My Studio → Team reads it.
 *
 * The redesign's Operations room, phase 6 (Sep 28 2026). Team → This week's
 * Recognise line carries the kudos the team gave each person in the last
 * seven days: the existing kudos (relay/board/kudos.ts — "one tap of thanks
 * on something a teammate closed"), counted by the same function from the
 * same three reads as relay/team/TeamPanel.tsx (the week's task rows, the
 * team jobs, the ANSWERED asks), so Operations and My Studio never show two
 * numbers for one person. Kudos are shown to leaders and to the person
 * (the Relay round); Operations is leaders only.
 *
 * Null until every read has answered, and null when the task rows or the
 * jobs couldn't be read (or the asks, once that read says so): the number is
 * left out rather than shown short. The card only ever says a positive
 * number, so "no kudos" is never claimed from a read that failed.
 *
 * This is the one file in Operations that reaches into Relay's folders; if
 * the Relay room moves those reads, this is the import to follow.
 */
import { useMemo } from "react";
import { studioDateKey } from "../../../lib/studio-time";
import { kudosReceived } from "../../relay/board/kudos";
import { useTeamJobs } from "../../relay/jobs/useTeamJobs";
import { firstDayOf } from "../../relay/team/accountability";
import { useStudioRequests } from "../../studio-tasks/useStudioRequests";
import { useTaskCompliance } from "../../studio-tasks/useTaskCompliance";
import type { TaskTemplate } from "../../studio-tasks/types";

const DAYS = 7;
const NO_TEMPLATES: TaskTemplate[] = [];

export function useKudosThisWeek(studioId: string | null): ReadonlyMap<string, number> | null {
  const compliance = useTaskCompliance(studioId, NO_TEMPLATES, DAYS);
  const jobs = useTeamJobs(studioId);
  const requests = useStudioRequests(studioId);
  const todayKey = studioDateKey(new Date()) ?? "";
  const requestsFailed = (requests as { failed?: boolean }).failed === true;
  return useMemo(() => {
    if (!studioId || compliance.loading || jobs.loading || requests.loading) return null;
    if (compliance.error || jobs.error || requestsFailed) return null;
    return kudosReceived({
      instances: compliance.instances,
      jobs: jobs.jobs,
      requests: requests.recentlyResolved,
      since: todayKey ? firstDayOf(todayKey, DAYS) : undefined,
    });
  }, [studioId, compliance.loading, compliance.error, compliance.instances, jobs.loading, jobs.error, jobs.jobs, requests.loading, requests.recentlyResolved, requestsFailed, todayKey]);
}
