import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { LimboEntry, Studio } from "../types";
import { wallClockToInstant, DEFAULT_TIME_ZONE, isValidTimeZone } from "./studio-time";
import { chooseClientDoc, siteQualifiedClientId } from "./mindbody-site";

/**
 * Browser-side half of the Limbo queue.
 *
 * The Cloud Functions webhook parks events it cannot attribute to a studio in
 * `mindbodyLimbo` (see functions/src/mindbody/clientResolver.ts). This module
 * is the same idea for the pull-sync, plus the release path the Admin UI uses.
 *
 * The two writers must agree on the document shape; the Functions copy is the
 * reference. They cannot share code — separate package, separate SDK.
 */

export const LIMBO_QUEUE = "mindbodyLimbo";

/**
 * Parks an appointment the pull-sync could not file against a studio.
 *
 * Doc id is deterministic (`pull:{siteId}:{appointmentId}`) so hitting Refresh
 * Schedule repeatedly updates one row instead of piling up duplicates. It is
 * namespaced away from webhook event ids so the two writers cannot collide.
 */
export async function parkPullSyncBooking(params: {
  siteId: string;
  appointmentId: string | number;
  locationId?: string | number | null;
  clientId?: string | null;
  clientName?: string;
  staffName?: string;
  serviceName?: string;
  rawStartDateTime?: string;
  rawEndDateTime?: string;
  status?: string;
  reason: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const id = `pull:${params.siteId}:${params.appointmentId}`;
  await setDoc(
    doc(db, LIMBO_QUEUE, id),
    {
      eventId: id,
      eventType: "pullSync.appointment",
      kind: "booking",
      source: "pull-sync",
      siteId: String(params.siteId),
      locationId:
        params.locationId !== undefined && params.locationId !== null
          ? String(params.locationId)
          : null,
      clientId: params.clientId ? String(params.clientId) : null,
      reason: params.reason,
      summary: {
        bookingId: String(params.appointmentId),
        clientName: params.clientName || "Unknown Client",
        // RAW and unconverted: with no studio there is no timezone to read a
        // naive Mindbody wall-clock string against. Converting on release is
        // the only way to get the hour right.
        rawStartDateTime: params.rawStartDateTime || null,
        rawEndDateTime: params.rawEndDateTime || null,
        staffName: params.staffName || null,
        serviceName: params.serviceName || null,
        status: params.status || "Scheduled",
      },
      payload: params.payload,
      lastSeenAt: Timestamp.now(),
      resolvedAt: null,
    },
    { merge: true },
  );
}

/** Every unresolved row, newest first. */
export async function fetchOpenLimboEntries(): Promise<LimboEntry[]> {
  const snap = await getDocs(
    query(collection(db, LIMBO_QUEUE), where("resolvedAt", "==", null)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }) as LimboEntry)
    .sort((a, b) => {
      const am = (a.lastSeenAt as any)?.toMillis?.() ?? 0;
      const bm = (b.lastSeenAt as any)?.toMillis?.() ?? 0;
      return bm - am;
    });
}

export type ReleaseResult = {
  scheduleId?: string;
  clientId?: string;
  startTimeIso?: string;
};

/**
 * Which record is Mindbody client `mbId` on `site` — lib/mindbody-site.ts's
 * rule over two reads. Limbo is an administrators' screen, so both reads are
 * allowed; one that fails is an error, never "absent".
 */
async function placeClient(
  mbId: string,
  site: string,
  studios: Studio[],
): Promise<{ docId: string; create: boolean }> {
  if (!site) {
    const plain = await getDoc(doc(db, "clients", mbId));
    return { docId: mbId, create: !plain.exists() };
  }
  const [qualified, plain] = await Promise.all([
    getDoc(doc(db, "clients", siteQualifiedClientId(site, mbId))),
    getDoc(doc(db, "clients", mbId)),
  ]);
  return chooseClientDoc({
    mindbodyClientId: mbId,
    site,
    qualifiedExists: qualified.exists(),
    plain: plain.exists() ? (plain.data() as { homeStudioId?: string; mindbodySiteId?: string }) : null,
    studios,
  });
}

/**
 * Releases a parked BOOKING onto a studio's live schedule.
 *
 * The whole point of this function is the time conversion. Mindbody sends naive
 * wall-clock strings ("2026-08-18T07:00:00") with no offset. Parking stored
 * them raw precisely so that the conversion could happen here, against the
 * clock of the studio an admin has now chosen — reading them any earlier would
 * have baked in the wrong hour permanently.
 */
export async function releaseLimboBooking(
  entry: LimboEntry,
  studio: Studio,
  studios: Studio[],
): Promise<ReleaseResult> {
  if (!studio.id) throw new Error("Studio has no id");
  if (entry.kind !== "booking") {
    throw new Error(`Cannot release a "${entry.kind}" entry as a booking`);
  }

  const summary = entry.summary || {};
  const bookingId = String(summary.bookingId || entry.eventId);

  const timeZone = isValidTimeZone(studio.timezone)
    ? studio.timezone
    : DEFAULT_TIME_ZONE;

  const startDate = summary.rawStartDateTime
    ? wallClockToInstant(summary.rawStartDateTime, timeZone)
    : null;
  if (!startDate) {
    throw new Error(
      `No readable start time on this entry ("${summary.rawStartDateTime ?? "none"}") — it cannot be placed on the schedule.`,
    );
  }
  const endDate = summary.rawEndDateTime
    ? wallClockToInstant(summary.rawEndDateTime, timeZone)
    : null;

  // The client must exist, or the released block lands unlinked — the very
  // thing this whole effort removes.
  //
  // Asked of Firestore, not of the roster the screen happened to load: a
  // document missing from that list was treated as missing, and the merge
  // below then wrote a name and a home studio over whoever did live there.
  // Which record is this person is lib/mindbody-site.ts's rule: the second
  // person on a shared Mindbody number has their own, `clients/{site}-{id}`.
  let clientId: string | null = null;
  const site = String(entry.siteId ?? studio.mindbodySiteId ?? "").trim();
  if (entry.clientId) {
    const mbId = String(entry.clientId);
    const place = await placeClient(mbId, site, studios);
    const name = String(summary.clientName || "").trim();
    const first = name && name !== "Unknown Client" ? name.split(" ")[0] : "";
    const last =
      name && name !== "Unknown Client"
        ? name.split(" ").slice(1).join(" ")
        : "";

    if (place.create) {
      await setDoc(
        doc(db, "clients", place.docId),
        {
          firstName: first || "Mindbody",
          lastName: last || (first ? "" : `Client ${mbId}`),
          // Firestore refuses `undefined`: a missing name is left out.
          ...(name && name !== "Unknown Client" ? { mindbody_name: name } : {}),
          mindbodyClientId: mbId,
          ...(site ? { mindbodySiteId: site } : {}),
          homeStudioId: studio.id,
          isActive: true,
          height: "",
          remainingSessions: 0,
          sessionCount: 0,
          completedSessions: 0,
          createdAt: Timestamp.now(),
          createdBy: "mindbody:limbo-release",
          isMindbodyStub: false,
        },
        { merge: true },
      );
    }
    clientId = place.docId;
  }

  const batch = writeBatch(db);
  batch.set(
    // Same doc id scheme as the webhook and the pull-sync, so releasing cannot
    // create a second row for an appointment that later syncs normally.
    doc(db, "schedules", bookingId),
    {
      mindbodyAppointmentId: bookingId,
      mindbodyClientId: entry.clientId ? String(entry.clientId) : null,
      clientId,
      clientName: summary.clientName || "Unknown Client",
      trainerId: null,
      trainerName: summary.staffName || "",
      studioId: studio.id,
      startTime: Timestamp.fromDate(startDate),
      endTime: Timestamp.fromDate(
        endDate ?? new Date(startDate.getTime() + 30 * 60 * 1000),
      ),
      status: summary.status === "Cancelled" ? "Cancelled" : "Scheduled",
      serviceName: summary.serviceName || "Training Session",
      source: "MindBody",
      releasedFromLimbo: true,
      lastSyncAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      ...(entry.summary?.mindbodyPass
        ? { mindbodyPass: entry.summary.mindbodyPass }
        : {}),
    },
    { merge: true },
  );
  batch.update(doc(db, LIMBO_QUEUE, entry.id!), {
    resolvedAt: Timestamp.now(),
    resolvedStudioId: studio.id,
  });
  await batch.commit();

  return {
    scheduleId: bookingId,
    clientId: clientId || undefined,
    startTimeIso: startDate.toISOString(),
  };
}

/**
 * Resolves a parked CLIENT event by assigning the home studio that could not be
 * determined when the webhook arrived.
 */
export async function releaseLimboClient(
  entry: LimboEntry,
  studio: Studio,
  studios: Studio[],
): Promise<void> {
  if (!studio.id) throw new Error("Studio has no id");
  if (!entry.clientId) throw new Error("This entry names no client");

  // Setting a home studio decides who may read a client's clinical record, so
  // it is written to THIS person's record (lib/mindbody-site.ts), never to a
  // namesake's on the other site. The webhook created that record already;
  // one that is missing is an error, not something to invent here.
  const site = String(entry.siteId ?? studio.mindbodySiteId ?? "").trim();
  const place = await placeClient(String(entry.clientId), site, studios);
  if (place.create) {
    throw new Error(
      `No Journey record for Mindbody client ${entry.clientId}${site ? ` on site ${site}` : ""} exists yet, so there is nothing to give a home studio. It is made the next time Mindbody sends this client, or when one of their bookings syncs.`,
    );
  }

  await updateDoc(doc(db, "clients", place.docId), {
    homeStudioId: studio.id,
  });
  await updateDoc(doc(db, LIMBO_QUEUE, entry.id!), {
    resolvedAt: Timestamp.now(),
    resolvedStudioId: studio.id,
  });
}

/** Dismisses an entry without acting on it (duplicate, cancelled, junk). */
export async function dismissLimboEntry(entry: LimboEntry): Promise<void> {
  await updateDoc(doc(db, LIMBO_QUEUE, entry.id!), {
    resolvedAt: Timestamp.now(),
    dismissed: true,
  });
}
