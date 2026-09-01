import {
  collection,
  getDocs,
  writeBatch,
  doc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { parkPullSyncBooking } from "./mindbody-limbo";
import { extractBookingExtras } from "./mindbody-pass";
import { Trainer, Client, Studio } from "../types";
import {
  wallClockToInstant,
  isValidTimeZone,
  DEFAULT_TIME_ZONE,
} from "./studio-time";

export interface MindbodySyncResult {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
  /** Canonical client docs created because Mindbody knew someone we did not. */
  clientsCreated?: number;
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
): string | null {
  if (!mbClientId) return null;
  const target = String(mbClientId).trim();
  if (!target) return null;

  const canonical = clientsData.find(
    (c) => c.id && String(c.id).trim() === target,
  );
  return canonical ? canonical.id || null : null;
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
): Record<string, any> {
  const firstName = (appt.ClientFirstName || "").trim();
  const lastName = (appt.ClientLastName || "").trim();

  const payload: Record<string, any> = {
    firstName: firstName || "Mindbody",
    lastName: lastName || `Client ${mbClientId}`,
    mindbodyClientId: mbClientId,
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
): Promise<MindbodySyncResult> {
  const result: MindbodySyncResult = {
    added: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
  const now = new Date();
  const start = startDate || now.toISOString().split("T")[0];
  const end =
    endDate ||
    new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

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

  try {
    const response = await fetch("/api/mindbody/staff-appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId,
        startDate: start,
        endDate: end,
        staffIds: staffIdsToFetch.length > 0 ? staffIdsToFetch : undefined,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `API error ${response.status}`);
    }

    const data = await response.json();
    let appointments: MindbodyAppointment[] = data.appointments || [];

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
      return result;
    }

    // Fetch all clients from Firestore to guarantee clientId matching across all dates/studios
    let allClients = [...clients];
    try {
      const clientsSnap = await getDocs(collection(db, "clients"));
      if (!clientsSnap.empty) {
        allClients = clientsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Client[];
      }
    } catch (e) {
      console.warn(
        "Could not fetch all clients snapshot, fallback to passed clients array:",
        e,
      );
    }

    const existingSnap = await getDocs(
      query(
        collection(db, "schedules"),
        where("studioId", "==", targetStudioId),
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
    const missingClients = new Map<string, MindbodyAppointment>();
    for (const appt of appointments) {
      const mbId = appt.ClientId ? String(appt.ClientId).trim() : "";
      if (!mbId) continue;
      if (missingClients.has(mbId)) continue;
      if (resolveCanonicalClientId(mbId, allClients)) continue;

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

    if (missingClients.size > 0) {
      let clientBatch = writeBatch(db);
      let pending = 0;
      let created = 0;
      try {
        for (const [mbId, appt] of missingClients) {
          const payload = buildCanonicalClientPayload(appt, mbId, targetStudioId);
          clientBatch.set(doc(db, "clients", mbId), payload, { merge: true });
          // Keep the in-memory roster in step so the loop below resolves them.
          allClients.push({ id: mbId, ...payload } as unknown as Client);
          created++;
          pending++;
          if (pending >= 400) {
            await clientBatch.commit();
            clientBatch = writeBatch(db);
            pending = 0;
          }
        }
        if (pending > 0) await clientBatch.commit();
        result.clientsCreated = created;
        console.log(
          `[REFRESH SCHEDULE] Created/updated ${created} canonical client profile(s) before writing schedules.`,
        );
      } catch (e: any) {
        // Schedules are still written below; those rows simply stay unlinked
        // and will resolve on the next sync rather than being lost.
        result.errors.push(
          `Could not create ${missingClients.size} client profile(s): ${e?.message || e}`,
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

        const clientName =
          `${appt.ClientFirstName || ""} ${appt.ClientLastName || ""}`.trim() ||
          "Unknown Client";

        const mbClientId = appt.ClientId ? String(appt.ClientId).trim() : null;

        // Pass / waitlist / visit-count data, when the proxy passed any through.
        // Read before the client block, which uses the visit count.
        const bookingExtras = extractBookingExtras(
          appt as unknown as Record<string, unknown>,
        );

        const clientId = resolveCanonicalClientId(mbClientId, allClients);

        if (!clientId && mbClientId) {
          // Phase 1 above creates every client for this studio before the loop
          // runs, so reaching here means that batch failed. The schedule row is
          // still written (unlinked) and will resolve on the next sync.
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
          if (matchedClient) {
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
            batch.update(doc(db, "schedules", existing.docId), payload);
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

    for (const [mbId, existing] of Object.entries(existingByMbId)) {
      if (!currentMbIds.has(mbId) && existing.data.status !== "Cancelled") {
        batch.update(doc(db, "schedules", existing.docId), {
          status: "Cancelled",
          lastSyncAt: Timestamp.now(),
        });
        result.updated++;
        batchCount++;
        if (batchCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
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

    console.log("✅ [REFRESH SCHEDULE] SYNC COMPLETE RESULT:", result);
    return result;
  } catch (err: any) {
    result.errors.push(err.message);
  }

  return result;
}
