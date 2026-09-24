import { authedFetch } from "../lib/authed-fetch";

export interface ValidationLog {
  id: string;
  name: string;
  rawName?: string;
  settings?: string;
  weight: number;
  reps: any;
  isStaticHold: boolean;
  timeUnderLoad?: number | null;
  machineId?: string;
  isAnomalous?: boolean;
  anomalyReason?: string;
}

export interface ValidationSession {
  id: string;
  sessionNumber: number;
  date: string;
  trainer: string;
  trainerId?: string;
  machines: ValidationLog[];
  isInferredDate?: boolean;
  hasConflict?: boolean;
}

export interface ExtractedSessionHeader {
  sessionNumber: number;
  date?: string;
  trainer?: string;
}

export interface ExtractedPerformance {
  sessionNumber: number;
  machineName: string;
  weight?: number;
  reps?: number | string;
  settings?: string;
  isStaticHold?: boolean;
}

export interface OCRResult {
  sessionHeaders: ExtractedSessionHeader[];
  performances: ExtractedPerformance[];
}

export interface OCRMachineSetting {
  machineId: string;
  machineName: string;
  seat?: string;
  gap?: string;
  backPad?: string;
  handles?: string;
  rawSettings?: Record<string, string>;
  armPad?: string;
  startingWeight?: string;
  currentWeight?: string;
}

async function handleResponse(res: Response) {
  if (!res.ok) {
    let errorMsg: any = 'API Request Failed';
    try {
      const errorData = await res.json();
      errorMsg = errorData?.error || errorMsg;
      if (typeof errorMsg === 'object' && errorMsg !== null && 'message' in errorMsg) {
        errorMsg = errorMsg.message;
      }
    } catch (e) {
      // ignore
    }
    throw new Error(String(errorMsg));
  }
  return res.json();
}

// Both routes need a staff sign-in (server/gemini-routes.ts, Sep 24 2026):
// authedFetch adds it, a plain fetch gets a 401.
export async function processLegacyChart(images: { base64: string; mimeType: string }[], expectedSessions: number, pageIndex?: number, totalPages?: number): Promise<OCRResult> {
  const res = await authedFetch('/api/gemini/processChart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, expectedSessions, pageIndex, totalPages })
  });
  return handleResponse(res);
}

export async function extractMachineSettingsFromImage(images: { base64: string; mimeType: string }[]): Promise<OCRMachineSetting[]> {
  const res = await authedFetch('/api/gemini/extractSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images })
  });
  return handleResponse(res);
}

import { parseSessionDate } from "../lib/utils";

export function sanitizeImportedSessions(sessions: ValidationSession[]): ValidationSession[] {
  // Sort by sessionNumber chronologically initially
  const sorted = [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber);

  let lastValidDateTS = new Date().getTime();

  for (let i = 0; i < sorted.length; i++) {
    const sess = sorted[i];

    // Check if missing or invalid date for Rule 2 / 3
    let isInvalidDate = !sess.date || sess.date.toLowerCase() === 'confirm' || sess.date === '0' || sess.isInferredDate;
    
    let currentTS = 0;
    if (!isInvalidDate) {
      currentTS = parseSessionDate(sess.date);
      if (currentTS <= 0) {
        isInvalidDate = true;
      }
    }

    if (isInvalidDate) {
      // Rule 2: Dynamic Rest Imputation (+4 days)
      if (i > 0) {
        lastValidDateTS += 4 * 24 * 60 * 60 * 1000;
        sess.isInferredDate = true;
      } else {
        // First session and mostly blank
        sess.isInferredDate = true;
      }
      
      const d = new Date(lastValidDateTS);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      sess.date = `${yyyy}-${mm}-${dd}`;
    } else {
      // Rule 3: Trust the OCR
      lastValidDateTS = currentTS;
      sess.isInferredDate = false;
      const d = new Date(lastValidDateTS);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      sess.date = `${yyyy}-${mm}-${dd}`;
    }
  }

  // 2. Rule 1: One Session Per Day Constraint
  const mergedSessions: ValidationSession[] = [];
  const dateMap: Record<string, ValidationSession> = {};

  for (const sess of sorted) {
    if (dateMap[sess.date]) {
      const existing = dateMap[sess.date];
      let conflict = false;

      sess.machines.forEach(incomingMachine => {
        const existingMachine = existing.machines.find(m => m.machineId === incomingMachine.machineId);
        if (existingMachine) {
          if (existingMachine.weight !== incomingMachine.weight || existingMachine.reps !== incomingMachine.reps) {
            conflict = true;
          }
        } else {
          existing.machines.push(incomingMachine);
        }
      });

      if (conflict) {
        existing.hasConflict = true;
      }
    } else {
      dateMap[sess.date] = sess;
      mergedSessions.push(sess);
    }
  }

  // Re-number sessions after merge
  mergedSessions.sort((a, b) => parseSessionDate(a.date) - parseSessionDate(b.date));
  mergedSessions.forEach((sess, idx) => {
    sess.sessionNumber = idx + 1;
  });

  return mergedSessions;
}
