export interface TrainerAvailability {
  standard: {
    [day: string]: { isOpen: boolean; slots: { start: string; end: string }[] };
  };
  overrides?: {
    [date: string]: { isOpen: boolean; slots: { start: string; end: string }[] };
  };
}

export interface Trainer {
  id?: string;
  fullName: string;
  initials: string;
  pin: string;
  isOwner?: boolean;
  availability?: TrainerAvailability;
  mindbody_ical_url?: string;
  legacy_filemaker_id?: string;
  createdAt?: any;
  order?: number;
  isVisibleOnCalendar?: boolean;
}

export interface ClientEvent {
  id: string;
  date: string; // ISO date format or something similar
  title: string;
  type: 'Progress Report' | 'InBody Scan' | 'Routine Change' | 'Vacation' | 'Birthday/Anniversary' | 'Other';
  priority: 'High' | 'Medium' | 'Low';
  notes?: string;
  createdAt?: any;
}

export interface ClinicalSafetyFlag {
  id: string;
  category: string;
  conditionName: string;
  severity: string;
  protocolHandling: {
    instruction: string;
    affectedMachineIds: string[];
    setupModification?: string;
  }[];
}

export interface CurrentMachineMetric {
  weight: string;
  reps?: string;
  seconds?: string;
  isStaticHold?: boolean;
  isTSC?: boolean;
  totalTimeUnderLoad?: number;
  averageTimePerRep?: number;
  settings: Record<string, string>;
  lastPerformedDate: any;
  lastPerformedSessionNumber?: number;
  lastSessionId?: string;
}

export interface Client {
  id?: string;
  mindbodyId?: string;
  firstName: string;
  lastName: string;
  gender?: 'Male' | 'Female' | 'Other' | string;
  height: string; // e.g., "5'10\""
  weight?: string;
  age?: number;
  phone?: string;
  email?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  isActive: boolean;
  medicalHistory?: string;
  occupation?: string;
  isRetired?: boolean;
  clinicalProfile?: string[];
  clinicalFlags?: string[];
  clinicalNotes?: string;
  activityLevel?: 'Sedentary' | 'Light' | 'Moderate' | 'High' | 'Manual Labor';
  trainingPedigree?: 'Novice' | 'Intermediate' | 'Advanced' | 'Protocol Veteran';
  recoveryMetric?: 'Poor' | 'Average' | 'Optimal';
  activity?: string;
  goals?: string;
  globalNotes?: string;
  leadSource?: string;
  referredBy?: string;
  notes?: string;
  events?: ClientEvent[];
  isRoutineBActive?: boolean;
  remainingSessions: number;
  legacy_filemaker_id?: string;
  mindbody_name?: string;
  completedSessions?: number;
  sessionCount?: number;
  packageTier?: "6-Month" | "12-Month" | "18-Month" | "None";
  consultationCompleted?: boolean;
  requiresConsultation?: boolean;
  firstSessionDate?: any;
  discoveryNotes?: string;
  currentMachineMetrics?: Record<string, CurrentMachineMetric>;
  createdAt?: any;
}

export interface Machine {
  id?: string;
  name: string;
  fullName?: string;
  settings?: string; // Repurposed as "Standard Setup Tips"
  settingOptions?: string[]; // e.g. ["Seat", "Pads", "Backrest"]
  standardSettings?: Record<string, string>; // e.g. {"Seat": "5", "Pads": "2"}
  order?: number;
  imageUrl?: string;
  anatomicalRegion?: string;
  kinematicClassification?: string;
  targetMuscles?: string | string[]; // Muscle group names or short desc
  primaryMuscles?: string[];
  targetMusculature?: string[];
  synergists?: string[];
  setupGap?: string;
  executionPosture?: "Chest Up / Anterior Pelvic Tilt" | "Posterior Pelvic Tilt / Contracted Abdomen" | string;
  requiresHandoff?: boolean;
  sequencingContraindications?: string[];
  biomechanicalNotes?: string;
  contraindicatedFor?: string[];
  modifications?: string;
  muscleImageUrl?: string; // Image showing targeted muscles
  formVideoUrl?: string;
  cueingTips?: string; // Peer-to-peer trainer tips
  deepDiveNotes?: string;
}

export interface MachineSettingChange {
  id?: string;
  machineId: string;
  clientId: string;
  trainerId: string;
  previousSettings: Record<string, string>;
  newSettings: Record<string, string>;
  reason?: string;
  createdAt: any;
}

export interface Routine {
  id?: string;
  clientId: string;
  name: string;
  machineIds: string[];
  machineNotes?: Record<string, string>; // Machine ID -> Routine-specific Note
  createdAt?: any;
}

export interface RoutineAdjustment {
  id?: string;
  routineId: string;
  clientId: string;
  previousMachineIds: string[];
  newMachineIds: string[];
  trainerId: string;
  notes?: string;
  createdAt: any;
}

export type SessionType = 'Standard' | 'Onboarding' | 'Reset';

export interface WorkoutSession {
  id?: string;
  clientId?: string;
  routineId?: string;
  sessionType: SessionType;
  sessionNumber: number;
  date: string;
  trainerInitials: string;
  trainerId?: string;
  notes?: string; // Original notes field (deprecated in favor of sub-collection)
  clientFeel?: string;
  startTime?: any;
  endTime?: any;
  status: 'In-Progress' | 'Completed';
  clientAge?: number;
  clientOccupation?: string;
  clientIsRetired?: boolean;
  clientActivityLevel?: string;
  clientClinicalProfile?: string[];
  legacy_filemaker_id?: string;
  legacy_notes?: string;
  createdAt?: any;
}

export interface SessionNote {
  id?: string;
  sessionId: string;
  clientId?: string;
  trainerId?: string;
  trainerInitials: string;
  content: string;
  priority?: 'High' | 'Medium' | 'Low';
  createdAt: any;
}

export type RepQuality = 1 | 2 | 3;

export interface ExerciseLog {
  id?: string;
  sessionId: string;
  clientId?: string;
  machineId: string;
  suggestedOrder?: number;
  weight?: string;
  reps?: string;
  repsLeft?: number;
  repsRight?: number;
  seconds?: string;
  targetWeight?: string;
  isStaticHold?: boolean;
  isTSC?: boolean;
  repQuality?: RepQuality;
  timeSpent?: string;
  totalTimeUnderLoad?: number;
  averageTimePerRep?: number;
  side?: 'Left' | 'Right';
  notes?: string;
  machineSettings?: Record<string, string>; // Settings used for this specific set
  createdAt?: any;
  updatedAt?: any;
}

export interface MachineNote {
  id?: string;
  content: string;
  authorId?: string;
  authorName: string;
  timestamp: any;
  isImportant: boolean;
}

export interface SettingsHistoryEntry {
  settings: Record<string, string>;
  updatedBy: string;
  updatedAt: any;
  reason?: string;
}

export interface ClientMachineSetting {
  id?: string;
  clientId: string;
  machineId: string;
  settings: Record<string, string>;
  updatedBy: string;
  updatedAt: any;
  notes?: string;
  machineNotes?: MachineNote[];
  settingsHistory?: SettingsHistoryEntry[];
  startingWeight?: number;
  startingWeightDate?: any;
  currentWeight?: number;
}

export interface ScheduleEntry {
  id?: string;
  clientId?: string;
  clientName: string;
  trainerId?: string;
  trainerName: string;
  startTime: any;
  endTime: any;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'No-Show';
  serviceName: string;
  source: 'MindBody' | 'Manual' | 'Subscription';
  importId?: string;
  ical_uid?: string;
  createdAt: any;
}

export type HighlightMetricType = 'strength_gain' | 'total_volume' | 'consistent_quality' | 'time_under_tension' | 'custom';

export interface ProgressReport {
  id?: string;
  clientId: string;
  trainerId: string;
  trainerName: string;
  trainerInitials?: string;
  sessionNumber?: number;
  date: string;
  isManual?: boolean;
  status: 'Draft' | 'Finalized';
  
  // Step 1: Attendance & Consistency
  attendance: {
    score: number; // 0-100
    totalSessions: number;
    avgDuration: number;
    punctuality: string; // e.g., "Generally early"
    narrative: string; // "Great job showing up..."
    firstSessionDate?: string;
    totalVolume?: number;
    totalReps?: number;
    totalGoodReps?: number;
    avgRestDays?: number;
    toggles?: {
      totalSessions: boolean;
      totalVolume: boolean;
      totalReps: boolean;
      totalGoodReps?: boolean;
      avgRestDays: boolean;
      avgDuration: boolean;
    };
    customStartDate?: string;
  };

  // Step 2: Highlighted Movements (Measurable Progress)
  highlights: {
    machineId?: string;
    label: string;
    metricType?: HighlightMetricType;
    startValue?: string;
    currentValue?: string;
    percentageIncrease?: number;
    totalVolume?: number;
    perfectSets?: number;
    timeUnderTension?: number;
    customText?: string;
    narrative?: string;
  }[];

  // Step 3: The Four P's
  performanceMatrix: {
    includedNotes?: string[];
    posture: { 
      score: number; 
      note: string; 
      talkingPoints: { id: string; text: string; status: 'red' | 'black' | 'green' }[];
    };
    pace: { 
      score: number; 
      note: string; 
      talkingPoints: { id: string; text: string; status: 'red' | 'black' | 'green' }[];
    };
    path: { 
      score: number; 
      note: string; 
      talkingPoints: { id: string; text: string; status: 'red' | 'black' | 'green' }[];
    };
    purpose: { 
      score: number; 
      note: string; 
      talkingPoints: { id: string; text: string; status: 'red' | 'black' | 'green' }[];
    };
  };

  // Step 4: The Past (Milestones)
  milestones: {
    originalWhy: string;
    smartGoal: string; // "Skiing trip ready by [Date]"
  };

  // Step 5: The Future
  strategy: {
    primaryPlan: string; // "Routine Mastery"
    focusAreas: string; // "Immediate machine focus..."
  };
  
  roadmap?: {
    anchorCategory: 'weight_loss' | 'eih_management' | 'general_conditioning';
    emotionalAnchor: string;
    smartGoal: string;
    prescriptionType: 'quantitative' | 'qualitative';
    inStudioPrescription: {
      targetMachine: string;
      targetMetric?: string;
      qualitativeFocus?: string;
      timeframe: string;
    };
  };

  trainerNotes?: string;

  createdAt: any;
}

export type FocusCategory = 'Posture' | 'Pace' | 'Path' | 'Purpose';

export type FocusStatus = 'Active' | 'Achieved' | 'Deleted';

export interface FocusRecord {
  id: string;
  clientId: string;
  category: FocusCategory;
  dateAssigned: any; // Timestamp or date string
  assignedBy: string; // Trainer initials
  trainerId: string; // Trainer ID
  targetMachineId?: string; // Machine ID
  clinicalNotes: string;
  status: FocusStatus;
  dateUpdated?: any;
}

export interface TrainerFocus {
  id?: string;
  clientId: string;
  trainerId: string;
  trainerName: string;
  category: FocusCategory;
  notes: string;
  updatedAt: any;
}

export type View = 'trainers' | 'clients' | 'machines' | 'workouts' | 'history' | 'calendar' | 'trainer-hub' | 'dashboard' | 'profile' | 'chart' | 'trainer-profile' | 'progress-report' | 'consultation-wizard' | 'machine-knowledge' | 'client-directory' | 'chart-importer' | 'leaderboard';
