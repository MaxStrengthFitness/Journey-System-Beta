import React, { useState, useEffect, useId } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { db } from '../../firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type CrossTrainRequestModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetClientId: string;
  targetClientName: string;
  targetStudioId: string;
  targetStudioName: string;
  requestingTrainerId: string;
  onSubmitted?: (requestId: string) => void;
};

/**
 * CrossTrainRequestModal
 *
 * Allows a trainer to request access to clinical data for a foreign-home client.
 * Writes a pending request to Firestore for Studio Leader approval.
 */
export default function CrossTrainRequestModal({
  open,
  onOpenChange,
  targetClientId,
  targetClientName,
  targetStudioId,
  targetStudioName,
  requestingTrainerId,
  onSubmitted,
}: CrossTrainRequestModalProps): React.ReactElement {
  const [mode, setMode] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const textareaId = useId();

  // Reset internal state whenever the modal is opened
  useEffect(() => {
    if (open) {
      setMode('idle');
      setReason('');
      setErrorMsg(null);
    }
  }, [open]);

  // Block closing the dialog while we're submitting to Firestore
  const handleOpenChange = (newOpen: boolean) => {
    if (mode === 'submitting') return;
    onOpenChange(newOpen);
  };

  const handleSubmit = async () => {
    setMode('submitting');
    setErrorMsg(null);

    try {
      const docRef = await addDoc(collection(db, 'crossTrainRequests'), {
        requestingTrainerId,
        targetClientId,
        targetStudioId,
        reason: reason.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      onSubmitted?.(docRef.id);
      setMode('success');
    } catch (err: unknown) {
      setMode('error');
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('An unexpected error occurred while submitting.');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        {mode === 'success' ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <CheckCircle className="size-12 text-green mb-4" aria-hidden="true" />
            <h2
              className="text-lg font-semibold tracking-tight text-foreground"
              role="status"
              aria-live="polite"
            >
              Submitted — you'll get a notification when {targetStudioName} reviews it.
            </h2>
            <p className="text-sm text-muted-foreground mt-2 mb-6">
              Until then, you can keep working with your own home-studio clients.
            </p>
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Cross-Train Access Request</DialogTitle>
              <DialogDescription>
                {targetClientName}'s home studio is {targetStudioName}. Submit this
                request to {targetStudioName}'s leadership for review.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={textareaId}>Reason (optional)</Label>
                <Textarea
                  id={textareaId}
                  rows={3}
                  placeholder="e.g., client is here for a one-time visit while traveling."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={mode === 'submitting'}
                  className="resize-none"
                />
                <span className="text-[13px] text-muted-foreground">
                  Helps leadership prioritize.
                </span>
              </div>

              {mode === 'error' && errorMsg && (
                <div className="flex items-center gap-2 bg-red/10 border border-red/40 text-red text-sm px-3 py-2 rounded-md">
                  <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mode === 'submitting'}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={mode === 'submitting'}>
                {mode === 'submitting' && (
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                )}
                Submit Request
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
