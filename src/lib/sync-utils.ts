
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
