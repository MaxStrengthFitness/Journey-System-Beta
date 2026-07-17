import React, { useState, useId } from 'react';
import { MessageSquare, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '../../lib/utils';

export type CrossTrainApprovalRequest = {
  id: string;
  requestingTrainerName: string;
  requestingTrainerInitials: string;
  requestingTrainerBrandColor?: string;
  targetClientName: string;
  targetStudioName: string;
  reason: string;
  createdAt: Date;
};

export type CrossTrainApprovalCardProps = {
  request: CrossTrainApprovalRequest;
  onApprove: () => void | Promise<void>;
  onDeny: (reason?: string) => void | Promise<void>;
  className?: string;
};

function relativeTime(date: Date): string {
  const ms = Math.max(0, Date.now() - date.getTime());
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (s < 60) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return date.toLocaleDateString();
}

/**
 * CrossTrainApprovalCard
 *
 * Represents a single pending cross-train request shown to a Studio Leader or Admin.
 */
export default function CrossTrainApprovalCard({
  request,
  onApprove,
  onDeny,
  className,
}: CrossTrainApprovalCardProps): React.ReactElement {
  const [mode, setMode] = useState<'idle' | 'denying' | 'submittingApprove' | 'submittingDeny'>('idle');
  const [denyReason, setDenyReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const textareaId = useId();

  const handleApprove = async () => {
    setMode('submittingApprove');
    setErrorMsg(null);
    try {
      await onApprove();
    } catch (err: unknown) {
      setMode('idle');
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('An unexpected error occurred while approving.');
      }
    }
  };

  const handleDenyClick = () => {
    setMode('denying');
    setErrorMsg(null);
  };

  const handleCancelDeny = () => {
    setMode('idle');
    setDenyReason('');
    setErrorMsg(null);
  };

  const handleConfirmDeny = async () => {
    setMode('submittingDeny');
    setErrorMsg(null);
    try {
      await onDeny(denyReason.trim() || undefined);
    } catch (err: unknown) {
      setMode('denying');
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('An unexpected error occurred while denying.');
      }
    }
  };

  const hasReason = request.reason.trim().length > 0;
  const isSubmitting = mode === 'submittingApprove' || mode === 'submittingDeny';

  return (
    <div
      className={cn(
        "flex w-full items-stretch overflow-hidden rounded-md border border-border/40 bg-card shadow-sm",
        className
      )}
      role="article"
      aria-label={`Cross-train request from ${request.requestingTrainerName} for ${request.targetClientName}`}
    >
      <div className="w-1 shrink-0 bg-cyan" aria-hidden="true" />

      <div className="flex flex-1 flex-col p-4">
        {/* Header Row */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              !request.requestingTrainerBrandColor && "bg-secondary"
            )}
            style={
              request.requestingTrainerBrandColor
                ? { backgroundColor: request.requestingTrainerBrandColor }
                : undefined
            }
            aria-hidden="true"
          >
            <span className="font-display italic uppercase text-sm text-white">
              {request.requestingTrainerInitials}
            </span>
          </div>

          <div className="flex flex-col">
            <div>
              <span className="font-medium text-foreground">
                {request.requestingTrainerName}
              </span>
              <span className="text-muted-foreground text-sm">
                {' '}requesting access · {relativeTime(request.createdAt)}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              For {request.targetClientName} at {request.targetStudioName}
            </span>
          </div>
        </div>

        {/* Reason Block */}
        {hasReason && (
          <div className="mt-3 flex items-start gap-2 border-l-2 border-border bg-muted/40 py-2 pl-3 pr-3 rounded-r-md">
            <MessageSquare className="size-3 mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm italic text-foreground leading-relaxed">
              {request.reason}
            </span>
          </div>
        )}

        {/* Error Message */}
        {errorMsg && (
          <div className="mt-3 flex items-start gap-2 rounded-md bg-red/10 border border-red/40 px-3 py-2 text-sm text-red">
            <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Actions Row */}
        <div className="mt-4 flex flex-col gap-3">
          {mode === 'denying' || mode === 'submittingDeny' ? (
            <div className="flex flex-col gap-3 rounded-md border border-border/50 p-3 bg-muted/20">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={textareaId}>Reason (optional)</Label>
                <Textarea
                  id={textareaId}
                  rows={2}
                  placeholder="Helps the requesting trainer understand the decision."
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  disabled={isSubmitting}
                  className="resize-none"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                <Button
                  variant="outline"
                  onClick={handleCancelDeny}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmDeny}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto bg-red text-white hover:bg-red/90"
                >
                  {mode === 'submittingDeny' && (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  )}
                  Confirm Denial
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 sm:items-center">
              <Button
                variant="outline"
                onClick={handleDenyClick}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                Deny
              </Button>
              <Button
                onClick={handleApprove}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                {mode === 'submittingApprove' && (
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                )}
                Approve — permanent access
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
