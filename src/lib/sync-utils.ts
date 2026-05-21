
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
