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
        className="max-w-2xl w-[92vw] min-h-[420px] flex flex-col items-center justify-center text-center gap-6 p-8 sm:p-12 border-0 shadow-2xl"
      >
        <div 
          className="h-16 w-16 flex rounded-full items-center justify-center bg-amber dark:bg-yellow shrink-0"
        >
          <Lock className="size-8 text-ink-l1" aria-hidden="true" />
        </div>

        <h2 
          id={headlineId} 
          className="font-display italic uppercase text-3xl sm:text-4xl tracking-tight text-foreground"
        >
          FOREIGN PROFILE
        </h2>
        
        <p className="sr-only">
          Access denied. {clientName} belongs to {clientHomeStudioName}. Request access or return to roster.
        </p>

        <p className="text-base text-muted-foreground max-w-md leading-relaxed">
          {clientName}'s home studio is {clientHomeStudioName}. Cross-train data access is required to view their clinical history.
        </p>

        {existingRequestStatus === 'pending' && (
          <div className="inline-flex items-center gap-2 bg-cyan/10 border border-cyan/40 text-ink-l1 dark:text-ink-d1 px-3 py-1.5 rounded-full text-sm font-medium">
            <Hourglass className="size-4 text-ink-l1 dark:text-cyan" aria-hidden="true" />
            <span>Awaiting {clientHomeStudioName} leadership review.</span>
          </div>
        )}

        {existingRequestStatus === 'denied' && (
          <div className="inline-flex items-center gap-2 bg-red/10 border border-red/40 text-ink-l1 dark:text-ink-d1 px-3 py-1.5 rounded-full text-sm font-medium">
            <XCircle className="size-4 text-red" aria-hidden="true" />
            <span>Previous request denied. You may submit a new one.</span>
          </div>
        )}

        <div className="w-full max-w-md flex flex-col sm:flex-row-reverse gap-3 mt-2">
          <Button 
            onClick={primaryAction} 
            disabled={primaryDisabled}
            className="w-full"
          >
            {primaryLabel}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleBack} 
            autoFocus
            className="w-full"
          >
            Back to Roster
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Requests are reviewed by the {clientHomeStudioName} Studio Leader.
        </p>
      </DialogContent>
    </Dialog>
  );
}
