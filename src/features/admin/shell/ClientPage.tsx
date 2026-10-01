/**
 * A CLIENT, OPENED INSIDE OPERATIONS.
 *
 * The redesign's Operations room (Sep 28 2026). The pin on today's screen:
 * "Tapping a client leaves Operations, so the tab, the list and your scroll
 * are lost." Now a tap on a client anywhere in Operations opens her here,
 * beside the menu, with the page she was tapped from kept as it was behind
 * her (the shell hides it, never unmounts it); Back returns to it at the
 * same place. Her full profile is one tap further, and coming back to
 * Operations from it lands here again (shell/place-memory.ts).
 *
 * What it says, and where each word comes from — nothing is read here that
 * Operations doesn't already read:
 *
 *   last in, next, left, sessions, since   the Client Directory's ONE row
 *                                          model (client-directory/row.ts),
 *                                          over the roster, the week's
 *                                          bookings as the server answered
 *                                          them, and the studio's package
 *                                          table
 *   the renewal line                       last night's snapshot through
 *                                          renewalOf (her auto-renewal mark
 *                                          applied now), in the renewals'
 *                                          own words (sentences.ts)
 *   her journey and her case               the Journey's rules (journey/),
 *                                          for a client whose home is this
 *                                          studio (phase 4)
 *
 * Every "Unknown" says why, in words on the page, never only in a tooltip.
 * A client whose whole history predates Journey is never called new: the row
 * model's coverage rules (lib/prior-history) decide every count.
 */
import { useMemo, type ReactNode } from "react";
import { ChevronLeft, ExternalLink } from "lucide-react";
import type { Client, ScheduleEntry, Studio, Trainer, WorkoutSession } from "../../../types";
import { auth } from "../../../firebase";
import { myTrainerIds } from "../../../lib/live-session";
import { studioTodayKey } from "../../../lib/studio-time";
import { buildDirectoryRow, prepareDirectory, type DirectoryRow } from "../../client-directory/row";
import { buildPackageNameIndex } from "../../renewals/settings";
import { chipText, paceSentence, situationSentence } from "../../renewals/sentences";
import type { RenewalSnapshot } from "../../renewals/types";
import { renewalOf } from "../../renewals/auto-renew";
import { useRenewalSettings } from "../../renewals/useRenewalSettings";
import { AdminButton, AdminNotice } from "../primitives";
import { JourneyCase } from "../journey/JourneyCase";
import { useStudioJourneys } from "../journey/useStudioJourneys";
import { useMinuteClock } from "./useMinuteClock";
import "./ops.css";

export interface ClientPageProps {
  clientId: string;
  /** The roster the app streams (the studio's clients, and anyone booked here). */
  clients: Client[];
  studios: Studio[];
  /** The bookings the app already holds (about a week), and the day's sessions. */
  schedules: ScheduleEntry[];
  sessions: WorkoutSession[];
  trainers: Trainer[];
  authTrainer: Trainer;
  activeStudioId: string | null;
  now?: Date;
  /** Where Back goes, in words ("Today", "Clients · Renewals"). */
  backLabel: string;
  onBack: () => void;
  /** Her full profile, in the app (leaves Operations; coming back lands here). */
  onOpenProfile?: (clientId: string) => void;
  children?: ReactNode;
}

function Fact({ label, value, sub, why }: { label: string; value: string; sub?: string | null; why?: string | null }) {
  return (
    <div className="ops-fact">
      <dt className="ops-fact__k">{label}</dt>
      <dd className="ops-fact__v">{value}</dd>
      {sub && <dd className="ops-fact__sub">{sub}</dd>}
      {why && <dd className="ops-fact__why">{why}</dd>}
    </div>
  );
}

/**
 * The directory's row for one client from the bookings the app holds — for a
 * client whose home is another studio, whose journey this studio doesn't
 * keep.
 */
export function useClientRow(input: Omit<ClientPageProps, "backLabel" | "onBack" | "onOpenProfile" | "children">): { client: Client | null; row: DirectoryRow | null; today: string } {
  const { clientId, clients, studios, schedules, sessions, trainers, authTrainer, activeStudioId } = input;
  const studio = studios.find((s) => s.id === activeStudioId) ?? null;
  const tz = studio?.timezone || undefined;
  const now = input.now ?? new Date();
  const today = studioTodayKey(now, tz);
  const client = clients.find((c) => c.id === clientId) ?? null;
  const settings = useRenewalSettings(activeStudioId);
  const packageIndex = useMemo(() => {
    if (settings.loading || settings.error || settings.forStudioId !== activeStudioId) return null;
    return buildPackageNameIndex(settings.settings);
  }, [settings.loading, settings.error, settings.forStudioId, settings.settings, activeStudioId]);
  const uid = auth.currentUser?.uid ?? null;
  const row = useMemo(() => {
    if (!client) return null;
    const names = new Map(trainers.filter((t) => t.id).map((t) => [t.id as string, t.nickname?.trim() || t.fullName]));
    const ctx = prepareDirectory({
      today,
      now,
      tz,
      studios,
      activeStudioId,
      schedules,
      // The shell is not told how fresh the held bookings are, so no row says
      // "Nothing booked" off them: a missing booking reads as unknown.
      bookingsFresh: false,
      recentSessions: sessions,
      packageIndex,
      packageStudioId: activeStudioId,
      myIds: myTrainerIds(authTrainer, uid),
      myName: authTrainer.fullName ?? null,
      trainerNameOf: (id) => names.get(id) ?? null,
    });
    return buildDirectoryRow(client, ctx);
    // `now` is read once per render on purpose: the page re-renders on every snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, today, tz, studios, activeStudioId, schedules, sessions, packageIndex, authTrainer, uid, trainers]);
  return { client, row, today };
}

const NO_STUDIO = { id: "" } as Studio;

export function ClientPage(props: ClientPageProps) {
  const { clientId, backLabel, onBack, onOpenProfile, children, studios, clients, trainers, authTrainer, activeStudioId } = props;
  const clock = useMinuteClock();
  const now = props.now ?? clock;
  const studio = studios.find((s) => s.id === activeStudioId) ?? null;
  // Her journey, for a client whose home is this studio: the Journey's own rules and reads.
  const journeys = useStudioJourneys({ studio: studio ?? NO_STUDIO, studios, clients, trainers, authTrainer, now, only: clientId });
  const entry = journeys.entries.find((e) => e.id === clientId) ?? null;
  const plain = useClientRow({ ...props, now });
  const client = plain.client;
  const row = entry?.row ?? plain.row;
  const today = journeys.today || plain.today;
  // Last night's snapshot with her auto-renewal mark and the lock applied as
  // they are now (renewals/auto-renew.ts): one client, so renewalOf.
  const renewal: RenewalSnapshot | null = useMemo(() => renewalOf(client), [client]);
  const me = { id: auth.currentUser?.uid ?? authTrainer.authUid ?? authTrainer.id ?? "", name: authTrainer.fullName };

  return (
    <section className="ops-client" aria-label={row ? `${row.name.display}, opened in Operations` : "A client, opened in Operations"}>
      <button type="button" className="ops-back" onClick={onBack}>
        <ChevronLeft className="w-4 h-4" aria-hidden /> {backLabel}
      </button>

      {!client || !row ? (
        <>
          <AdminNotice tone="info">This client isn't on this studio's list on this iPad, so Operations can't say more here. Her full profile has everything.</AdminNotice>
          {onOpenProfile && (
            <div className="ops-client__acts">
              <AdminButton variant="primary" onClick={() => onOpenProfile(clientId)}>
                Open full profile <ExternalLink className="w-4 h-4" aria-hidden />
              </AdminButton>
            </div>
          )}
        </>
      ) : (
        <>
          <header className="ops-client__head">
            <div>
              <span className="ops-client__eyebrow">Client</span>
              <h1 className="ops-client__name">{row.name.display}</h1>
              <p className="ops-client__meta">
                {[
                  row.since.label ? `${row.since.label} ${row.since.text}` : null,
                  row.visitingFrom ? `Home studio: ${row.visitingFrom}` : null,
                  entry?.usual ? `Usually with ${entry.usual.name}` : null,
                  ...row.badges,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Nothing on file about when she started."}
              </p>
            </div>
            {onOpenProfile && (
              <div className="ops-client__acts">
                <AdminButton variant="primary" onClick={() => onOpenProfile(clientId)}>
                  Open full profile <ExternalLink className="w-4 h-4" aria-hidden />
                </AdminButton>
              </div>
            )}
          </header>

          <dl className="ops-facts">
            <Fact label="Last in" value={row.lastIn.text} sub={row.lastIn.sub} why={row.lastIn.state === "known" ? null : row.lastIn.reason} />
            <Fact label="Next" value={row.next.text} sub={row.next.sub} why={row.next.state === "booked" ? (row.next.source === "nightly" ? row.next.reason : null) : row.next.reason} />
            <Fact label={row.left.perPayment ? "On hand in contract" : "Left in contract"} value={row.left.text} sub={row.left.sub} why={row.left.reason} />
            <Fact label="Sessions" value={row.total.text} sub={row.total.sub} why={row.total.reason} />
          </dl>

          <div>
            <p className="ops-line">
              <b>Renewal:</b> {renewal ? `${situationSentence(renewal, today)}.` : `${chipText(null, today)}. Last night's record hasn't reached her yet.`}
            </p>
            {renewal && <p className="ops-quiet">{paceSentence(renewal)}.</p>}
          </div>

          {entry && studio?.id ? (
            <JourneyCase
              entry={entry}
              studioId={studio.id}
              today={today}
              me={me}
              tz={studio.timezone || undefined}
              trainers={trainers}
              authTrainer={authTrainer}
              casesFailed={journeys.cases.failed}
              inactiveMark={{
                mark: journeys.marks.marks.get(clientId) ?? null,
                read: journeys.marks.loading ? "loading" : journeys.marks.failed ? "failed" : "ready",
              }}
            />
          ) : !journeys.ready ? (
            <p className="ops-quiet">Reading her journey…</p>
          ) : row.visitingFrom ? (
            <p className="ops-quiet">Her home studio, {row.visitingFrom}, keeps her journey.</p>
          ) : null}

          {children}
        </>
      )}
    </section>
  );
}
