import { Client, ExerciseLog, WorkoutSession, FocusRecord, ClinicalIncident, Machine, ClinicalTagDefinition, RPE } from "../types";

export interface ReviewMetrics {
  totalTonnage: number;
  totalReps: number;
  repQualityBreakdown: { elite: number; good: number; poor: number };
  meanRPEHistory: { date: string; value: number }[];
  formTagCountsByWeek: { weekIndex: number; _weekLabel?: string; tags: Record<string, number> }[];
  topFormTags: string[]; // tag IDs
  symptomsByRegion: Record<string, NonNullable<ExerciseLog["symptoms"]>>;
  topMachines: { id: string; logs: ExerciseLog[] }[];
  preSessionCheckIns: { date: string; checkIn: WorkoutSession["preSessionCheckIn"] }[];
  activeFociWithMatchCount: { focus: FocusRecord; matchCount: number }[];
  setupCorrectPercentage: number;
  lastSeenDaysAgo: number | null;
  sessionsRemaining: number;
  volumeByDate: { date: string; volume: number }[];
  rpeDistribution: { name: string; value: number; fill: string }[];
  volumeByRegion: { region: string; volume: number }[];
}

export function computeClinicalMetrics(
  client: Client,
  logs: ExerciseLog[],
  sessions: WorkoutSession[],
  focusRecords: FocusRecord[],
  incidents: ClinicalIncident[],
  clinicalTags: ClinicalTagDefinition[],
  machines: Machine[],
  windowDays: number
): ReviewMetrics {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // Filter sessions in window
  const sessionsInWindow = sessions.filter(s => {
    if (!s.date) return false;
    const sessionDate = new Date(s.date);
    if (isNaN(sessionDate.getTime())) return false;
    return sessionDate >= windowStart && sessionDate <= now;
  }).sort((a, b) => {
    const d1 = new Date(b.date);
    const d2 = new Date(a.date);
    return d1.getTime() - d2.getTime(); // Descending (newest first)
  });

  const sessionIds = new Set(sessionsInWindow.map(s => s.id));

  // Filter logs in window (either linked to a session in window, or created in window)
  const logsInWindow = logs.filter(log => {
    if (log.sessionId && sessionIds.has(log.sessionId)) return true;
    if (log.createdAt) {
      const createdAt = typeof log.createdAt === 'string' ? new Date(log.createdAt) : new Date(log.createdAt.toMillis ? log.createdAt.toMillis() : log.createdAt);
      if (!isNaN(createdAt.getTime()) && createdAt >= windowStart && createdAt <= now) return true;
    }
    return false;
  });

  // Basic Scoreboard
  let totalTonnage = 0;
  let totalReps = 0;
  let eliteReps = 0;
  let goodReps = 0;
  let poorReps = 0;

  let correctSetups = 0;
  let totalSetupsEvaluated = 0;

  const sessionRPEs: Record<string, number[]> = {};
  const symptomsByRegion: Record<string, any[]> = {};
  const sessionVolumes: Record<string, number> = {};
  const regionVolumes: Record<string, number> = {};
  
  const tagCounts: Record<string, number> = {};
  
  const rpeCounts = {
    '1-3': 0,
    '4-6': 0,
    '7-8': 0,
    '9-10': 0
  };
  const tagCountsByWeek: Record<number, Record<string, number>> = {};
  
  const machineLogCounts: Record<string, ExerciseLog[]> = {};

  logsInWindow.forEach(log => {
    const weight = parseInt(log.weight || "0", 10);
    const reps = parseInt(log.reps || "0", 10);
    const volume = (!isNaN(weight) && !isNaN(reps)) ? weight * reps : 0;
    
    if (volume > 0) {
      totalTonnage += volume;
      totalReps += reps;
      
      // Keep track for Volume By Date
      if (log.sessionId) {
        if (!sessionVolumes[log.sessionId]) sessionVolumes[log.sessionId] = 0;
        sessionVolumes[log.sessionId] += volume;
      }

      // Keep track for Volume By Region
      const machine = machines.find(m => m.id === log.machineId);
      const region = machine?.anatomicalRegion || 'Unknown';
      if (!regionVolumes[region]) regionVolumes[region] = 0;
      regionVolumes[region] += volume;
    }

    if (log.repQuality === 3) eliteReps++;
    else if (log.repQuality === 2) goodReps++;
    else if (log.repQuality === 1) poorReps++;

    if (log.rpe !== undefined) {
      if (log.rpe <= 3) rpeCounts['1-3']++;
      else if (log.rpe <= 6) rpeCounts['4-6']++;
      else if (log.rpe <= 8) rpeCounts['7-8']++;
      else rpeCounts['9-10']++;
    }

    if (log.setupWasCorrect !== undefined) {
      totalSetupsEvaluated++;
      if (log.setupWasCorrect) correctSetups++;
    }

    if (log.symptoms && log.symptoms.length > 0) {
      log.symptoms.forEach(sym => {
        if (!symptomsByRegion[sym.region]) symptomsByRegion[sym.region] = [];
        symptomsByRegion[sym.region].push(sym);
      });
    }

    if (log.clinicalTags && log.clinicalTags.length > 0) {
      // Find session date for week grouping
      const session = sessionsInWindow.find(s => s.id === log.sessionId);
      const sessionDate = session?.date ? new Date(session.date) : null;
      let weekIndex = 0;
      if (sessionDate) {
        const diffTime = Math.abs(now.getTime() - sessionDate.getTime());
        weekIndex = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
      }

      if (!tagCountsByWeek[weekIndex]) tagCountsByWeek[weekIndex] = {};

      log.clinicalTags.forEach(tagId => {
        tagCounts[tagId] = (tagCounts[tagId] || 0) + 1;
        tagCountsByWeek[weekIndex][tagId] = (tagCountsByWeek[weekIndex][tagId] || 0) + 1;
      });
    }

    if (log.rpe) {
      const session = sessionsInWindow.find(s => s.id === log.sessionId);
      if (session?.date) {
        if (!sessionRPEs[session.date]) sessionRPEs[session.date] = [];
        sessionRPEs[session.date].push(log.rpe as number);
      }
    }

    if (log.machineId) {
      if (!machineLogCounts[log.machineId]) machineLogCounts[log.machineId] = [];
      machineLogCounts[log.machineId].push(log);
    }
  });

  // Calculate RPE Sparkline
  const sortedDates = Object.keys(sessionRPEs).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const meanRPEHistory = sortedDates.slice(-7).map(date => {
    const list = sessionRPEs[date];
    const mean = list.reduce((sum, val) => sum + val, 0) / list.length;
    return { date, value: mean };
  });

  // Sort Form Tags
  const formTags = new Set(clinicalTags.filter(t => t.kind === 'Form').map(t => t.id));
  const topFormTags = Object.entries(tagCounts)
    .filter(([id]) => formTags.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(t => t[0]);

  // Create Tag Counts by Week array
  const maxWeek = Math.max(-1, ...Object.keys(tagCountsByWeek).map(Number));
  const formTagCountsByWeek = [];
  for (let i = 0; i <= maxWeek; i++) {
    formTagCountsByWeek.push({
      weekIndex: i,
      _weekLabel: `${i}w ago`,
      tags: tagCountsByWeek[i] || {}
    });
  }

  // Pre-session CheckIns
  const preSessionCheckIns = sessionsInWindow
    .filter(s => s.preSessionCheckIn)
    .map(s => ({
      date: typeof s.date === 'string' ? s.date : new Date(s.date).toISOString(),
      checkIn: s.preSessionCheckIn
    }))
    .reverse(); // Ascending

  // Machine Trend Grid
  const sortedMachines = Object.entries(machineLogCounts)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4)
    .map(([id, machineLogs]) => {
       return {
         id,
         logs: machineLogs.sort((a, b) => {
            const da = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
            const db = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
            return da - db;
         })
       }
    });

  // Setup Self Sufficiency
  const setupCorrectPercentage = totalSetupsEvaluated > 0 ? (correctSetups / totalSetupsEvaluated) * 100 : -1;

  // Last Seen
  let lastSeenDaysAgo = null;
  if (sessions.length > 0) {
    const sorted = [...sessions].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastSession = sorted[0];
    if (lastSession.date) {
      lastSeenDaysAgo = Math.floor(Math.abs(now.getTime() - new Date(lastSession.date).getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  // Active Foci
  const activeFociWithMatchCount = focusRecords
    .filter(f => f.status === 'Active')
    .map(f => {
      // Find matching form tags based on 4P Category? The prompt says "filter by fourPCategory"
      // If FocusRecord doesn't natively map to fourPCategory, we match on standard strings. 
      // FocusCategory might map loosely, but let's assume we can match clinicalTags.fourPCategory === focus.category
      let matchCount = 0;
      logsInWindow.forEach(log => {
        if (log.clinicalTags) {
           log.clinicalTags.forEach(tid => {
              const def = clinicalTags.find(ct => ct.id === tid);
              if (def?.fourPCategory === f.category) matchCount++;
           });
        }
      });
      return { focus: f, matchCount };
    });

  const volumeByDate = sessionsInWindow.slice().reverse().map(s => {
    const vol = sessionVolumes[s.id!] || 0;
    const dateObj = new Date(s.date);
    return {
      date: dateObj.toLocaleDateString('default', { month: 'short', day: 'numeric' }),
      volume: vol
    };
  });

  const rpeDistribution = [
    { name: 'RPE 1-3', value: rpeCounts['1-3'], fill: 'var(--cyan)' },
    { name: 'RPE 4-6', value: rpeCounts['4-6'], fill: 'var(--amber)' },
    { name: 'RPE 7-8', value: rpeCounts['7-8'], fill: 'var(--cta)' },
    { name: 'RPE 9-10', value: rpeCounts['9-10'], fill: 'var(--red)' }
  ].filter(b => b.value > 0);

  const volumeByRegion = Object.keys(regionVolumes).map(region => ({
    region,
    volume: regionVolumes[region]
  })).sort((a, b) => b.volume - a.volume);

  return {
    totalTonnage,
    totalReps,
    repQualityBreakdown: { elite: eliteReps, good: goodReps, poor: poorReps },
    meanRPEHistory,
    formTagCountsByWeek,
    topFormTags,
    symptomsByRegion,
    topMachines: sortedMachines,
    preSessionCheckIns,
    activeFociWithMatchCount,
    setupCorrectPercentage,
    lastSeenDaysAgo,
    sessionsRemaining: client.remainingSessions || 0,
    volumeByDate,
    rpeDistribution,
    volumeByRegion
  };
}
