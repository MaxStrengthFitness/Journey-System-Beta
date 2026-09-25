import {
  collection,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  doc,
  documentId,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { parkPullSyncBooking } from "./mindbody-limbo";
import { chooseClientDoc, siteOfClient, siteQualifiedClientId } from "./mindbody-site";
import { extractBookingExtras } from "./mindbody-pass";
import { authedFetch } from "./authed-fetch";
import { clientLegalName } from "./client-name";
import { Trainer, Client, Studio } from "../types";
import {
  wallClockToInstant,
  isValidTimeZone,
  DEFAULT_TIME_ZONE,
  studioTodayKey,
  studioDayBoundsForKey,
  studioDateKey,
  toDate,
} from "./studio-time";

/**
 * How a pull should behave beyond its window (the lean pull, Sep 25 2026).
 *
 * skipKnownClientLookups — ask Mindbody's client lookup only about clients
 * Journey does not already hold for this site. The lookup exists to name a
 * booking and to fill a new or blank client record; for a client the roster
 * already names, every pull used to pay 1 call per 20 of them to learn the
 * same name again. The whole-month pull still looks everyone up, which is
 * what keeps names and blank contact fields current.
 */
export interface SyncOptions {
  skipKnownClientLookups?: boolean;
  /**
   * A near pull that LOSES a booking from its window cannot tell a
   * cancellation from a move to a later day: the booking is simply absent
   * from a two-day answer. With this set, such a pull cancels nothing and
   * asks Mindbody for this wider window straight away, and that pull files
   * the booking as whichever it was: moved (with its move stamps) or
   * cancelled by its own sweep (the review of phase 1, Sep 25 2026).
   */
  settleSweepWith?: { start: string; end: string };
}

export interface MindbodySyncResult {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
  /** Canonical client docs created because Mindbody knew someone we did not. */
  clientsCreated?: number;
  /** Mindbody answered for the WHOLE window asked (every page arrived). */
  windowComplete?: boolean;
  /** Bookings this pull marked cancelled because they vanished from its window. */
  swept?: number;
  /** Bookings that left a near window, handed to the wider pull to decide. */
  sweepDeferred?: number;
  /** A settleSweepWith pull ran, and Mindbody answered for its whole window. */
  settledWithMonth?: boolean;
}

export interface MindbodyAppointment {
  Id: number;
  StaffId: number;
  StaffFirstName?: string;
  StaffLastName?: string;
  ClientId?: string;
  ClientFirstName?: string;
  ClientLastName?: string;
  ClientPhone?: string;
  ClientEmail?: string;
  ClientDOB?: string;
  ClientGender?: string;
  ClientAddress?: string;
  ClientPhotoUrl?: string;
  ClientEmergencyName?: string;
  ClientEmergencyPhone?: string;
  StartDateTime: string;
  EndDateTime: string;
  Status?: string;
  SessionTypeName?: string;
  LocationId?: number;
  /**
   * Pass / waitlist / visit-count passthrough from server.ts's normalizer.
   * Mindbody's published appointment schema does not document these (they
   * appear on class bookings), so expect null until proven otherwise.
   */
  ClientPassId?: string | number | null;
  ClientPassSessionsTotal?: number | null;
  ClientPassSessionsDeducted?: number | null;
  ClientPassSessionsRemaining?: number | null;
  ClientPassActivationDateTime?: string | null;
  ClientPassExpirationDateTime?: string | null;
  BookingOriginatedFromWaitlist?: boolean | null;
  ClientsNumberOfVisitsAtSite?: number | null;
}

/**
 * Strict canonical client resolution. The doc id IS the join key.
 *
 * Fuzzy name matching used to live here — it compared "Judy D." against every
 * client's first name plus a last initial. It is gone deliberately. Name
 * matching is what allowed one person to exist as two documents (the webhook
 * keying on the Mindbody id, this importer keying on a name), and a wrong match
 * files a session against the wrong client's medical record.
 *
 * A fallback that searched the `mindbodyClientId` / `mindbodyId` FIELDS was
 * also removed, to match the webhook's strict mode. Keeping it would recreate
 * the very split being fixed: this importer would link the schedule to a stale
 * document while the webhook wrote the canonical one.
 */
function resolveCanonicalClientId(
  mbClientId: string | null,
  clientsData: Client[],
  /** The Mindbody site the id belongs to: `{site}-{id}`, the second person's
   *  record (lib/mindbody-site.ts), wins over the plain id. The caller has
   *  already dropped other-site clients from `clientsData`. */
  siteId: string,
): string | null {
  if (!mbClientId) return null;
  const target = String(mbClientId).trim();
  if (!target) return null;

  const qualified = siteQualifiedClientId(siteId, target);
  const canonical =
    clientsData.find((c) => c.id && String(c.id).trim() === qualified) ??
    clientsData.find((c) => c.id && String(c.id).trim() === target);
  return canonical ? canonical.id || null : null;
}

/**
 * A record whose name is only the stand-in this importer writes when Mindbody
 * gave none ("Mindbody" / "Client {id}"), or a webhook's booking stub. Neither
 * is a name to put on a booking, so the lean pull keeps looking such a client
 * up until Mindbody names them (the review of phase 1, Sep 25 2026).
 */
function isPlaceholderRecord(record: Client, mbClientId: string): boolean {
  if ((record as { isMindbodyStub?: boolean }).isMindbodyStub) return true;
  return (
    (record.firstName || "").trim() === "Mindbody" &&
    (record.lastName || "").trim() === `Client ${mbClientId}`
  );
}

/**
 * Creates the canonical client document for an appointment whose client we have
 * never seen.
 *
 * Without this, removing fuzzy matching would produce MORE unlinked blocks, not
 * fewer: the webhook only runs against the live project, so on staging (and for
 * any booking whose client event was missed) this importer is the only thing
 * that can bring a client into the database. Appointment payloads carry enough
 * to build a complete profile.
 *
 * `homeStudioId` is safe to set here — unlike a webhook, this importer is
 * explicitly scoped to one studio, which the caller has already resolved from
 * the appointment's own location. The caller MUST only pass appointments that
 * genuinely belong to `studioId`, or clients land in the wrong tenant.
 */
function buildCanonicalClientPayload(
  appt: MindbodyAppointment,
  mbClientId: string,
  studioId: string,
  /**
   * Earliest appointment we saw for this client anywhere in this sync window.
   * Becomes `firstAppointmentDate`, which is what the profile card means by
   * "Client since". Optional so existing callers and tests are unaffected.
   */
  earliestAppointment?: Date | null,
  /** The Mindbody site `mbClientId` belongs to (lib/mindbody-site.ts). */
  siteId?: string,
): Record<string, any> {
  const firstName = (appt.ClientFirstName || "").trim();
  const lastName = (appt.ClientLastName || "").trim();

  const payload: Record<string, any> = {
    firstName: firstName || "Mindbody",
    lastName: lastName || `Client ${mbClientId}`,
    mindbodyClientId: mbClientId,
    ...(siteId ? { mindbodySiteId: String(siteId).trim() } : {}),
    mindbody_name: `${firstName} ${lastName}`.trim(),
    homeStudioId: studioId,
    isActive: true,
    height: "",
    remainingSessions: 0,
    sessionCount: 0,
    completedSessions: 0,
    createdAt: Timestamp.now(),
    mindbodySyncedAt: Timestamp.now(),
    createdBy: "mindbody:pull-sync",
    isMindbodyStub: false,
  };

  /*
   * CLIENT SINCE.
   *
   * `createdAt` above is when JOURNEY first heard of this person, and the
   * profile card used to fall back to it -- so a member of eleven years read
   * as joining the day we imported them.
   *
   * The client.created webhook writes the authoritative `firstAppointmentDate`
   * and `mindbodyCreatedAt`, but Mindbody only fires it when a record CHANGES,
   * so a long-standing client has never produced one. This is the best answer
   * available from an appointment payload: the earliest booking in the window
   * we just pulled.
   *
   * It is a CEILING, not the truth -- their real first visit may predate the
   * window -- which is exactly why it is written with a floor-not-overwrite
   * merge below and why the webhook's value always wins. scripts/
   * backfill-client-since.ts is what fixes the ones already in the database.
   */
  if (earliestAppointment && !Number.isNaN(earliestAppointment.getTime())) {
    payload.firstAppointmentDate = Timestamp.fromDate(earliestAppointment);
    payload.firstAppointmentDateSource = "pull-sync:earliest-in-window";
  }

  if (appt.ClientPhone) payload.phone = appt.ClientPhone;
  if (appt.ClientEmail) payload.email = appt.ClientEmail;
  if (appt.ClientDOB) payload.dateOfBirth = appt.ClientDOB;
  if (appt.ClientGender) payload.gender = appt.ClientGender;
  if (appt.ClientAddress) payload.address = appt.ClientAddress;
  if (appt.ClientPhotoUrl) payload.photoUrl = appt.ClientPhotoUrl;
  if (appt.ClientEmergencyName)
    payload.emergencyContactName = appt.ClientEmergencyName;
  if (appt.ClientEmergencyPhone)
    payload.emergencyContactPhone = appt.ClientEmergencyPhone;
  if (typeof appt.ClientsNumberOfVisitsAtSite === "number") {
    payload.clientsNumberOfVisitsAtSite = appt.ClientsNumberOfVisitsAtSite;
  }

  return payload;
}

/**
 * Resolves the studio that owns a MindBody appointment.
 *
 * One MindBody site can contain several locations, each of which is a separate
 * physical studio here, so the location is the only identifier precise enough to
 * file an appointment against. Matching on the site would return whichever studio
 * happened to be first in the array and mix every location's bookings together.
 *
 * Falls back to the site only when exactly one studio claims it, i.e. when there
 * is no ambiguity to get wrong.
 */
export function resolveStudioId(
  locationId: number | string | undefined,
  siteId: string,
  studios: Studio[],
): string | null {
  if (locationId !== undefined && locationId !== null && locationId !== "") {
    const locStr = String(locationId).trim();
    const studioByLocation = studios.find(
      (s) =>
        s.mindbodyLocationId &&
        String(s.mindbodyLocationId).trim() === locStr &&
        s.mindbodySiteId &&
        String(s.mindbodySiteId).trim() === String(siteId).trim(),
    );
    if (studioByLocation) return studioByLocation.id || null;
  }

  const studiosOnSite = studios.filter(
    (s) =>
      s.mindbodySiteId &&
      String(s.mindbodySiteId).trim() === String(siteId).trim(),
  );
  return studiosOnSite.length === 1 ? studiosOnSite[0].id || null : null;
}

/**
 * WHICH OF THESE CLIENTS ALREADY EXIST (hub sync fixes, Sep 16 2026).
 *
 * Phase 1 used to decide "missing" by reading the WHOLE `clients` collection
 * — every client in every studio, on every sync, every 15 minutes. For an
 * administrator that was the app's biggest read bill. For anyone else the
 * rules refused that read, so the sync fell back to the caller's partial
 * roster, and every client not in it was "created" again with a merge write
 * that reset `sessionCount`, `completedSessions`, `remainingSessions`,
 * `height` and `createdAt` on the existing record.
 *
 * Now only the ids the caller's roster does not hold are checked, by id:
 *   existing  a document came back                → never written over
 *   missing   confirmed absent                     → safe to create
 *   refused   the rules would not say              → a trainer may not read a
 *             document that is not there, NOR another studio's client. The
 *             create is tried on its own: it succeeds for a new client and is
 *             refused for someone else's (the update rule is narrower than
 *             the read rule), so nothing is overwritten either way.
 *   unchecked the read failed for another reason   → unknown, not absent:
 *             nothing is created for it this run.
 */
export interface ClientIdCheck {
  existing: Client[];
  missing: Set<string>;
  refused: Set<string>;
  unchecked: Set<string>;
}

const isPermissionDenied = (e: unknown) => {
  const err = e as { code?: string; message?: string } | null;
  return (
    err?.code === "permission-denied" ||
    String(err?.message ?? "").toLowerCase().includes("insufficient permissions")
  );
};

export async function checkClientIds(ids: readonly string[]): Promise<ClientIdCheck> {
  const out: ClientIdCheck = {
    existing: [],
    missing: new Set(),
    refused: new Set(),
    unchecked: new Set(),
  };
  const CHUNK = 10;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    try {
      const snap = await getDocs(
        query(collection(db, "clients"), where(documentId(), "in", part)),
      );
      const found = new Set<string>();
      snap.docs.forEach((d) => {
        found.add(d.id);
        out.existing.push({ id: d.id, ...d.data() } as Client);
      });
      for (const id of part) if (!found.has(id)) out.missing.add(id);
    } catch {
      // One document the rules won't show refuses the whole batch. Ask one
      // at a time so each id gets its own answer.
      await Promise.all(
        part.map(async (id) => {
          try {
            const d = await getDoc(doc(db, "clients", id));
            if (d.exists()) out.existing.push({ id: d.id, ...d.data() } as Client);
            else out.missing.add(id);
          } catch (e) {
            (isPermissionDenied(e) ? out.refused : out.unchecked).add(id);
          }
        }),
      );
    }
  }
  return out;
}

/** A schedule row's start, whatever shape the read gave it. */
function rowStartMs(value: unknown): number | null {
  return toDate(value as Parameters<typeof toDate>[0])?.getTime() ?? null;
}

/**
 * THE CHANGE STAMPS (Operations overhaul, Sep 2026).
 *
 * The sync already noticed when a booking's time moved or Mindbody reported
 * it cancelled — `hasChanged` — and then wrote the new state over the old
 * with no record of what the old state was. The day's Changes list needs
 * exactly that record: a Wednesday cancellation of a Friday session belongs
 * to Friday's list, and "moved from 10:00" is only sayable if someone wrote
 * 10:00 down before overwriting it.
 *
 * Additive fields only, written once per event:
 *   movedFromDay / movedFromStart / movedAt — the studio day and start the
 *     booking was on before Mindbody moved it (the list for THAT day reads
 *     `movedFromDay`; one composite index, studioId + movedFromDay);
 *   cancelledAt / cancelSource — when, and who noticed: "mindbody" here
 *     (its answer said cancelled), "sweep" below (it vanished from the
 *     answer). Cleared when a cancelled booking comes back as Scheduled, so a
 *     restored booking does not keep reading as a cancellation.
 * The webhook (functions/src) still writes `status` alone; a cancellation it
 * delivers shows on the list with no time until it, too, stamps.
 */
export function changeStamps(
  curr: Record<string, any>,
  next: Record<string, any>,
  nextStart: { toMillis: () => number },
  tz: string,
): Record<string, unknown> {
  const stamps: Record<string, unknown> = {};
  const prevStartMs = rowStartMs(curr.startTime);
  if (
    prevStartMs !== null &&
    prevStartMs !== nextStart.toMillis() &&
    curr.status !== "Cancelled"
  ) {
    // The day the OLD start fell on, in the studio's zone, not UTC's: an
    // 8 PM Eastern booking is tomorrow in UTC.
    stamps.movedFromDay = studioDayKeyOfInstant(prevStartMs, tz);
    stamps.movedFromStart = curr.startTime;
    stamps.movedAt = Timestamp.now();
  }
  if (next.status === "Cancelled" && curr.status !== "Cancelled") {
    stamps.cancelledAt = Timestamp.now();
    stamps.cancelSource = "mindbody";
  } else if (next.status === "Scheduled" && curr.status === "Cancelled") {
    stamps.cancelledAt = null;
    stamps.cancelSource = null;
  }
  return stamps;
}

/** `YYYY-MM-DD` of an instant in the studio's zone. */
function studioDayKeyOfInstant(ms: number, tz: string): string {
  return studioDateKey(new Date(ms), tz) ?? new Date(ms).toISOString().slice(0, 10);
}

/**
 * HOW FAR AHEAD A SYNC PULLS.
 *
 * These two numbers are the whole reason a refresh used to take 30-100
 * seconds, so they are worth understanding before changing either.
 *
 * The window does two jobs at once, and they have to stay the same size:
 * it decides which Mindbody appointments are fetched, AND which Journey
 * bookings are compared against them (`windowFrom`/`windowTo` below). Shrink
 * only one and the sweep cancels everything in the gap. They are derived from
 * one number here so that cannot happen.
 *
 * REFRESH_WINDOW_DAYS — what the button in the header pulls. Eight days,
 *   which is `WEEK_AHEAD_DAYS` in lib/schedule-window.ts: exactly what the
 *   Hub's day tabs, the trainer's upcoming list and the Operations week can
 *   display. A trainer who presses Refresh sees everything they could have
 *   been looking at, and nothing they could not.
 *
 *   It used to be 30 days. On Site 29068 that is ~3,800 appointments across
 *   three studios fetched before the spinner stops, to render eight days of
 *   one studio.
 *
 * DEEP_WINDOW_DAYS — what the background auto-sync pulls, unchanged at 30.
 *   The calendar can ask Firestore for any month it likes, but Firestore only
 *   holds what a sync put there, so something has to keep reaching past the
 *   week. Nobody watches the auto-sync, so it can afford to.
 *
 * If you want the button to cover only today, this is the line: make it 1.
 * The cost is that a booking made for next Tuesday will not appear until the
 * auto-sync's next pass.
 */
export const REFRESH_WINDOW_DAYS = 8;
export const DEEP_WINDOW_DAYS = 30;

/**
 * NEAR_WINDOW_DAYS — what the fifteen-minute background pull asks for between
 * whole-month pulls (the lean pull, Sep 25 2026): today and tomorrow, the two
 * days the Hub watches live. On a shared site that is one page of 500 instead
 * of up to eight. Days further out are reached by the whole-month pull a few
 * times a day (features/admin/syncPolicy.ts, DEEP_PULL_HOURS) and at once by
 * Refresh. The sweep stays tied to the window like every other pull, so a
 * near pull never cancels anything beyond tomorrow.
 */
export const NEAR_WINDOW_DAYS = 1;

/** The day keys a sync should ask for, in the studio's own day. */
export function syncWindow(
  timeZone?: string,
  days: number = REFRESH_WINDOW_DAYS,
  now: Date = new Date(),
): { start: string; end: string } {
  const safeDays = Number.isFinite(days) && days >= 0 ? Math.floor(days) : REFRESH_WINDOW_DAYS;
  return {
    start: studioTodayKey(now, timeZone),
    end: studioTodayKey(new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000), timeZone),
  };
}

export async function syncMindbodySchedules(
  siteId: string,
  trainers: Trainer[],
  clients: Client[],
  studios: Studio[],
  targetStaffId?: string | null,
  startDate?: string,
  endDate?: string,
  targetStudioIdOverride?: string | null,
  targetLocationId?: string | number | null,
  options: SyncOptions = {},
): Promise<MindbodySyncResult> {
  const result: MindbodySyncResult = {
    added: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
  const now = new Date();
  // No explicit window means the deep one: the background auto-sync is the
  // caller that relies on the default, and it is the one that has to keep the
  // calendar's forward months populated. The header's Refresh button passes
  // REFRESH_WINDOW_DAYS instead. See syncWindow above.
  const fallback = syncWindow(undefined, DEEP_WINDOW_DAYS, now);
  const start = startDate || fallback.start;
  const end = endDate || fallback.end;

  let targetTrainers = trainers;
  let staffIdsToFetch: string[] = [];

  if (targetStaffId) {
    targetTrainers = trainers.filter((t) => t.id === targetStaffId);
    staffIdsToFetch = targetTrainers
      .map((t) => t.mindbodyStaffId)
      .filter((id): id is string => Boolean(id));
  } else {
    // Studio-wide sync: fetch all staff appointments for the studio
    staffIdsToFetch = [];
  }

  // Resolve the studio being synced explicitly. Matching by site alone is only
  // safe when a single studio claims it; `studios[0]` used to stand in otherwise,
  // which silently wrote one studio's appointments onto an unrelated studio.
  const studiosOnSite = studios.filter(
    (s) =>
      s.mindbodySiteId &&
      String(s.mindbodySiteId).trim() === String(siteId).trim(),
  );
  const activeStudio = targetStudioIdOverride
    ? studios.find((s) => s.id === targetStudioIdOverride)
    : studiosOnSite.length === 1
      ? studiosOnSite[0]
      : undefined;

  const targetStudioId = activeStudio?.id || null;
  const studioName = activeStudio?.name || "Studio";

  if (!targetStudioId) {
    result.errors.push(
      `Could not determine which studio to sync: MindBody Site ${siteId} is claimed by ${studiosOnSite.length} studios. Open a specific studio and sync from there.`,
    );
    return result;
  }

  const unresolvedLocations = new Set<string>();

  // The studio's own clock defines what MindBody's naive times mean.
  const studioTimeZone = isValidTimeZone(activeStudio?.timezone)
    ? (activeStudio!.timezone as string)
    : DEFAULT_TIME_ZONE;

  const effectiveLocationId =
    targetLocationId !== undefined && targetLocationId !== null
      ? String(targetLocationId).trim()
      : activeStudio?.mindbodyLocationId
      ? String(activeStudio.mindbodyLocationId).trim()
      : null;

  // Sharing a site without a location means every sibling studio's appointments
  // arrive in one undifferentiated batch, so refuse instead of guessing.
  if (studiosOnSite.length > 1 && !effectiveLocationId) {
    result.errors.push(
      `${studioName} shares MindBody Site ${siteId} with ${studiosOnSite.length - 1} other studio(s) but has no Location ID. Set it in Admin → Studios before syncing.`,
    );
    return result;
  }

  /*
   * The clients the lookup may skip: this site's clients the id rule below
   * (resolveCanonicalClientId) will certainly find, and who already have a
   * name. Only those. A client the rule would NOT find is created from the
   * lookup's answer (phase 1), and a skipped lookup would create them nameless.
   */
  /** Runs the wider pull a near pull handed its losses to, and folds it in. */
  const settleWithWiderWindow = async (win: { start: string; end: string }) => {
    const settle = await syncMindbodySchedules(
      siteId,
      trainers,
      clients,
      studios,
      targetStaffId,
      win.start,
      win.end,
      targetStudioIdOverride,
      targetLocationId,
      { skipKnownClientLookups: options.skipKnownClientLookups },
    );
    result.added += settle.added;
    result.updated += settle.updated;
    result.skipped += settle.skipped;
    result.errors.push(...settle.errors);
    result.swept = (result.swept ?? 0) + (settle.swept ?? 0);
    if (settle.clientsCreated) {
      result.clientsCreated = (result.clientsCreated ?? 0) + settle.clientsCreated;
    }
    result.settledWithMonth = settle.windowComplete === true;
  };

  const siteKey = String(siteId).trim();
  const siteClients = clients.filter((c) => {
    const theirs = siteOfClient(c, studios || []);
    return !theirs || theirs === siteKey;
  });
  /** The name on Journey's record for a Mindbody id, when the id rule finds one. */
  const rosterName = (mbId: string | null | undefined): string => {
    const id = mbId ? String(mbId).trim() : "";
    if (!id) return "";
    const resolved = resolveCanonicalClientId(id, siteClients, siteKey);
    const record = resolved ? siteClients.find((x) => x.id === resolved) : undefined;
    return record && !isPlaceholderRecord(record, id) ? clientLegalName(record) : "";
  };
  let skipClientLookupIds: string[] | undefined;
  if (options.skipKnownClientLookups) {
    const known = new Set<string>();
    for (const c of siteClients) {
      const mb = c.mindbodyClientId ? String(c.mindbodyClientId).trim() : "";
      if (!mb || known.has(mb)) continue;
      if (rosterName(mb)) known.add(mb);
    }
    skipClientLookupIds = [...known];
  }

  try {
    const response = await authedFetch("/api/mindbody/staff-appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId,
        startDate: start,
        endDate: end,
        staffIds: staffIdsToFetch.length > 0 ? staffIdsToFetch : undefined,
        /*
         * Both of these are a cost cut, not a correctness change: the proxy
         * uses them to drop the SIBLING studios' appointments before it looks
         * their clients up from Mindbody, which on a shared site is most of
         * the work and most of the wait. Everything below still filters and
         * parks exactly as it did.
         *
         * keepLocationIds is what makes that safe. Without the full list of
         * claimed locations the proxy cannot tell a sibling's booking (drop
         * it, someone else's) from an unmapped one (keep it -- the parking
         * loop below is the only thing that ever surfaces those).
         */
        locationId: effectiveLocationId ?? undefined,
        skipClientLookupIds,
        keepLocationIds: studiosOnSite
          .map((s) => s.mindbodyLocationId)
          .filter((id): id is string | number => id !== undefined && id !== null && String(id).trim() !== "")
          .map((id) => String(id).trim()),
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `API error ${response.status}`);
    }

    const data = await response.json();
    let appointments: MindbodyAppointment[] = data.appointments || [];

    /*
     * Did Mindbody give us the WHOLE window, or only part of it?
     *
     * The sweep at the bottom of this function cancels any booking that is
     * inside the window and absent from this answer. That is correct only if
     * the answer is complete. If one page of eight failed, the bookings on it
     * are not gone -- they are unseen -- and sweeping would cancel live
     * sessions off trainers' schedules because of a transient 500.
     *
     * That is the Aug 30 storm's second cause, word for word: a failed read
     * turned into permanent data loss. A failed read means UNKNOWN, never
     * EMPTY.
     *
     * Older proxies do not send the field. `!== false` keeps them working
     * unchanged rather than silently disabling their sweep.
     */
    const answerComplete = data.complete !== false;
    result.windowComplete = answerComplete;

    // Before narrowing to this studio's location, park anything belonging to a
    // location NO studio claims.
    //
    // This is where the pull path actually lost bookings. The filter below
    // removes them silently, and the `!studioId` guard inside the loop never
    // fires because these never reach it — so a location that came online
    // before anyone mapped it was invisible to trainers with nothing to show
    // for it. Appointments belonging to a SIBLING studio are a different case
    // and are left alone: they are not unmapped, just someone else's.
    for (const a of appointments) {
      if (a.LocationId === undefined || a.LocationId === null) continue;
      if (resolveStudioId(a.LocationId, siteId, studios)) continue;
      try {
        await parkPullSyncBooking({
          siteId: String(siteId),
          appointmentId: a.Id,
          locationId: a.LocationId,
          clientId: a.ClientId ? String(a.ClientId) : null,
          clientName:
            `${a.ClientFirstName || ""} ${a.ClientLastName || ""}`.trim() ||
            rosterName(a.ClientId) ||
            "Unknown Client",
          staffName:
            `${a.StaffFirstName || ""} ${a.StaffLastName || ""}`.trim() ||
            undefined,
          serviceName: a.SessionTypeName || undefined,
          // Raw and unconverted: no studio means no timezone to read these
          // naive wall-clock strings against.
          rawStartDateTime: a.StartDateTime,
          rawEndDateTime: a.EndDateTime,
          status: a.Status,
          reason: `No studio on Mindbody site ${siteId} claims location ${a.LocationId}. Set mindbodyLocationId in Admin -> Studios, or assign a studio here to release this booking.`,
          payload: a as unknown as Record<string, unknown>,
        });
        result.skipped++;
        unresolvedLocations.add(String(a.LocationId));
      } catch (parkError: any) {
        result.errors.push(
          `Appt ${a.Id}: could not park in Limbo: ${parkError?.message || parkError}`,
        );
      }
    }

    if (effectiveLocationId) {
      appointments = appointments.filter(
        (a) =>
          a.LocationId !== undefined &&
          a.LocationId !== null &&
          String(a.LocationId).trim() === effectiveLocationId,
      );
    }

    if (appointments.length === 0) {
      // An empty answer never cancels anything by itself: it can be a glitch.
      // But a NEAR pull with an empty, whole answer may have lost the day's
      // last booking, so when it was offered a wider window it asks that one,
      // exactly as it does for any booking that left (the review, Sep 25).
      if (answerComplete && options.settleSweepWith) {
        const from = studioDayBoundsForKey(start.slice(0, 10), studioTimeZone).start;
        const to = studioDayBoundsForKey(end.slice(0, 10), studioTimeZone).end;
        const held = await getDocs(
          query(
            collection(db, "schedules"),
            where("studioId", "==", targetStudioId),
            where("startTime", ">=", Timestamp.fromDate(from)),
            where("startTime", "<=", Timestamp.fromDate(to)),
          ),
        );
        let live = 0;
        held.forEach((d) => {
          if (d.data().status !== "Cancelled") live++;
        });
        if (live > 0) {
          result.sweepDeferred = live;
          await settleWithWiderWindow(options.settleSweepWith);
        }
      }
      return result;
    }

    // The clients we already know about: the caller's roster (the app passes
    // the studio's whole live roster), topped up below by an id check of
    // only the ones it does not hold. See checkClientIds.
    //
    // THE ROSTER CAN CARRY THE STRANGER TOO (Sep 23 2026, after phase 26).
    // The Hub's roster pulls in "visitors" — every client a booking on this
    // studio's schedule points at, read by id. Once a booking had been filed on
    // the wrong person, the roster fetched that wrong person as a visitor, the
    // id lookup below found them before the phase-26 filter was ever reached,
    // and every sync re-filed the booking on them. The mistake kept itself
    // alive. So the same site test runs here, on the way in: a client whose
    // home studio sits on a DIFFERENT Mindbody site is not this site's client,
    // whatever their id says. Unknown site (no home studio) is kept, as before.
    const thisSiteForRoster = String(siteId).trim();
    const allClients: Client[] = clients.filter((c) => {
      const theirs = siteOfClient(c, studios || []);
      return !theirs || theirs === thisSiteForRoster;
    });

    // THE SYNC WINDOW, as instants. Only rows inside it are compared with
    // Mindbody's answer. This read used to take every booking the studio has
    // ever had (1,000+ at Willoughby) on every sync — and then marked every
    // one outside today..+30 days "Cancelled", because Mindbody was only
    // asked about today..+30 days (hub sync fixes, Sep 16 2026).
    const windowFrom = studioDayBoundsForKey(start.slice(0, 10), studioTimeZone).start;
    const windowTo = studioDayBoundsForKey(end.slice(0, 10), studioTimeZone).end;
    const inWindow = (value: unknown) => {
      const ms = rowStartMs(value);
      return ms !== null && ms >= windowFrom.getTime() && ms <= windowTo.getTime();
    };

    const existingSnap = await getDocs(
      query(
        collection(db, "schedules"),
        where("studioId", "==", targetStudioId),
        where("startTime", ">=", Timestamp.fromDate(windowFrom)),
        where("startTime", "<=", Timestamp.fromDate(windowTo)),
      ),
    );

    const existingByMbId: Record<string, { docId: string; data: any }> = {};
    existingSnap.forEach((d) => {
      const docData = d.data();
      if (docData.mindbodyAppointmentId) {
        existingByMbId[String(docData.mindbodyAppointmentId)] = {
          docId: d.id,
          data: docData,
        };
      }
    });

    /*
     * A booking Mindbody moved INTO this window from a day outside it is not
     * in the query above: its row is still stamped for the old day. Written
     * as new, it replaced the row whole, with no move stamps and its history
     * dropped (the review of phase 1, Sep 25 2026). So the few answer ids with
     * no row in the window are read by id — doc id is the appointment id — and
     * any that exist take the update path with their move stamps. A failed
     * read here only means those bookings are written as before.
     */
    const unseenIds = [...new Set(appointments.map((a) => String(a.Id)))].filter(
      (id) => !existingByMbId[id],
    );
    for (let i = 0; i < unseenIds.length; i += 30) {
      const chunk = unseenIds.slice(i, i + 30);
      try {
        const snap = await getDocs(
          query(collection(db, "schedules"), where(documentId(), "in", chunk)),
        );
        snap.forEach((d) => {
          // Appointment ids are unique per Mindbody SITE: a row on another
          // site's studio is someone else's booking, never this one's history.
          const owner = (studios || []).find((s) => s.id === d.data().studioId);
          if (owner?.mindbodySiteId && String(owner.mindbodySiteId).trim() !== siteKey) return;
          const key = String(d.data().mindbodyAppointmentId ?? d.id);
          if (!existingByMbId[key]) existingByMbId[key] = { docId: d.id, data: d.data() };
        });
      } catch (readErr) {
        console.warn("[sync] could not read rows for bookings moved into the window", readErr);
      }
    }

    // ------------------------------------------------------------------
    // PHASE 1 — make sure every client on this schedule EXISTS, before any
    // schedule row references them.
    //
    // Clients used to be created one at a time, with an awaited setDoc inside
    // the appointment loop. Across 432 appointments that is hundreds of
    // sequential round trips: slow enough that the grid rendered before the
    // documents landed, and heavy enough to help exhaust the write quota — so
    // blocks sat on "Not synced" pointing at clients that did not exist yet.
    //
    // Batched up front, the whole roster is created in a couple of commits and
    // the schedule rows written afterwards always resolve.
    // ------------------------------------------------------------------
    /*
     * Earliest booking per client across the WHOLE window, not just the
     * appointment that happens to create them. The creating appointment is
     * simply the first one the loop below reaches, which is arbitrary -- using
     * it directly would record a client's first visit as whichever booking
     * Mindbody returned first.
     */
    const earliestApptByClient = new Map<string, Date>();
    for (const appt of appointments) {
      const mbId = appt.ClientId ? String(appt.ClientId).trim() : "";
      if (!mbId || !appt.StartDateTime) continue;
      const when = new Date(appt.StartDateTime);
      if (Number.isNaN(when.getTime())) continue;
      const seen = earliestApptByClient.get(mbId);
      if (!seen || when.getTime() < seen.getTime()) {
        earliestApptByClient.set(mbId, when);
      }
    }

    const missingClients = new Map<string, MindbodyAppointment>();
    for (const appt of appointments) {
      const mbId = appt.ClientId ? String(appt.ClientId).trim() : "";
      if (!mbId) continue;
      if (missingClients.has(mbId)) continue;
      if (resolveCanonicalClientId(mbId, allClients, siteId)) continue;

      // MULTI-TENANT GUARD: only create a client for an appointment that will
      // actually be filed under the studio being synced. Without this, a
      // sibling studio's appointment (same Mindbody site, different location)
      // would create its client with the WRONG homeStudioId, putting them on
      // another location's roster and inside another location's permissions.
      if (resolveStudioId(appt.LocationId, siteId, studios) !== targetStudioId) {
        continue;
      }
      missingClients.set(mbId, appt);
    }

    /*
     * WHICH RECORD IS THIS PERSON (client-identity round, Sep 23 2026).
     *
     * `clients/{mindbodyClientId}` carries no site, and Mindbody only promises
     * an id is unique within ONE site. MSF has two, both numbered from
     * 100000001: 43 ids name a DIFFERENT PERSON at each. Adopting by id alone
     * filed one person's bookings onto another's record (phases 26–27 stopped
     * that by leaving them unlinked). Now the second person gets a record of
     * their own at `clients/{site}-{id}` — lib/mindbody-site.ts is the rule.
     *
     * Candidates are only "not in the caller's roster". Firestore is asked
     * about exactly those, first at the plain id and then, for any that turn
     * out to belong to the other site, at the site-qualified one.
     *
     * Keyed by the DOCUMENT to create, carrying the Mindbody id it is for.
     */
    const toCreate = new Map<string, { mbId: string; appt: MindbodyAppointment }>();
    const createAlone = new Map<string, { mbId: string; appt: MindbodyAppointment }>();
    /*
     * Ids this caller cannot place. The rules would not show the plain record
     * and refused to create it, so it exists and belongs to a studio this
     * trainer cannot read — a sibling's client or the other site's, and
     * nothing here can tell which. Linking by id alone is exactly how the
     * wrong person's record got someone's bookings, and this trainer could not
     * open that profile anyway. So nothing NEW is linked for them, and a link
     * a sync that could read the record already made is left as it is (so a
     * leader's sync and a trainer's do not undo each other).
     */
    const unplaceable = new Set<string>();
    if (missingClients.size > 0) {
      const thisSite = String(siteId).trim();
      const check = await checkClientIds([...missingClients.keys()]);
      const strangers = new Map<string, MindbodyAppointment>();
      for (const c of check.existing) {
        const mbId = String(c.id);
        const choice = chooseClientDoc({
          mindbodyClientId: mbId,
          site: thisSite,
          qualifiedExists: false,
          plain: c as { homeStudioId?: string | null; mindbodySiteId?: string | null },
          studios: studios || [],
        });
        if (choice.docId === mbId) allClients.push(c);
        else strangers.set(mbId, missingClients.get(mbId)!);
      }
      for (const [mbId, appt] of missingClients) {
        if (check.missing.has(mbId)) toCreate.set(mbId, { mbId, appt });
        else if (check.refused.has(mbId)) createAlone.set(mbId, { mbId, appt });
      }

      if (strangers.size > 0) {
        const byQualified = new Map(
          [...strangers].map(([mbId, appt]) => [siteQualifiedClientId(thisSite, mbId), { mbId, appt }]),
        );
        const second = await checkClientIds([...byQualified.keys()]);
        allClients.push(...second.existing);
        for (const [docId, item] of byQualified) {
          // A trainer may not read a document that is not there, so a refused
          // read here is usually a record still to be made; the create is
          // tried on its own and refused if it is someone else's.
          if (second.missing.has(docId)) toCreate.set(docId, item);
          else if (second.refused.has(docId)) createAlone.set(docId, item);
        }
        if (second.unchecked.size > 0) {
          result.errors.push(
            `Could not check ${second.unchecked.size} client profile(s) that share a Mindbody number with someone at another site; their bookings were left unlinked this run.`,
          );
        }
      }
      if (check.unchecked.size > 0) {
        result.errors.push(
          `Could not check whether ${check.unchecked.size} client profile(s) exist; none were created for them this run. They will be checked again on the next sync.`,
        );
      }
    }

    // Refused reads, one write each: a new client is created, someone else's
    // client is refused by the rules and simply stays theirs.
    let createdAlone = 0;
    for (const [docId, { mbId, appt }] of createAlone) {
      const payload = buildCanonicalClientPayload(
        appt,
        mbId,
        targetStudioId,
        earliestApptByClient.get(mbId) ?? null,
        siteId,
      );
      try {
        await setDoc(doc(db, "clients", docId), payload, { merge: true });
        allClients.push({ id: docId, ...payload } as unknown as Client);
        createdAlone++;
      } catch {
        // Exists at a studio this caller cannot read. See `unplaceable`.
        if (docId === mbId) unplaceable.add(mbId);
      }
    }
    result.clientsCreated = createdAlone;

    if (toCreate.size > 0) {
      let clientBatch = writeBatch(db);
      let pending = 0;
      let created = 0;
      try {
        for (const [docId, { mbId, appt }] of toCreate) {
          const payload = buildCanonicalClientPayload(
            appt,
            mbId,
            targetStudioId,
            earliestApptByClient.get(mbId) ?? null,
            siteId,
          );
          clientBatch.set(doc(db, "clients", docId), payload, { merge: true });
          // Keep the in-memory roster in step so the loop below resolves them.
          allClients.push({ id: docId, ...payload } as unknown as Client);
          created++;
          pending++;
          if (pending >= 400) {
            await clientBatch.commit();
            clientBatch = writeBatch(db);
            pending = 0;
          }
        }
        if (pending > 0) await clientBatch.commit();
        result.clientsCreated = createdAlone + created;
        console.log(
          `[REFRESH SCHEDULE] Created/updated ${created} canonical client profile(s) before writing schedules.`,
        );
      } catch (e: any) {
        // Schedules are still written below; those rows simply stay unlinked
        // and will resolve on the next sync rather than being lost.
        result.errors.push(
          `Could not create ${toCreate.size} client profile(s): ${e?.message || e}`,
        );
      }
    }

    const currentMbIds = new Set(appointments.map((a) => String(a.Id)));
    let batch = writeBatch(db);
    let batchCount = 0;

    for (const appt of appointments) {
      try {
        const mbId = String(appt.Id);

        // Location decides ownership, and it is settled before anything is
        // written. Anything that cannot be resolved to the studio being synced
        // is skipped rather than filed under it — misplaced appointments surface
        // on the wrong studio's roster and break the duplicate check next run.
        const studioId = resolveStudioId(appt.LocationId, siteId, studios);

        if (!studioId) {
          // Backstop. Unmappable appointments are normally parked above, before
          // the location filter; this only fires if one slips through (e.g. an
          // appointment with no LocationId at all on a single-studio site).
          result.skipped++;
          unresolvedLocations.add(
            appt.LocationId != null ? String(appt.LocationId) : "none",
          );
          try {
            await parkPullSyncBooking({
              siteId: String(siteId),
              appointmentId: appt.Id,
              locationId: appt.LocationId ?? null,
              clientId: appt.ClientId ? String(appt.ClientId) : null,
              clientName:
                `${appt.ClientFirstName || ""} ${appt.ClientLastName || ""}`.trim() ||
                rosterName(appt.ClientId) ||
                "Unknown Client",
              staffName:
                `${appt.StaffFirstName || ""} ${appt.StaffLastName || ""}`.trim() ||
                undefined,
              serviceName: appt.SessionTypeName || undefined,
              // Raw and unconverted: no studio means no timezone to read these
              // naive wall-clock strings against.
              rawStartDateTime: appt.StartDateTime,
              rawEndDateTime: appt.EndDateTime,
              status: appt.Status,
              reason:
                appt.LocationId != null
                  ? `No studio on Mindbody site ${siteId} claims location ${appt.LocationId}. Set mindbodyLocationId in Admin -> Studios, then release this booking.`
                  : `This appointment names no Mindbody location and site ${siteId} is shared by more than one studio, so it cannot be filed automatically. Assign a studio to release it.`,
              payload: appt as unknown as Record<string, unknown>,
            });
          } catch (parkError: any) {
            result.errors.push(
              `Appt ${appt.Id}: could not park in Limbo: ${parkError?.message || parkError}`,
            );
          }
          continue;
        }

        if (studioId !== targetStudioId) {
          result.skipped++;
          continue;
        }

        // Try matching trainer by mindbodyStaffId AND studio assignment first
        let trainer = trainers.find(
          (t) =>
            t.mindbodyStaffId &&
            String(t.mindbodyStaffId).trim() === String(appt.StaffId).trim() &&
            (!targetStudioId ||
              t.primaryHomeStudioId === targetStudioId ||
              t.accessibleStudioIds?.includes(targetStudioId)),
        );

        // Fallback: Try matching trainer by full name AND studio assignment
        if (!trainer && (appt.StaffFirstName || appt.StaffLastName)) {
          const mbStaffFullName =
            `${appt.StaffFirstName || ""} ${appt.StaffLastName || ""}`
              .trim()
              .toLowerCase();
          trainer = trainers.find(
            (t) =>
              t.fullName &&
              t.fullName.toLowerCase() === mbStaffFullName &&
              (!targetStudioId ||
                t.primaryHomeStudioId === targetStudioId ||
                t.accessibleStudioIds?.includes(targetStudioId)),
          );
        }

        const rawStaffName =
          `${appt.StaffFirstName || ""} ${appt.StaffLastName || ""}`.trim();
        const trainerName = trainer
          ? trainer.fullName
          : rawStaffName
            ? rawStaffName
            : `${studioName} Rotation`;
        const trainerId = trainer?.id || null;

        const nameFromMindbody =
          `${appt.ClientFirstName || ""} ${appt.ClientLastName || ""}`.trim();
        let clientName = nameFromMindbody || "Unknown Client";

        const mbClientId = appt.ClientId ? String(appt.ClientId).trim() : null;

        // Pass / waitlist / visit-count data, when the proxy passed any through.
        // Read before the client block, which uses the visit count.
        const bookingExtras = extractBookingExtras(
          appt as unknown as Record<string, unknown>,
        );

        const isUnplaceable = Boolean(mbClientId && unplaceable.has(mbClientId));
        const clientId =
          resolveCanonicalClientId(mbClientId, allClients, siteId) ??
          // See `unplaceable` above: nothing new is linked, and a link a sync
          // that could read the record already made is kept.
          (isUnplaceable
            ? ((existingByMbId[String(appt.Id)]?.data?.clientId as string | null | undefined) ?? null)
            : null);

        // A pull that skipped this client's lookup (SyncOptions) gets no name
        // unless Mindbody put one on the appointment. Keep the name the row
        // already carries, so the row is not rewritten for nothing, or else
        // the name on Journey's record. Never "Unknown Client" for a client we
        // hold: that is also a change, and would be written on every pull.
        if (!nameFromMindbody && clientId) {
          const kept = existingByMbId[mbId]?.data?.clientName as string | undefined;
          const record = allClients.find((c) => c.id === clientId);
          clientName =
            (kept && kept !== "Unknown Client" ? kept : "") ||
            (record && mbClientId && !isPlaceholderRecord(record, mbClientId)
              ? clientLegalName(record)
              : "") ||
            "Unknown Client";
        }

        if (!clientId && mbClientId && !isUnplaceable) {
          // Phase 1 above creates every client for this studio before the
          // loop runs, so reaching here means that batch failed. The
          // schedule row is still written (unlinked) and will resolve on
          // the next sync.
          result.errors.push(
            `Appt ${appt.Id}: client ${mbClientId} could not be resolved or created; left unlinked.`,
          );
        }

        if (!clientId && !mbClientId) {
          // No Mindbody client id on the appointment at all. Nothing to key on,
          // and guessing by name is exactly what we removed.
          result.errors.push(
            `Appt ${appt.Id} ("${clientName}") carries no Mindbody ClientId; left unlinked.`,
          );
        }

        if (clientId) {
          const matchedClient = allClients.find((c) => c.id === clientId);
          // Only this studio's own clients are filled in from its bookings. A
          // visitor's record belongs to another studio, and the rules refuse
          // that update — which would fail the whole batch of schedule rows.
          const homeOf = (c: Client) =>
            (c as { homeStudioId?: string | null; studioId?: string | null }).homeStudioId ??
            (c as { studioId?: string | null }).studioId ??
            null;
          if (matchedClient && homeOf(matchedClient) === targetStudioId) {
            const clientUpdates: Record<string, any> = {};
            if (mbClientId && !matchedClient.mindbodyClientId) {
              clientUpdates.mindbodyClientId = mbClientId;
              matchedClient.mindbodyClientId = mbClientId;
            }
            if (appt.ClientPhone && !matchedClient.phone) {
              clientUpdates.phone = appt.ClientPhone;
              matchedClient.phone = appt.ClientPhone;
            }
            if (appt.ClientEmail && !matchedClient.email) {
              clientUpdates.email = appt.ClientEmail;
              matchedClient.email = appt.ClientEmail;
            }
            if (appt.ClientDOB && !matchedClient.dateOfBirth) {
              clientUpdates.dateOfBirth = appt.ClientDOB;
              matchedClient.dateOfBirth = appt.ClientDOB;
            }
            if (appt.ClientGender && !matchedClient.gender) {
              clientUpdates.gender = appt.ClientGender;
              matchedClient.gender = appt.ClientGender;
            }
            if (appt.ClientAddress && !matchedClient.address) {
              clientUpdates.address = appt.ClientAddress;
              matchedClient.address = appt.ClientAddress;
            }
            if (appt.ClientPhotoUrl && !matchedClient.photoUrl) {
              clientUpdates.photoUrl = appt.ClientPhotoUrl;
              matchedClient.photoUrl = appt.ClientPhotoUrl;
            }
            if (
              appt.ClientEmergencyName &&
              !matchedClient.emergencyContactName
            ) {
              clientUpdates.emergencyContactName = appt.ClientEmergencyName;
              matchedClient.emergencyContactName = appt.ClientEmergencyName;
            }
            if (
              appt.ClientEmergencyPhone &&
              !matchedClient.emergencyContactPhone
            ) {
              clientUpdates.emergencyContactPhone = appt.ClientEmergencyPhone;
              matchedClient.emergencyContactPhone = appt.ClientEmergencyPhone;
            }

            // Mindbody-owned, so unlike the blank-filling backfills above this
            // always refreshes. It is NOT the same number as `sessionCount` —
            // that is this app's own count of completed workouts.
            if (
              bookingExtras.clientsNumberOfVisitsAtSite !== undefined &&
              matchedClient.clientsNumberOfVisitsAtSite !==
                bookingExtras.clientsNumberOfVisitsAtSite
            ) {
              clientUpdates.clientsNumberOfVisitsAtSite =
                bookingExtras.clientsNumberOfVisitsAtSite;
              matchedClient.clientsNumberOfVisitsAtSite =
                bookingExtras.clientsNumberOfVisitsAtSite;
            }

            if (Object.keys(clientUpdates).length > 0) {
              batch.update(doc(db, "clients", clientId), clientUpdates);
              batchCount++;
            }
          }
        }

        // MindBody sends site-local wall clock with no offset. Letting `new
        // Date()` resolve it against the syncing machine's timezone stored every
        // appointment shifted by that machine's offset from the studio.
        const startDate = wallClockToInstant(appt.StartDateTime, studioTimeZone);
        const endDate = wallClockToInstant(appt.EndDateTime, studioTimeZone);
        if (!startDate) {
          result.errors.push(
            `Appt ${appt.Id}: unreadable start time "${appt.StartDateTime}"`,
          );
          result.skipped++;
          continue;
        }
        const startTime = Timestamp.fromDate(startDate);
        const endTime = Timestamp.fromDate(
          endDate ?? new Date(startDate.getTime() + 30 * 60 * 1000),
        );

        const isCancelled =
          appt.Status?.toLowerCase().includes("cancel") ||
          appt.Status?.toLowerCase().includes("late cancel") ||
          appt.Status?.toLowerCase() === "cancelled";

        const payload: Record<string, any> = {
          mindbodyAppointmentId: mbId,
          mindbodyClientId: mbClientId,
          clientName,
          clientId: clientId || null,
          trainerId,
          trainerName,
          startTime,
          endTime,
          studioId,
          status: isCancelled ? "Cancelled" : "Scheduled",
          serviceName: appt.SessionTypeName || "Training Session",
          source: "MindBody",
          lastSyncAt: Timestamp.now(),
        };

        // Only written when reported, so a payload without pass data cannot
        // blank out what an earlier sync or the webhook already stored.
        if (bookingExtras.pass) payload.mindbodyPass = bookingExtras.pass;
        if (bookingExtras.bookingOriginatedFromWaitlist !== undefined) {
          payload.bookingOriginatedFromWaitlist =
            bookingExtras.bookingOriginatedFromWaitlist;
        }

        // Doc id = the Mindbody appointment id, which is exactly what the
        // webhook uses for `schedules/{bookingId}`. While this importer minted
        // random ids and the webhook used booking ids, the same appointment
        // could exist as two documents and show up twice on the grid.
        const scheduleRef = doc(db, "schedules", mbId);
        const existing = existingByMbId[mbId];

        if (!existing) {
          batch.set(scheduleRef, { ...payload, createdAt: Timestamp.now() });
          result.added++;
        } else if (existing.docId !== mbId) {
          // A legacy random-id row for this appointment. Fold it onto the
          // canonical id and drop the stray in the same batch.
          batch.set(scheduleRef, {
            ...existing.data,
            ...payload,
            createdAt: existing.data.createdAt || Timestamp.now(),
          });
          batch.delete(doc(db, "schedules", existing.docId));
          result.updated++;
          batchCount++;
        } else {
          const curr = existing.data;
          const hasChanged =
            curr.status !== payload.status ||
            curr.clientName !== payload.clientName ||
            curr.clientId !== payload.clientId ||
            curr.trainerId !== payload.trainerId ||
            curr.studioId !== payload.studioId ||
            curr.startTime?.toMillis?.() !== startTime.toMillis();

          if (hasChanged) {
            batch.update(doc(db, "schedules", existing.docId), {
              ...payload,
              ...changeStamps(curr, payload, startTime, studioTimeZone),
            });
            result.updated++;
          } else {
            result.skipped++;
          }
        }

        batchCount++;
        if (batchCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      } catch (apptErr: any) {
        result.errors.push(`Appt ${appt.Id}: ${apptErr.message}`);
      }
    }

    // Gone from Mindbody means cancelled — but only for a booking inside the
    // window Mindbody was asked about, and only when the answer was whole.
    // See answerComplete above: half an answer cancels real sessions.
    if (!answerComplete) {
      result.errors.push(
        "Mindbody returned only part of the window, so cancelled bookings were not swept this run. Everything it did return has been saved; try again in a moment.",
      );
    }
    // What left the window. A near pull cannot tell a cancellation from a move
    // to a later day (either way the booking is simply not in a two-day
    // answer), so when it was offered a wider window it cancels nothing and
    // asks that window instead, below. Only a pull that saw the whole span a
    // booking could have moved within decides it is gone.
    const leftWindow = answerComplete
      ? Object.entries(existingByMbId).filter(
          ([mbId, existing]) =>
            !currentMbIds.has(mbId) &&
            existing.data.status !== "Cancelled" &&
            inWindow(existing.data.startTime),
        )
      : [];
    const settleWith = leftWindow.length > 0 ? options.settleSweepWith : undefined;
    if (settleWith) result.sweepDeferred = leftWindow.length;
    for (const [, existing] of settleWith ? [] : leftWindow) {
      batch.update(doc(db, "schedules", existing.docId), {
        status: "Cancelled",
        lastSyncAt: Timestamp.now(),
        // The Changes list (Operations overhaul, Sep 2026): WHEN it went,
        // and that it was the sweep that noticed rather than Mindbody
        // saying so. The calendar hides a cancelled row; the day's
        // changes list reads these two fields.
        cancelledAt: Timestamp.now(),
        cancelSource: "sweep",
      });
      result.updated++;
      result.swept = (result.swept ?? 0) + 1;
      batchCount++;
      if (batchCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    // Surface rather than swallow: an unmapped location means appointments exist
    // in MindBody that no studio here has claimed.
    if (unresolvedLocations.size > 0) {
      result.errors.push(
        `Skipped appointments from unmapped MindBody location(s): ${[...unresolvedLocations].join(", ")}. Assign these Location IDs to a studio in Admin → Studios.`,
      );
    }

    if (settleWith) {
      // Something left today or tomorrow. Ask for the wider window now: a
      // booking that moved to next week is updated on its new day with its
      // move stamps, and one that is truly gone is cancelled by that pull's
      // sweep, in seconds rather than at the next whole-month pull.
      await settleWithWiderWindow(settleWith);
    }

    console.log("✅ [REFRESH SCHEDULE] SYNC COMPLETE RESULT:", result);
    return result;
  } catch (err: any) {
    result.errors.push(err.message);
    // Mindbody may have answered in full, but Journey did not take it all in:
    // not a month read, so it is not recorded as one and is tried again.
    result.windowComplete = false;
  }

  return result;
}
