import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
    const parsed = new Date(dateObj).getTime();
    return isNaN(parsed) ? 0 : parsed;
  } catch(e) {
    return 0;
  }
}

export function safeToDate(d: any): Date | null {
  if (!d) return null;
  if (typeof d.toDate === 'function') return d.toDate();
  if (typeof d === 'string' || typeof d === 'number') {
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
  
  // Standard format YYYY-MM-DD
  if (dateString.includes('-') && dateString.split('-')[0].length === 4) {
    const d = new Date(dateString + 'T12:00:00');
    return isNaN(d.getTime()) ? 0 : d.getTime();
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
  const lowerName = machineName.toLowerCase();
  
  // Green: Lower Body / Hips
  if (lowerName.includes('leg') || lowerName.includes('calf') || lowerName.includes('abduction') || lowerName.includes('adduction') || lowerName.includes('glute')) {
    return 'bg-green-50 text-green-800 border-green-200';
  }

  // Blue: Upper Body – Pull
  if (lowerName.includes('row') || lowerName.includes('pull') || lowerName.includes('bicep') || lowerName.includes('torso arm')) {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }

  // Red/Orange: Upper Body – Push
  // Leg Press is caught by Green above
  if (lowerName.includes('chest') || lowerName.includes('press') || lowerName.includes('dip') || lowerName.includes('fly') || lowerName.includes('lateral') || lowerName.includes('tricep') || lowerName.includes('shoulder')) {
    return 'bg-red-50 text-red-700 border-red-200';
  }

  // Purple: Trunk / Spine / Core
  if (lowerName.includes('lumbar') || lowerName.includes('abdominal') || lowerName.includes('abs') || lowerName.includes('torso rotation') || lowerName.includes('cervical') || lowerName.includes('core') || lowerName.includes('trunk')) {
    return 'bg-purple-50 text-purple-800 border-purple-200';
  }

  // Default neutral
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

/**
 * Identifies if a machine is one of the "Big 5"
 */
export function isBig5Machine(machineName: string = ''): boolean {
  const big5 = ["chest press", "compound row", "overhead press", "pulldown", "leg press"];
  return big5.includes(machineName.toLowerCase());
}
