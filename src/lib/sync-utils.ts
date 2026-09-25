
import { Trainer, ScheduleEntry } from '../types';

/**
 * Normalizes a name string for reliable matching.
 * Strips white spaces and ignores case sensitivity.
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Completely cleans a name down to alphanumeric lowercase for robust, fuzzy-like matching.
 */
export function cleanAlphanumeric(name: string): string {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Checks if a schedule name matches a client's first & last names or MindBody name.
 * Handles abbreviations (e.g. "Sherry N." matching "Sherry Noll") and minor spelling differences.
 */
export function isFuzzyNameMatch(scheduleName: string, clientFirstName: string, clientLastName: string, clientMindbodyName?: string): boolean {
  if (!scheduleName) return false;
  
  const sNameClean = scheduleName.trim().toLowerCase().replace(/[^a-z0-9\s]/g, ''); // "sherry n"
  const cFirstClean = (clientFirstName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const cLastClean = (clientLastName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const cFullClean = `${cFirstClean} ${cLastClean}`.trim(); // "sherry noll"
  
  if (clientMindbodyName) {
    const mbClean = clientMindbodyName.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
    if (sNameClean === mbClean) return true;
  }

  if (sNameClean === cFullClean) return true;

  // Split into words
  const sWords = sNameClean.split(/\s+/).filter(Boolean); // ["sherry", "n"]
  const cWords = [cFirstClean, cLastClean].filter(Boolean); // ["sherry", "noll"]

  if (sWords.length === 0 || cWords.length === 0) return false;

  // First names must match
  if (sWords[0] !== cWords[0]) return false;

  // If schedule only has first name "Robbin" and client is "Robbin McNeill"
  if (sWords.length === 1 && cWords.length > 1) return true;
  // If schedule is "Robbin McNeill" and client only has first name "Robbin" in DB
  if (sWords.length > 1 && cWords.length === 1) return true;

  // If both have last name parts
  if (sWords.length >= 2 && cWords.length >= 2) {
    const sLast = sWords.slice(1).join(' '); // "n" or "mcneill"
    const cLast = cWords.slice(1).join(' '); // "noll" or "mcneill"
    
    if (sLast === cLast) return true;
    if (sLast.length === 1 && cLast.startsWith(sLast)) return true;
    if (cLast.length === 1 && sLast.startsWith(cLast)) return true;
  }

  return false;
}

/**
 * Matches a Mindbody staff member name to a trainer in our database.
 */
export function findMatchingTrainer(mbStaffName: string, trainers: Trainer[]): Trainer | null {
  const normalizedMbName = normalizeName(mbStaffName);
  
  // Try exact match first
  const match = trainers.find(t => normalizeName(t.fullName) === normalizedMbName);
  if (match) return match;

  // Try matching by initials if full name fails and mbStaffName is short
  if (normalizedMbName.length <= 4) {
    const initialMatch = trainers.find(t => normalizeName(t.initials) === normalizedMbName);
    if (initialMatch) return initialMatch;
  }

  return null;
}

/**
 * Maps Mindbody session payloads to internal trainer IDs.
 */
export function mapMindbodySessions(sessions: any[], trainers: Trainer[]): Partial<ScheduleEntry>[] {
  return sessions.map(session => {
    const mbTrainerName = session.staffName || session.trainer || session.Teacher || '';
    const matchingTrainer = findMatchingTrainer(mbTrainerName, trainers);
    
    return {
      clientName: session.clientName || session.Client || '',
      trainerName: mbTrainerName,
      trainerId: matchingTrainer?.id || null,
      source: 'MindBody',
      // ... other fields will be handled by the import logic
    };
  });
}

import { Firestore, writeBatch, doc, collection, serverTimestamp, increment, updateDoc, type DocumentReference } from 'firebase/firestore';
import { invalidateSessionCount } from './session-count-cache';
import { completedSessionRollup } from './client-rollups';
import { studioTodayKey } from "./studio-time";
import { isPerformedLog } from './set-outcome';
import { createJournalEntry } from '../hooks/useClientJournal';
import type { JournalImportance } from '../types/journal';
import type { DialValue } from '../types';

/**
 * What the post-session screen may hand Finish (reporting round, Sep 2026):
 * the dose Dial's position (`sessions.dose`, −2…2; absent when the trainer
 * never tapped — "not judged", never a default) and the closing note with
 * its Loudness (the journal's own importance). `clientFeel` and the old
 * Low/Medium/High priority are no longer written by anything.
 */
export interface PostSessionData {
  dose?: DialValue | null;
  noteContent: string;
  importance: JournalImportance;
}

/**
 * Sessions whose client totals landed although the session itself was
 * refused, so Finish's retry does not count them twice (completeWorkoutSession).
 * Kept through a sign-out on purpose: it is about a session, not a person.
 */
const totalledSessionIds = new Set<string>();

/**
 * Atomic Session Completion Engine
 * Consolidates session parameters, log entries, and machine setting updates
 * into a single writeBatch to prevent partial writes.
 *
 * The client's running totals are NOT in that batch either (Sep 24 2026).
 * They are written right after it, on their own: a trainer cross-training at
 * another studio found Finish refused in full, because the one refused write
 * (the client's totals) took the session, every set and every setting down
 * with it, and the session never ended. "Never block a save": the session is
 * saved first, whatever happens to the totals, and `totalsSaved` says whether
 * they landed so the trainer can be told. The rules now let an approved
 * cross-train visitor move exactly these totals (firestore.rules,
 * crossTrainSessionTotals); the split is what keeps any other refusal from
 * costing a session. The machine weights the next session starts from
 * (clientMachineSettings) stay IN the batch, so a refused total never leaves
 * them stale. Both writes are queued before either is awaited, so a reload
 * while offline replays both.
 *
 * The post-session note is NOT in the batch. It is written to the client's
 * Journal (journalEntries, origin post_session) after the batch commits, on
 * its own, so a note the rules refuse — too long, an author id that is not
 * the signed-in uid — can never take the session down with it. Finish saves
 * the core first; notes are append-only (docs/ARCHITECTURE.md §1.2).
 *
 * Returns whether the note landed, so the caller can say so. `null` means
 * there was no note to write. `totalsSaved` is the same for the client's
 * totals: null when there was no client to total.
 */
export async function completeWorkoutSession(
  db: Firestore,
  currentSession: any,
  selectedClient: any,
  sessionLogs: any[],
  postData: PostSessionData | undefined,
  currentSessionNotes: string,
  authTrainer: any,
  clientMachineSettings: Record<string, any>,
  userId: string,
  /** Extra fields for the session document — the booking match and lateness (lib/session-timing.ts). */
  sessionExtras?: Record<string, unknown>,
): Promise<{ noteSaved: boolean | null; totalsSaved: boolean | null }> {
  if (!currentSession?.id) return { noteSaved: null, totalsSaved: null };
  const batch = writeBatch(db);
  const homeStudioId = selectedClient?.homeStudioId || null;

  // 1. Update session status and Data Stamp
  const sessionRef = doc(db, 'sessions', currentSession.id);
  const updateData: any = {
    status: 'Completed',
    endTime: serverTimestamp(),
    trainerId: authTrainer?.id || '',
    trainerName: authTrainer?.fullName || '',
    trainerInitials: authTrainer?.initials || '',
    clientId: selectedClient?.id || '',
    homeStudioId: homeStudioId,
    clientHomeStudioId: homeStudioId,
    hostedAtStudioId: currentSession.hostedAtStudioId || homeStudioId
  };

  // Data Stamping for Analytics
  if (selectedClient) {
    if (selectedClient.age !== undefined) updateData.clientAge = selectedClient.age;
    if (selectedClient.occupation) updateData.clientOccupation = selectedClient.occupation;
    if (selectedClient.isRetired !== undefined) updateData.clientIsRetired = selectedClient.isRetired;
    if (selectedClient.activityLevel) updateData.clientActivityLevel = selectedClient.activityLevel;
    if (selectedClient.clinicalProfile) updateData.clientClinicalProfile = selectedClient.clinicalProfile;
  }

  if (postData?.dose !== undefined && postData?.dose !== null) {
    updateData.dose = postData.dose;
  }
  if (currentSessionNotes.trim()) {
    updateData.notes = currentSessionNotes.trim();
  }
  if (sessionExtras) {
    for (const [k, v] of Object.entries(sessionExtras)) {
      if (v !== undefined) updateData[k] = v;
    }
  }
  batch.update(sessionRef, updateData);

  // 2. Sync all local logs
  const cleanData = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(cleanData);
    if (typeof obj !== 'object') return obj;
    if (typeof obj.toDate === 'function' || obj.constructor?.name === 'FieldValue' || obj instanceof Date) return obj;

    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
      if (obj[key] !== undefined) {
        cleaned[key] = cleanData(obj[key]);
      }
    });
    return cleaned;
  };

  const calculateExerciseVolume = (log: any): number => {
    if (!log || log.isTSC || log.isStaticHold) return 0;
    const weight = parseFloat(log.weight || '0');
    const reps = parseFloat(log.reps || '0');
    if (isNaN(weight) || isNaN(reps) || weight <= 0 || reps <= 0) return 0;
    return Math.round(weight * reps);
  };

  for (const logObj of sessionLogs) {
    const log = logObj as any;
    if (log.id && log.id.toString().startsWith('temp_')) {
      const newLogRef = doc(collection(db, 'exerciseLogs'));
      const { id, ...logData } = log;
      batch.set(newLogRef, {
        ...cleanData(logData),
        clientId: selectedClient?.id || '',
        homeStudioId: homeStudioId,
        clientHomeStudioId: homeStudioId,
        studioId: logData.studioId || homeStudioId,
        updatedAt: serverTimestamp()
      });
    } else if (log.id) {
      const logRef = doc(db, 'exerciseLogs', log.id);
      const { id, ...logData } = log;
      /* set+merge, not update: sets are now written to Firestore as they are
         saved (see updateLogMultiple), so by the time we finish, the document
         normally exists — but if one of those writes failed, `update` would
         throw on the missing doc and take the whole finish batch down with it.
         Merging creates it instead, and is identical to update when it does
         exist. */
      batch.set(logRef, {
        ...cleanData(logData),
        clientId: selectedClient?.id || '',
        homeStudioId: homeStudioId,
        clientHomeStudioId: homeStudioId,
        studioId: logData.studioId || homeStudioId,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
  }

  // 3. Update client counters & metrics — from PERFORMED sets only.
  //    Built here, written after the batch (see the header). Every
  // log is saved above (a practice set's numbers and a skip's reason are
  // history), but only a set to failure moves a lifetime total, becomes the
  // machine's current metrics or sets tomorrow's weight (set-outcome.ts).
  const performedLogs = sessionLogs.filter((l: any) => isPerformedLog(l));

  let totalsWrite: { ref: DocumentReference; updates: Record<string, unknown> } | null = null;
  if (selectedClient && selectedClient.id) {
    let totalSessionReps = 0;
    let totalSessionVolume = 0;

    performedLogs.forEach((l: any) => {
      let reps = 0;
      if (l.isTSC || l.isStaticHold) {
        const seconds = parseFloat(l.seconds || '0');
        reps = isNaN(seconds) || seconds <= 0 ? 0 : (seconds / 30) * 2;
      } else {
        reps = parseFloat(l.reps || '0');
        if (isNaN(reps)) reps = 0;
      }
      const volume = calculateExerciseVolume(l);
      totalSessionReps += reps;
      totalSessionVolume += volume;
    });

    const roundedSessionReps = Math.round(totalSessionReps);
    const roundedSessionVolume = Math.round(totalSessionVolume);

    // The profile's cached completed-session count is stale the moment this
    // session lands, so drop it rather than waiting out the TTL.
    invalidateSessionCount(selectedClient.id);

    const clientRef = doc(db, 'clients', selectedClient.id);
    const clientUpdates: any = {
      completedSessions: increment(1),
      sessionCount: currentSession.sessionNumber || increment(1),
      lastSessionDate: studioTodayKey(),
      updatedAt: serverTimestamp()
    };

    if (roundedSessionReps > 0) {
      clientUpdates.lifetimeReps = increment(roundedSessionReps);
    }
    if (roundedSessionVolume > 0) {
      clientUpdates.lifetimeWeight = increment(roundedSessionVolume);
    }

    performedLogs.forEach(logObj => {
      const log = logObj as any;
      if (log.weight || log.reps || log.seconds) {
        const key = `currentMachineMetrics.${log.machineId}`;
        clientUpdates[key] = cleanData({
          weight: log.weight || '0',
          reps: log.reps,
          seconds: log.seconds,
          isStaticHold: log.isStaticHold,
          isTSC: log.isTSC,
          totalTimeUnderLoad: log.totalTimeUnderLoad,
          averageTimePerRep: log.averageTimePerRep,
          settings: log.machineSettings || {},
          lastPerformedDate: serverTimestamp(),
          lastPerformedSessionNumber: currentSession.sessionNumber,
          lastSessionId: currentSession.id
        });

        if (log.weight && log.machineId) {
          const settingId = `${selectedClient.id}_${log.machineId}`;
          const settingRef = doc(db, 'clientMachineSettings', settingId);
          const currentSettingsObj = clientMachineSettings[log.machineId];

          const updateObj: any = {
            clientId: selectedClient.id,
            homeStudioId: homeStudioId,
            clientHomeStudioId: homeStudioId,
            machineId: log.machineId,
            settings: currentSettingsObj?.settings || {},
            updatedBy: userId,
            currentWeight: Number(log.weight),
            updatedAt: serverTimestamp()
          };

          if (!currentSettingsObj?.startingWeight) {
            updateObj.startingWeight = Number(log.weight);
            updateObj.startingWeightDate = new Date().toISOString();
          }

          batch.set(settingRef, updateObj, { merge: true });
        }
      }
    });

    if (!selectedClient.consultationCompleted) {
      clientUpdates.consultationCompleted = true;
    }

    // Top Trainer tally + per-machine lifetime stats (Sep 2026). Increments,
    // so two iPads finishing at once cannot lose a vote. The trainers list is
    // not in scope here, so only the finishing trainer's name can resolve —
    // the profile header re-derives the winner from the tally regardless.
    Object.assign(
      clientUpdates,
      completedSessionRollup(
        selectedClient,
        {
          date: currentSession.date || new Date(),
          trainerId: authTrainer?.id || currentSession.trainerId,
          trainerInitials: authTrainer?.initials || currentSession.trainerInitials,
        },
        // The rollup filters to performed sets itself; passing every log
        // keeps the two call sites (finish, import) on one rule.
        sessionLogs as any[],
        authTrainer ? [authTrainer as Trainer] : [],
        { increment, serverTimestamp },
      ),
    );

    totalsWrite = { ref: clientRef, updates: clientUpdates };
  }

  // The session, every set and every setting: one all-or-nothing commit.
  // The totals are queued straight after it, BEFORE either is waited on:
  // offline, a commit's promise waits for the server, and a reload in that
  // wait replays only what was already queued (the persistent cache). Queued
  // together, a reload replays both. A refused total is reported, never
  // thrown: the session is saved regardless.
  const committed = batch.commit();
  const totals: Promise<boolean | null> =
    totalsWrite && !totalledSessionIds.has(currentSession.id)
      ? updateDoc(totalsWrite.ref, totalsWrite.updates).then(
          () => true,
          (err) => {
            console.error('[finish] the session saved, but the client totals did not', err);
            return false;
          },
        )
      : Promise.resolve(totalsWrite ? true : null);
  try {
    await committed;
  } catch (err) {
    // The totals are their own write, so they may have landed although the
    // session was refused. Remember it, so the trainer's retry of Finish
    // does not count this session twice.
    if ((await totals) === true) totalledSessionIds.add(currentSession.id);
    throw err;
  }
  const totalsSaved = await totals;

  // 4. The post-session note, into the Journal — after the core is saved,
  //    never inside the batch (see the header comment). The author is the
  //    signed-in uid, which is what the journalEntries rule pins authorId to.
  const noteBody = (postData?.noteContent || '').trim();
  if (!noteBody || !selectedClient?.id) return { noteSaved: null, totalsSaved };
  try {
    const initials = (authTrainer?.initials || (authTrainer?.fullName || '').substring(0, 2) || '??').toUpperCase();
    const id = await createJournalEntry(
      selectedClient.id,
      currentSession.hostedAtStudioId || homeStudioId || '',
      { id: userId, initials, fullName: authTrainer?.fullName || initials },
      {
        kind: 'general',
        category: null,
        body: noteBody.slice(0, 5000),
        importance: postData?.importance ?? 'standard',
        machineId: null,
        focusId: null,
        sessionId: currentSession.id,
        origin: 'post_session',
      },
    );
    return { noteSaved: id !== null, totalsSaved };
  } catch (err) {
    console.error('[finish] post-session note did not reach the Journal', err);
    return { noteSaved: false, totalsSaved };
  }
}
