import React, { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '../../lib/utils';

export type RevokeCrossTrainAccessButtonProps = {
  clientName: string;
  studioName: string;
  onRevoke: () => void | Promise<void>;
  className?: string;
};

type Mode = 'idle' | 'confirming' | 'submitting';

/**
 * RevokeCrossTrainAccessButton
 * 
 * Two-stage inline confirm for Admin/Founder revocation of permanent cross-train access.
 * Pure presentation + callback; parent owns the Firestore delete and the role gate.
 */
export default function RevokeCrossTrainAccessButton({
  clientName,
  studioName,
  onRevoke,
  className,
}: RevokeCrossTrainAccessButtonProps): React.ReactElement {
  const [mode, setMode] = useState<Mode>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleRevokeClick = async () => {
    setMode('submitting');
    setError(null);
    try {
      await onRevoke();
      setMode('idle');
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'An error occurred during revocation');
      setMode('idle');
    }
  };

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      {mode === 'idle' && (
        <Button
          variant="outline"
          className="text-red border-red/30 hover:bg-red/10 transition-colors"
          onClick={() => {
            setMode('confirming');
            setError(null);
          }}
        >
          Revoke Cross-Train Access
        </Button>
      )}

      {(mode === 'confirming' || mode === 'submitting') && (
        <div className="flex flex-col gap-2 p-3 border border-red/20 bg-red/5 rounded-lg max-w-sm">
          <div 
            className="text-sm font-medium text-foreground/80"
            role="status"
            aria-live="polite"
          >
            Revoke {clientName}'s access at {studioName}? They will need a new approval to train here again.
          </div>
          
          <div className="flex items-center gap-2 mt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={mode === 'submitting'}
              onClick={() => setMode('idle')}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={mode === 'submitting'}
              onClick={handleRevokeClick}
              aria-label={`Confirm revocation of cross-train access for ${clientName}`}
              className="bg-red text-white hover:bg-red/90"
            >
              {mode === 'submitting' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Confirming...
                </>
              ) : (
                'Confirm Revocation'
              )}
            </Button>
          </div>
        </div>
      )}

      {error && mode === 'idle' && (
        <div className="flex items-center gap-1.5 text-xs text-red mt-1">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
