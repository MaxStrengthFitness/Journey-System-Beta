/**
 * ACTIVE OR INACTIVE, on her profile — Notes & Profile → Account.
 *
 * The inactive round (Oct 1 2026; AJ: studios "manually set clients
 * inactive", by studio leaders). The same panel Operations draws under her
 * journey (admin/journey/InactiveMark.tsx), here for her HOME studio: its
 * leaders mark her inactive or active again; every other reader sees it read
 * only. Two reads, both small: her one mark document at her home studio, and
 * the studio's settings (its Inactive line), which every screen already
 * shares.
 *
 * "Inactive by herself" is said off last night's record, as the profile
 * holds it (`client.renewal`: her last visit and her next booking as the
 * nightly job read them), on the Journey's own evidence: a known last visit,
 * nothing booked, past the studio's line, and a record that is there. A
 * client Journey can't judge is never called Inactive here either; and
 * Operations → Clients → Journey is where the full rule (Away, the week's
 * bookings) is applied.
 */
import { useMemo } from "react";
import type { Client, Trainer } from "../../types";
import { daysBetween } from "../client-history/model";
import { leadsHere } from "../relay/leads";
import { useStudioSettings } from "../studio-settings/useStudioSettings";
import { linesOf } from "../admin/journey/states";
import { markHolds, pastInactiveLine } from "../admin/journey/inactive";
import { useInactiveMark } from "../admin/journey/inactive-store";
import { InactiveMarkPanel } from "../admin/journey/InactiveMark";

export interface StandingCardProps {
  client: Client;
  /** The signed-in trainer (the live copy where there is one: it sees the grant). */
  trainer: Trainer | null;
  /** The studio's day, yyyy-mm-dd. */
  today: string;
}

const dayWords = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

/** Inactive by herself, in a sentence, off last night's record; null when she isn't, or it can't be said. */
export function automaticFromRecord(client: Client, today: string, inactiveDays: number): string | null {
  const r = client.renewal as { lastVisitDate?: unknown; nextBookingDate?: unknown; situation?: unknown } | undefined;
  if (!r || r.situation === "away") return null;
  const last = typeof r.lastVisitDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.lastVisitDate) ? r.lastVisitDate : null;
  const days = last ? daysBetween(last, today) : null;
  if (!pastInactiveLine(days, !r.nextBookingDate, inactiveDays)) return null;
  return `${days} days since the last visit (${dayWords(last as string)}), past the studio's ${inactiveDays}-day line, with nothing booked as of last night's record, so inactive.`;
}

export function StandingCard({ client, trainer, today }: StandingCardProps) {
  const home = client.homeStudioId || (client as { studioId?: string }).studioId || null;
  const read = useInactiveMark(home, client.id ?? null);
  const settings = useStudioSettings(home);
  const inactiveDays = useMemo(() => linesOf(settings.all).inactiveDays, [settings.all]);
  const lastVisit = typeof client.renewal?.lastVisitDate === "string" ? client.renewal.lastVisitDate : null;
  if (!home || !client.id) return null;
  const marked = read.mark && markHolds(read.mark, lastVisit);
  const automatic = !marked && !settings.loading ? automaticFromRecord(client, today, inactiveDays) : null;
  const name = [client.firstName, client.lastName].filter(Boolean).join(" ") || "This client";
  return (
    <div id="account-standing">
      <InactiveMarkPanel
        studioId={home}
        clientId={client.id}
        clientName={name}
        mark={read.mark}
        read={read.loading ? "loading" : read.failed ? "failed" : "ready"}
        lastVisit={lastVisit}
        automatic={automatic}
        leads={leadsHere(trainer, home)}
        markerName={trainer?.fullName ?? ""}
        today={today}
      />
    </div>
  );
}
