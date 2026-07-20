import React, { useId } from 'react';
import { Lock, Hourglass, XCircle } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '../../lib/utils';

export type CrossTrainAccessGateProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  clientHomeStudioName: string;
  currentStudioName: string;
  existingRequestStatus?: 'none' | 'pending' | 'denied';
  onRequest: () => void;
  onBack: () => void;
};

/**
 * CrossTrainAccessGate
 *
 * A disruptive overlay that blocks access to a foreign-home client's profile
 * until cross-train access is requested and granted.
 */
export default function CrossTrainAccessGate({
  open,
  onOpenChange,
  clientName,
  clientHomeStudioName,
  currentStudioName, // Reserved for future orientating copy if needed
  existingRequestStatus = 'none',
  onRequest,
  onBack,
}: CrossTrainAccessGateProps): React.ReactElement | null {
  const headlineId = useId();

  const handleBack = () => {
    onBack();
    onOpenChange(false);
  };

  let primaryLabel = 'Request Cross-Train Access';
  let primaryDisabled = false;
  let primaryAction: (() => void) | undefined = onRequest;

  if (existingRequestStatus === 'pending') {
    primaryLabel = 'Request submitted — awaiting review';
    primaryDisabled = true;
    primaryAction = undefined;
  } else if (existingRequestStatus === 'denied') {
    primaryLabel = 'Submit New Request';
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-labelledby={headlineId}
        className="max-w-lg w-[92vw] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center text-center gap-4 sm:gap-5 shadow-2xl overflow-hidden"
      >
        <div 
          className="h-14 w-14 sm:h-16 sm:w-16 flex rounded-2xl items-center justify-center bg-amber-500/10 border border-amber-500/30 text-[#F06C22] shrink-0"
        >
          <Lock className="w-7 h-7 text-[#F06C22]" aria-hidden="true" />
        </div>

        <h2 
          id={headlineId} 
          className="font-display italic uppercase font-extrabold text-2xl sm:text-3xl tracking-tight text-slate-900 dark:text-white"
        >
          FOREIGN PROFILE
        </h2>
        
        <p className="sr-only">
          Access denied. {clientName} belongs to {clientHomeStudioName}. Request access or return to roster.
        </p>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-md leading-relaxed font-medium">
          {clientName}'s home studio is <span className="font-bold text-slate-900 dark:text-white">{clientHomeStudioName}</span>. Cross-train data access is required to view their clinical history.
        </p>

        {existingRequestStatus === 'pending' && (
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
            <Hourglass className="w-4 h-4 text-amber-500" aria-hidden="true" />
            <span>Awaiting {clientHomeStudioName} leadership review.</span>
          </div>
        )}

        {existingRequestStatus === 'denied' && (
          <div className="inline-flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
            <XCircle className="w-4 h-4 text-rose-500" aria-hidden="true" />
            <span>Previous request denied. You may submit a new one.</span>
          </div>
        )}

        <div className="w-full max-w-sm flex flex-col gap-2.5 mt-2">
          <Button 
            onClick={primaryAction} 
            disabled={primaryDisabled}
            className="w-full bg-[#F06C22] hover:bg-[#F06C22]/90 text-white font-black uppercase text-xs tracking-wider h-11 rounded-xl cursor-pointer whitespace-normal py-2.5"
          >
            {primaryLabel}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleBack} 
            autoFocus
            className="w-full border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold uppercase text-xs tracking-wider h-11 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Back to Roster
          </Button>
        </div>

        <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
          Requests are reviewed by the {clientHomeStudioName} Studio Leader.
        </p>
      </DialogContent>
    </Dialog>
  );
}
