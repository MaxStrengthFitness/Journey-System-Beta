import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getMachineStyle } from './machine-colors';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMillis(dateObj: any): number {
  if (!dateObj) return 0;
  if (typeof dateObj.toMillis === 'function') return dateObj.toMillis();
  if (typeof dateObj.toDate === 'function') return dateObj.toDate().getTime();
  if (typeof dateObj.getTime === 'function') return dateObj.getTime();
  if (dateObj.seconds !== undefined) return dateObj.seconds * 1000 + ((dateObj.nanoseconds || 0) / 1000000);
  try {
    let toParse = dateObj;
    if (typeof dateObj === 'string') {
      const ts = parseSessionDate(dateObj);
      if (ts > 0) return ts;
      toParse = dateObj.replace(' ', 'T');
    }
    const parsed = new Date(toParse).getTime();
    return isNaN(parsed) ? 0 : parsed;
  } catch(e) {
    return 0;
  }
}

export function safeToDate(d: any): Date | null {
  if (!d) return null;
  if (typeof d.toDate === 'function') return d.toDate();
  if (typeof d === 'string') {
    const ts = parseSessionDate(d);
    if (ts > 0) return new Date(ts);
    const newD = new Date(d.replace(' ', 'T'));
    return isNaN(newD.getTime()) ? null : newD;
  }
  if (typeof d === 'number') {
    const newD = new Date(d);
    return isNaN(newD.getTime()) ? null : newD;
  }
  if (d instanceof Date) return d;
  if (d.seconds !== undefined) return new Date(d.seconds * 1000 + ((d.nanoseconds || 0) / 1000000));
  return null;
}

/**
 * Robust date parser for legacy and standard formats to ensure chronological sorting
 * Handles YYYY-MM-DD, MM/DD/YYYY, MM/DD, and other common formats
 */
export function parseSessionDate(dateString: string | undefined): number {
  if (!dateString) return 0;
  
  // Replace space with T to make it ISO8601 compliant for Safari
  dateString = dateString.replace(' ', 'T');
  
  // Standard format YYYY-MM-DD
  if (dateString.includes('-') && dateString.split('-')[0].length === 4) {
    if (!dateString.includes('T')) {
      const parts = dateString.split('-');
      const y = parts[0];
      const m = parts[1]?.padStart(2, '0') || '01';
      const day = parts[2]?.padStart(2, '0') || '01';
      const d = new Date(`${y}-${m}-${day}T12:00:00`);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    } else {
      const [datePart, timePart] = dateString.split('T');
      const parts = datePart.split('-');
      const y = parts[0];
      const m = parts[1]?.padStart(2, '0') || '01';
      const day = parts[2]?.padStart(2, '0') || '01';
      const d = new Date(`${y}-${m}-${day}T${timePart}`);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    }
  }

  // Common legacy format MM/DD or MM/DD/YY
  if (dateString.includes('/')) {
    const parts = dateString.split('/');
    if (parts.length === 2) {
      // MM/DD -> Add current year
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      let year = new Date().getFullYear();
      
      const currentMonth = new Date().getMonth() + 1; // 1-indexed
      if (parseInt(month, 10) > currentMonth) {
        year -= 1;
      }
      if (year < 2025) year = 2025;
      
      const d = new Date(`${year}-${month}-${day}T12:00:00`);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    }
    if (parts.length === 3) {
      // MM/DD/YYYY or MM/DD/YY
      let [m, day, y] = parts;
      if (y.length === 2) y = '20' + y;
      const parsedDate = new Date(`${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00`);
      return isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime();
    }
  }

  // Fallback to standard JS parsing
  const parsed = Date.parse(dateString);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parses machine settings from a string into a structured object.
 * Handles formats like "S4 G2 B3 H1", "Seat: 4, Gap: 2", etc.
 */
export function parseMachineSettings(settingsStr: string): Record<string, string> {
  const settings: Record<string, string> = {};
  if (!settingsStr || settingsStr === 'CONFIRM') return settings;

  // Normalize: handle both commas and spaces
  // MM/DD style dates might be in there too if extraction was messy, we'll try to ignore numbers-only shards
  const parts = settingsStr.split(/[\s,]+/);
  
  const mapping: Record<string, string> = {
    'S': 'Seat',
    'G': 'Gap',
    'B': 'Back Pad',
    'H': 'Handles',
    'A': 'Arm Pad'
  };

  parts.forEach(p => {
    const clean = p.trim().toUpperCase();
    if (!clean) return;

    // Check for shorthand prefixes like S4, G2, S-4, B-P2, BP2
    // We match a single letter followed by numbers or a simple value, optionally separated by a dash or containing letters
    const shorthandMatch = clean.match(/^([SGBHA])-?([A-Z0-9\.]+|NONE|MAX|MIN)$/);
    if (shorthandMatch) {
      const key = mapping[shorthandMatch[1]];
      if (key) {
        settings[key] = shorthandMatch[2];
      }
      return;
    }

    // Check for Key:Value pairs
    if (clean.includes(':')) {
      const [k, v] = clean.split(':').map(x => x.trim());
      if (k && v) {
        // Map shorthand keys to full names if needed
        const fullKey = mapping[k] || k.charAt(0) + k.slice(1).toLowerCase();
        settings[fullKey] = v;
      }
      return;
    }
  });

  // If we found specific keys, return them
  if (Object.keys(settings).length > 0) return settings;

  // Fallback: Check for common patterns manually if splitting failed
  // e.g. "S4G2B3" (no spaces)
  const denseMatch = settingsStr.match(/S(\d+)|G(\d+)|B(\d+)|H(\d+)/g);
  if (denseMatch) {
    denseMatch.forEach(m => {
      const key = mapping[m.charAt(0)];
      if (key) settings[key] = m.substring(1);
    });
  }

  // If still empty but we have a string, use 'General'
  if (Object.keys(settings).length === 0 && settingsStr.trim()) {
    settings['General'] = settingsStr.trim();
  }

  return settings;
}

/**
 * Calculate the total volume lifted during an exercise.
 * For standard exercises: Volume = Weight * Reps.
 * For Time Static Contractions (TSC): Every 30 seconds counts as 2 reps. 
 */
export function calculateExerciseVolume(log: { weight?: string, reps?: string, isStaticHold?: boolean, isTSC?: boolean, seconds?: string }): number {
  const weight = parseInt(log.weight || '0', 10);
  if (isNaN(weight) || weight <= 0) return 0;

  if (log.isStaticHold || log.isTSC) {
    const seconds = parseInt(log.seconds || '0', 10);
    if (isNaN(seconds) || seconds <= 0) return 0;
    const equivalentReps = (seconds / 30) * 2;
    return weight * equivalentReps;
  } else {
    const reps = parseInt(log.reps || '0', 10);
    return weight * (isNaN(reps) || reps <= 0 ? 1 : reps);
  }
}

/**
 * Returns Tailwind classes for standardized muscle group color coding.
 */
export function getMuscleGroupColor(machineName: string = ''): string {
  const style = getMachineStyle(machineName);
  return `${style.bg} ${style.text} border ${style.border}`;
}

/**
 * Identifies if a session is valid (active and not abandoned)
 * Abandoned sessions are 60+ minutes past their last heartbeat or creation.
 */
export function isSessionValid(session: any): boolean {
  if (!session) return false;
  if (session.status !== 'In-Progress') return true;
  
  const now = new Date().getTime();
  const heartbeat = getMillis(session.lastHeartbeatAt);
  const created = getMillis(session.createdAt);
  
  // Use heartbeat if available, fallback to creation time
  const referenceTime = heartbeat > 0 ? heartbeat : created;
  if (!referenceTime) return true; // Can't validate without timestamp
  
  const ageInMinutes = (now - referenceTime) / (1000 * 60);
  return ageInMinutes < 60; // Valid if less than 60 minutes old
}

/**
 * Identifies if a machine is one of the "Big 5"
 */
export function isBig5Machine(machineName: string = ''): boolean {
  const big5 = ["chest press", "compound row", "overhead press", "pulldown", "leg press"];
  return big5.includes(machineName.toLowerCase());
}

/**
 * Orders machine settings entries for display.
 * Requested order: gap, back pad, chest pad, seat.
 * Any other settings are placed after in alphabetical order.
 */
export function orderMachineSettings(settings: Record<string, string> | undefined | null): [string, string][] {
  if (!settings) return [];
  
  const PREFERRED_ORDER = ['gap', 'back pad', 'chest pad', 'seat'];
  
  const entries = Object.entries(settings);
  return entries.sort(([keyA], [keyB]) => {
    let indexA = PREFERRED_ORDER.findIndex(k => keyA.toLowerCase().includes(k));
    let indexB = PREFERRED_ORDER.findIndex(k => keyB.toLowerCase().includes(k));
    
    // If exact matches are preferred, we can use exact matching, but includes handles things like 'Back Pad'
    
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    
    if (indexA !== indexB) {
      return indexA - indexB; // Lower index comes first
    }
    
    return keyA.localeCompare(keyB);
  });
}
