
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

import { Firestore, writeBatch, doc, collection, serverTimestamp, increment } from 'firebase/firestore';
import { invalidateSessionCount } from './session-count-cache';
import { completedSessionRollup } from './client-rollups';

/**
 * Atomic Session Completion Engine
 * Consolidates session parameters, notes, log entries, and machine setting updates
 * into a single transaction writeBatch to prevent partial writes.
 */
export async function completeWorkoutSession(
  db: Firestore,
  currentSession: any,
  selectedClient: any,
  sessionLogs: any[],
  postData: { clientFeel: string; noteContent: string; notePriority: 'High' | 'Medium' | 'Low' } | undefined,
  currentSessionNotes: string,
  authTrainer: any,
  clientMachineSettings: Record<string, any>,
  userId: string
) {
  if (!currentSession?.id) return;
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

  if (postData?.clientFeel) {
    updateData.clientFeel = postData.clientFeel;
  }
  if (currentSessionNotes.trim()) {
    updateData.notes = currentSessionNotes.trim();
  }
  batch.update(sessionRef, updateData);

  // Post-session note
  if (postData?.noteContent && selectedClient && authTrainer) {
    const noteRef = doc(collection(db, 'sessionNotes'));
    batch.set(noteRef, {
      sessionId: currentSession.id,
      clientId: selectedClient.id,
      homeStudioId: homeStudioId,
      studioId: homeStudioId,
      trainerId: authTrainer.id,
      trainerInitials: authTrainer.initials || authTrainer.fullName.substring(0, 2).toUpperCase(),
      content: postData.noteContent,
      priority: postData.notePriority,
      createdAt: serverTimestamp()
    });
  }

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
      batch.update(logRef, {
        ...cleanData(logData),
        clientId: selectedClient?.id || '',
        homeStudioId: homeStudioId,
        clientHomeStudioId: homeStudioId,
        studioId: logData.studioId || homeStudioId,
        updatedAt: serverTimestamp()
      });
    }
  }

  // 3. Update client counters & metrics
  if (selectedClient && selectedClient.id) {
    let totalSessionReps = 0;
    let totalSessionVolume = 0;

    sessionLogs.forEach((l: any) => {
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
      lastSessionDate: new Date().toISOString().split('T')[0],
      updatedAt: serverTimestamp()
    };

    if (roundedSessionReps > 0) {
      clientUpdates.lifetimeReps = increment(roundedSessionReps);
    }
    if (roundedSessionVolume > 0) {
      clientUpdates.lifetimeWeight = increment(roundedSessionVolume);
    }

    sessionLogs.forEach(logObj => {
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
        sessionLogs as any[],
        authTrainer ? [authTrainer as Trainer] : [],
        { increment, serverTimestamp },
      ),
    );

    batch.update(clientRef, clientUpdates);
  }

  await batch.commit();
}
