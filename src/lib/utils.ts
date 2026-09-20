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

  // If still empty but we have a valid short string (not noise words like 'Project' or 'Confirm')
  if (Object.keys(settings).length === 0 && settingsStr.trim()) {
    const raw = settingsStr.trim();
    const noiseWords = ['PROJECT', 'CONFIRM', 'UNKNOWN', 'LEGACY', 'CHART', 'GENERAL', 'NONE', 'NULL', 'UNDEFINED'];
    if (!noiseWords.includes(raw.toUpperCase()) && raw.length <= 8 && !/^[a-zA-Z\s]{4,}$/.test(raw)) {
      settings['General'] = raw;
    }
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
 * Orders machine settings entries for display and shortens key to the first letter.
 * Strict Order: Gap (0) -> Back pad/Chest pad (1) -> Seat (2) -> Others (500) -> Handles (1000).
 */
export function orderMachineSettings(
  settings: Record<string, string> | undefined | null,
  standardSettings?: Record<string, string> | null,
  options?: string[] | null
): [string, string, string][] {
  const mergedSettings: Record<string, string> = {};

  const normalizeKey = (k: string): string => {
    const clean = k.trim().replace(/^PROJECT[-_\s]+/i, '');
    const lower = clean.toLowerCase();
    if (lower === 'seat' || lower === 's') return 'Seat';
    if (lower === 'gap' || lower === 'g') return 'Gap';
    if (lower === 'backpad' || lower === 'back pad' || lower === 'b' || lower === 'back') return 'Back Pad';
    if (lower === 'chestpad' || lower === 'chest pad' || lower === 'chest') return 'Chest Pad';
    if (lower === 'handles' || lower === 'handle' || lower === 'h') return 'Handles';
    if (lower === 'armpad' || lower === 'arm pad' || lower === 'a') return 'Arm Pad';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  };

  const processEntry = (k: string, v: any) => {
    if (!k || v === undefined || v === null) return;
    const strV = String(v).trim();
    if (!strV) return;

    // Check if strV contains embedded "PROJECT-" tokens or JSON like "6 PROJECT-GAP:6"
    if (/PROJECT[-_\s]+/i.test(strV)) {
      const parts = strV.split(/PROJECT[-_\s]+/i);
      parts.forEach((part, index) => {
        const trimmed = part.trim();
        if (!trimmed) return;
        if (index === 0) {
          processEntry(k, trimmed);
        } else {
          if (trimmed.includes(':')) {
            const colonIdx = trimmed.indexOf(':');
            const subK = trimmed.substring(0, colonIdx).trim();
            const subV = trimmed.substring(colonIdx + 1).trim();
            if (subK.toLowerCase().includes('rawsettings') || subV.startsWith('{')) {
              try {
                const match = subV.match(/\{.*\}/);
                const jsonStr = match ? match[0] : subV;
                const parsed = JSON.parse(jsonStr);
                Object.entries(parsed).forEach(([innerK, innerV]) => processEntry(innerK, innerV));
              } catch {}
            } else {
              processEntry(subK, subV);
            }
          } else {
            const spaceMatch = trimmed.match(/^([a-zA-Z]+)[\s=]+(.+)$/);
            if (spaceMatch) {
              processEntry(spaceMatch[1], spaceMatch[2]);
            }
          }
        }
      });
      return;
    }

    // If strV is a JSON string
    if (strV.startsWith('{')) {
      try {
        const parsed = JSON.parse(strV);
        Object.entries(parsed).forEach(([innerK, innerV]) => processEntry(innerK, innerV));
        return;
      } catch {}
    }

    const finalK = normalizeKey(k);
    const noiseWords = ['PROJECT', 'CONFIRM', 'UNKNOWN', 'LEGACY', 'CHART', 'NULL', 'UNDEFINED', 'RAWSETTINGS'];
    if (!noiseWords.includes(strV.toUpperCase()) && !strV.startsWith('{') && strV.length <= 10) {
      mergedSettings[finalK] = strV;
    }
  };

  // Process all incoming raw settings
  Object.entries(settings || {}).forEach(([rawK, rawV]) => {
    processEntry(rawK, rawV);
  });
  
  // 1. If options are provided, normalize "Back/Chest Pad" key mismatches dynamically
  if (options && options.length > 0) {
    const hasChestInOptions = options.some(o => o.toLowerCase().includes('chest'));
    const hasBackInOptions = options.some(o => o.toLowerCase().includes('back'));
    
    for (const rawKey of Object.keys(mergedSettings)) {
      const lowerKey = rawKey.toLowerCase().trim();
      
      if (hasChestInOptions && !hasBackInOptions && lowerKey.includes('back')) {
        const chestOpt = options.find(o => o.toLowerCase().includes('chest'))!;
        const val = mergedSettings[rawKey];
        delete mergedSettings[rawKey];
        mergedSettings[chestOpt] = val;
      } else if (hasBackInOptions && !hasChestInOptions && lowerKey.includes('chest')) {
        const backOpt = options.find(o => o.toLowerCase().includes('back'))!;
        const val = mergedSettings[rawKey];
        delete mergedSettings[rawKey];
        mergedSettings[backOpt] = val;
      }
    }
  }

  // 2. Gap, when the machine or the client actually has one.
  //
  // This block used to end with `gapValue = "0"` — so a client with NO
  // settings on file at all rendered "G 0" on the Now Bar, the grid rail and
  // the Equipment rail. That is a confident wrong number on the strip a
  // trainer reads twice per machine, and it is contradicted by the catalog
  // itself: the Academy's starting gap is 2 on the compound row, pulldown,
  // pullover, chest press and chest fly, 1 on three more, 5 and 4 on two
  // others, and per-client on the leg press.
  //
  // It also made the honest empty state unreachable — JourneyGrid's "No
  // machine settings saved for this client" could never render, because
  // there was always one setting.
  //
  // The client's own value still wins; the machine's standard is still used
  // when the client has none. What is gone is inventing a third answer when
  // neither exists.
  const existingGapKey = Object.keys(mergedSettings).find(k => k.toLowerCase() === 'gap');
  let gapValue: string | undefined = undefined;

  if (existingGapKey) {
    const val = mergedSettings[existingGapKey];
    if (val !== undefined && val !== null && val !== '') {
      gapValue = String(val);
    }
  }

  if (gapValue === undefined) {
    const stdGapKey = standardSettings ? Object.keys(standardSettings).find(k => k.toLowerCase() === 'gap') : undefined;
    if (stdGapKey && standardSettings && standardSettings[stdGapKey] !== undefined && standardSettings[stdGapKey] !== null && standardSettings[stdGapKey] !== '') {
      gapValue = String(standardSettings[stdGapKey]);
    }
  }

  if (gapValue !== undefined) {
    mergedSettings["Gap"] = gapValue;
  } else if (existingGapKey) {
    // An explicitly blank gap is not a gap. Drop the empty key rather than
    // leaving "Gap: ''" to render as a chip with no value.
    delete mergedSettings[existingGapKey];
  }

  const entries = Object.entries(mergedSettings);
  
  // 3. Sort using raw keys based on strict scoring logic
  const sorted = entries.sort(([keyA], [keyB]) => {
    const scoreA = getSettingOrderScore(keyA);
    const scoreB = getSettingOrderScore(keyB);
    
    if (scoreA !== scoreB) {
      return scoreA - scoreB;
    }
    
    return keyA.localeCompare(keyB);
  });
  
  // 4. Shorthand keys — unique per machine.
  //
  // This used to be "the first letter, upper-cased", unconditionally. The
  // caller then built a map keyed by that letter, so on any machine with two
  // dials starting with the same letter, ONE OF THEM SILENTLY DISAPPEARED.
  // The Leg Press is the worst case: `Seat Angle`, `Shoulder Pads` and
  // `Seat Distance` all collapsed to "S" and only the last survived, so a
  // client set at Seat Angle P2 / Seat Distance 7 / Shoulder Pads 3 read on
  // the Now Bar as "Gap 2 · Shoulder Pads 3" — the seat position gone, on
  // the machine the studio uses most. The Seated Dip lost a back-pad dial
  // the same way.
  //
  // Now: a letter when it is unambiguous, and word initials for the members
  // of a colliding group — Seat "S", Seat Angle "SA", Seat Distance "SD",
  // Shoulder Pads "SP". The full name still travels as the third element
  // (settingLabels), so the rail shows "SA" and speaks "Seat Angle".
  const preferredShort = (key: string): string => {
    const lower = key.toLowerCase();
    if (lower.includes('arm')) return 'A';
    if (lower.includes('back')) return 'B';
    if (lower.includes('chest')) return 'C';
    return key.trim().substring(0, 1).toUpperCase();
  };

  const initialsOf = (key: string): string =>
    key
      .trim()
      .split(/[\s\-_]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase())
      .join('')
      .slice(0, 3);

  // Which preferred letters are wanted by more than one dial?
  const wantCount = new Map<string, number>();
  for (const [key] of sorted) {
    const p = preferredShort(key);
    wantCount.set(p, (wantCount.get(p) ?? 0) + 1);
  }

  const taken = new Set<string>();
  return sorted.map(([key, val]) => {
    const preferred = preferredShort(key);
    let shortKey = preferred;

    // Widen every member of a colliding group, not just the later ones, so
    // two dials never read as "S" and "SD" — they read as "SA" and "SD".
    if ((wantCount.get(preferred) ?? 0) > 1) {
      const widened = initialsOf(key);
      if (widened.length > 1) shortKey = widened;
    }

    // Last resort: a dial whose widened form still collides (two dials named
    // the same thing) gets a number rather than overwriting its twin.
    if (taken.has(shortKey)) {
      let n = 2;
      while (taken.has(`${shortKey}${n}`)) n++;
      shortKey = `${shortKey}${n}`;
    }
    taken.add(shortKey);

    return [shortKey, val, key];
  }) as [string, string, string][];
}

function getSettingOrderScore(key: string): number {
  const k = key.trim().toLowerCase();
  
  // Gap always first
  if (k.includes('gap') || k === 'g') return 0;
  
  // Back pad or chest pad
  if (k.includes('back') || k.includes('chest') || k === 'b' || k === 'c') return 1;
  
  // Seat
  if (k.includes('seat') || k === 's') return 2;
  
  // Handles always last
  if (k.includes('handle') || k === 'h') return 1000;
  
  // Others in between
  return 500;
}

/*
 * ROLE DISPLAY AND SEARCH TOKENS - moved here from the repo-root lib/utils.ts
 * in the beta-prep trim (Sep 17 2026).
 *
 * There used to be TWO utils modules: this one, reached by relative imports,
 * and a second at the repo root reached through the `@/` alias, each with its
 * own identical cn(). Which one a file got depended only on how the import
 * happened to be typed. The root copy is gone; `@/` now points at src/, so
 * `@/lib/utils` and `../lib/utils` are this same file.
 */
export const getRoleColor = (role: string | undefined): string => {
  switch (role) {
    case "Founder":
      return "text-amber-500 border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10";
    case "Admin":
      return "text-indigo-500 border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10";
    case "Overseer":
      return "text-teal-500 border-teal-200 dark:border-teal-500/30 bg-teal-50 dark:bg-teal-500/10";
    case "Owner":
    case "FranchiseOwner":
    case "StudioOwner":
      return "text-orange-500 border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10";
    case "StudioLeader":
    case "HeadTrainer":
      return "text-sky-500 border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10";
    case "Trainer":
    case "LifeTransformer":
    default:
      return "text-emerald-500 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10";
  }
};

export const getRoleDisplayName = (role: string | undefined): string => {
  switch (role) {
    case "Founder":
      return "Founder";
    case "Admin":
      return "Admin";
    case "Overseer":
      return "Overseer";
    case "Owner":
    case "FranchiseOwner":
    case "StudioOwner":
      return "Owner";
    case "StudioLeader":
    case "HeadTrainer":
      return "Studio Leader";
    case "Trainer":
    case "LifeTransformer":
    default:
      return "Life Transformer";
  }
};

export function generateSearchTokens(fullName: string): string[] {
  const name = fullName.toLowerCase().trim();
  const tokens = new Set<string>();

  const addPrefixes = (word: string) => {
    // Only generate prefixes up to the full word length to avoid overhead,
    // though for typical names it's small enough.
    for (let i = 1; i <= word.length; i++) {
      tokens.add(word.substring(0, i));
    }
  };

  // Add prefixes of the full name (allows matching "robbin m")
  addPrefixes(name);

  // Add prefixes of individual parts
  const parts = name.split(/\s+/);
  if (parts.length > 1) {
    for (const part of parts) {
      addPrefixes(part);
    }
  }

  return Array.from(tokens);
}
