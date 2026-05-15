import React, { useState } from 'react';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Button } from '@/components/ui/button';
import { Loader2, DatabaseZap } from 'lucide-react';

const TARGET_STUDIO_ID = "solon_studio_id_here";

export function DataMigrationTool() {
  const [status, setStatus] = useState<'Ready' | 'Migrating...' | 'Completed successfully' | 'Error'>('Ready');
  const [errorMessage, setErrorMessage] = useState('');

  const runMigration = async () => {
    setStatus('Migrating...');
    setErrorMessage('');
    
    try {
      let batch = writeBatch(db);
      let count = 0;

      const commitBatchAndReset = async () => {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      };

      // 1. Trainers
      const trainersSnap = await getDocs(collection(db, 'trainers'));
      for (const d of trainersSnap.docs) {
        batch.update(doc(db, 'trainers', d.id), { homeStudioId: TARGET_STUDIO_ID });
        count++;
        if (count === 500) await commitBatchAndReset();
      }

      // 2. Clients
      const clientsSnap = await getDocs(collection(db, 'clients'));
      for (const d of clientsSnap.docs) {
        batch.update(doc(db, 'clients', d.id), { homeStudioId: TARGET_STUDIO_ID });
        count++;
        if (count === 500) await commitBatchAndReset();
      }

      // 3. Schedules
      const schedulesSnap = await getDocs(collection(db, 'schedules'));
      for (const d of schedulesSnap.docs) {
        batch.update(doc(db, 'schedules', d.id), { studioId: TARGET_STUDIO_ID });
        count++;
        if (count === 500) await commitBatchAndReset();
      }

      // 4. Sessions
      const sessionsSnap = await getDocs(collection(db, 'sessions'));
      for (const d of sessionsSnap.docs) {
        batch.update(doc(db, 'sessions', d.id), { studioId: TARGET_STUDIO_ID });
        count++;
        if (count === 500) await commitBatchAndReset();
      }

      if (count > 0) {
        await batch.commit();
      }

      setStatus('Completed successfully');
    } catch (error: any) {
      console.error(error);
      setStatus('Error');
      setErrorMessage(error.message);
    }
  };

  return (
    <div className="p-6 bg-slate-900/80 rounded-[24px] border border-slate-700 space-y-4 shadow-xl mt-6">
      <h3 className="text-xl font-black uppercase tracking-tighter italic text-white flex items-center gap-2">
        <DatabaseZap className="w-5 h-5 text-amber-500" />
        Data Migration Tool
      </h3>
      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed max-w-xl">
        Run this one-off utility to retroactively apply the Solon Studio ID to all existing database records to align with the new multi-studio architecture.
      </p>
      
      <div className="text-xs font-mono text-slate-300 p-4 bg-slate-950 rounded-xl border border-slate-800">
        TARGET_STUDIO_ID: <span className="text-amber-500">{TARGET_STUDIO_ID}</span>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <Button 
          onClick={runMigration} 
          disabled={status === 'Migrating...'}
          className="h-10 rounded-xl px-6 bg-amber-600 hover:bg-amber-700 text-white font-black uppercase tracking-widest text-[10px]"
        >
          {status === 'Migrating...' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Run Migration
        </Button>
        <div className="flex flex-col">
          <span className={`text-sm font-black uppercase tracking-widest ${status === 'Completed successfully' ? 'text-emerald-500' : status === 'Error' ? 'text-red-500' : 'text-slate-500'}`}>
            {status}
          </span>
          {errorMessage && <span className="text-[10px] text-red-400 font-bold max-w-md">{errorMessage}</span>}
        </div>
      </div>
    </div>
  );
}
