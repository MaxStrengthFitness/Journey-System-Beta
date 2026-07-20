import React, { useState, useEffect } from "react";
import { 
  Client, 
  ExerciseLog, 
  WorkoutSession, 
  FocusRecord, 
  ClinicalIncident, 
  Machine 
} from "../types";
import { CLINICAL_TAGS } from "../data/clinical-tags";
import { ClientClinicalReviewView } from "./ClientClinicalReviewView";
import { db } from "../firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { Loader2 } from "lucide-react";

export interface ClientClinicalReviewPreloaderProps {
  client: Client;
  machines: Machine[];
  initialLogs?: ExerciseLog[];
  initialSessions?: WorkoutSession[];
  onOpenBriefing: () => void;
  onClose: () => void;
}

export function ClientClinicalReviewPreloader({
  client,
  machines,
  initialLogs = [],
  initialSessions = [],
  onOpenBriefing,
  onClose
}: ClientClinicalReviewPreloaderProps) {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ExerciseLog[]>(initialLogs);
  const [sessions, setSessions] = useState<WorkoutSession[]>(initialSessions);
  const [focusRecords, setFocusRecords] = useState<FocusRecord[]>([]);
  const [incidents, setIncidents] = useState<ClinicalIncident[]>([]);

  useEffect(() => {
    let isMounted = true;
    
    async function fetchData() {
      try {
        const [
          sessionsSnap,
          logsSnap,
          focusSnap,
          incidentsSnap
        ] = await Promise.all([
          getDocs(query(collection(db, "sessions"), where("clientId", "==", client.id))),
          getDocs(query(collection(db, "exerciseLogs"), where("clientId", "==", client.id))),
          getDocs(query(collection(db, "focusRecords"), where("clientId", "==", client.id))),
          getDocs(query(collection(db, "clinicalIncidents"), where("clientId", "==", client.id)))
        ]);

        if (isMounted) {
          const fetchedSessions = sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutSession));
          const fetchedLogs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ExerciseLog));

          // Deduplicate and merge initial + fetched sessions
          const sessionMap = new Map<string, WorkoutSession>();
          (initialSessions || []).forEach(s => sessionMap.set(s.id, s));
          fetchedSessions.forEach(s => sessionMap.set(s.id, s));

          // Deduplicate and merge initial + fetched logs
          const logMap = new Map<string, ExerciseLog>();
          (initialLogs || []).forEach(l => logMap.set(l.id, l));
          fetchedLogs.forEach(l => logMap.set(l.id, l));

          setSessions(Array.from(sessionMap.values()));
          setLogs(Array.from(logMap.values()));
          setFocusRecords(focusSnap.docs.map(d => ({ id: d.id, ...d.data() } as FocusRecord)));
          setIncidents(incidentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ClinicalIncident)));
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading clinical review data", err);
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [client.id]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-bg-dark flex flex-col items-center justify-center font-sans">
         <Loader2 className="w-12 h-12 text-[#38BDF8] animate-spin mb-4" />
         <p className="text-slate-900 dark:text-white text-sm uppercase tracking-widest font-bold">Loading Clinical Data...</p>
      </div>
    );
  }

  return (
    <ClientClinicalReviewView
      client={client}
      logs={logs}
      sessions={sessions}
      focusRecords={focusRecords}
      incidents={incidents}
      machines={machines}
      clinicalTags={CLINICAL_TAGS}
      onOpenBriefing={onOpenBriefing}
      onClose={onClose}
    />
  );
}
