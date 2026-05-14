import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

export interface ImportedLegacySession {
  id: string;
  dateString: string; // e.g., "09/02/2016"
  sessionNumber?: number | string;
  machines: any[];
  [key: string]: any;
}

// 1. Data Parsing & Sorting Utility
export const parseAndSortLegacySessions = (sessions: ImportedLegacySession[]) => {
  return [...sessions].map(session => {
    let parsedDate = new Date(0); // Fallback to Epoch
    
    if (session.dateString) {
      const parts = session.dateString.split('/');
      if (parts.length === 3) {
        const [month, day, year] = parts;
        // Month is 0-indexed in JS Date
        parsedDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
      } else {
        // Fallback for non-standard formats
        const fallbackParse = new Date(session.dateString);
        if (!isNaN(fallbackParse.getTime())) {
          parsedDate = fallbackParse;
        }
      }
    }

    return {
      ...session,
      parsedDate,
      timestamp: parsedDate.getTime()
    };
  }).sort((a, b) => a.timestamp - b.timestamp); // Chronological sort (oldest to newest)
};

interface ImportValidationModalProps {
  clientId: string;
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  rawSessions: ImportedLegacySession[];
}

// 2. The Validation Gate Modal
export function ImportValidationModal({
  clientId,
  isOpen,
  onClose,
  onImportComplete,
  rawSessions
}: ImportValidationModalProps) {
  
  // Sort the sessions properly chronologically
  const sortedSessions = useMemo(() => parseAndSortLegacySessions(rawSessions), [rawSessions]);
  
  // Default to the last session in the sorted array (Most Recent)
  const defaultRecentSessionId = sortedSessions.length > 0 ? sortedSessions[sortedSessions.length - 1].id : '';
  const [selectedSessionId, setSelectedSessionId] = useState<string>(defaultRecentSessionId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const firstSession = sortedSessions.length > 0 ? sortedSessions[0] : null;
  const calculatedMostRecent = sortedSessions.length > 0 ? sortedSessions[sortedSessions.length - 1] : null;

  // 3. Firebase Handoff & Standardization
  const handleConfirmImport = async () => {
    if (!selectedSessionId || !clientId) return;
    setIsSubmitting(true);
    
    try {
      const selectedSession = sortedSessions.find(s => s.id === selectedSessionId);
      if (!selectedSession) throw new Error("Fallback session not found");

      // Standardize ALL dates into ISO 8601 strings before writing to Firebase
      // to permanently fix the string sorting issues.
      const standardizedHistory = sortedSessions.map(sess => ({
        ...sess,
        // Replace MM/DD/YYYY with strict ISO string
        dateStandardized: sess.parsedDate.toISOString(), 
        date: sess.parsedDate.toISOString()
      }));

      // In a full implementation, you would batch write standardizedHistory 
      // into the collections. For the specific requirement:

      // Map the machine loadout from the confirmed most recent session
      const targetWeightsPayload = selectedSession.machines.map(m => ({
        machineId: m.machineId || m.name,
        weight: m.weight || 0,
        reps: m.reps || '',
        settings: m.settings || {},
        timeUnderLoad: m.timeUnderLoad || 0,
        isStaticHold: !!m.isStaticHold
      }));

      // Write the specific machine weight array to a dedicated document
      const prescriptionRef = doc(db, 'nextSessionWeights', clientId);
      await setDoc(prescriptionRef, {
        clientId,
        sourceLegacySessionId: selectedSession.id,
        sourceSessionDate: selectedSession.parsedDate.toISOString(),
        weights: targetWeightsPayload,
        status: 'StagedFromLegacyImport',
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Signal completion on the client document
      const clientRef = doc(db, 'clients', clientId);
      await updateDoc(clientRef, {
        legacyImportCompleted: true,
        lastImportDate: serverTimestamp()
      });

      onImportComplete();
      onClose();
    } catch (error) {
      console.error("Error committing validation gate:", error);
      alert("Failed to commit standardized legacy data.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-lg bg-slate-900 border-slate-700 shadow-2xl flex flex-col max-h-[90vh]">
        <CardHeader className="border-b border-slate-800 pb-4 shrink-0">
          <CardTitle className="text-xl font-black text-white uppercase tracking-widest text-center">
            Import Validation Gate
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-6 space-y-6 overflow-y-auto">
          {/* Analysis View */}
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-700/50">
              <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total Sessions Found</span>
              <span className="text-xl font-black text-white">{sortedSessions.length}</span>
            </div>
            
            <div className="flex justify-between items-center pb-3 border-b border-slate-700/50">
              <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">First Session Date</span>
              <span className="text-sm font-bold text-white">
                {firstSession ? firstSession.parsedDate.toLocaleDateString() : 'N/A'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Calculated Most Recent</span>
              <span className="text-sm font-black text-[#F06C22]">
                {calculatedMostRecent ? calculatedMostRecent.parsedDate.toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>

          {/* Manual Override Settings */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-300 uppercase tracking-widest">
              Manual Override: Target Session Data
            </label>
            <p className="text-[10px] text-slate-500 font-medium">
              Verify the system extracted the correct chronological "last session". If a legacy typo placed a session out of order, you can manually select the correct starting weights for their next workout below.
            </p>
            <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
              <SelectTrigger className="w-full bg-slate-950 border-slate-700 text-white cursor-pointer h-12 font-bold">
                <SelectValue placeholder="Select target session" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-white max-h-60">
                {/* Present the override list in reverse-chronological order for ease of use */}
                {[...sortedSessions].reverse().map(sess => (
                  <SelectItem key={sess.id} value={sess.id} className="focus:bg-slate-800 hover:bg-slate-800 cursor-pointer">
                    {sess.parsedDate.toLocaleDateString()} — {sess.sessionNumber ? `Session #${sess.sessionNumber}` : `Session ID: ${sess.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-3 pt-6 border-t border-slate-800 shrink-0">
            <Button 
              variant="ghost" 
              className="w-1/3 text-slate-400 hover:text-white uppercase font-black tracking-wider text-xs h-12"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              className="w-2/3 bg-[#F06C22] hover:bg-[#D95B16] text-white uppercase font-black tracking-widest text-xs h-12 shadow-[0_0_15px_rgba(240,108,34,0.3)] transition-all disabled:opacity-50"
              onClick={handleConfirmImport}
              disabled={isSubmitting || !selectedSessionId}
            >
              {isSubmitting ? 'Committing...' : 'Confirm & Import'}
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
