import React, { useState } from 'react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '../../lib/utils';

export type DlqEntry = {
  id: string;
  messageId: string;
  eventType: string;
  firstSeenAt: Date;
  retryCount: number;
  lastError: string;
};

export type DeadLetterQueueViewProps = {
  entries: DlqEntry[];
  isLoading?: boolean;
  onRetry: (id: string) => void | Promise<void>;
  onDismiss: (id: string) => void | Promise<void>;
  className?: string;
};

function relativeTime(date: Date): string {
  const diffSeconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * DeadLetterQueueView
 * 
 * Lists permanently-failed webhook events from the Mindbody DLQ.
 * Allows Admins to Retry or Dismiss events.
 */
export default function DeadLetterQueueView({
  entries,
  isLoading,
  onRetry,
  onDismiss,
  className,
}: DeadLetterQueueViewProps): React.ReactElement {
  const [inFlight, setInFlight] = useState<{ entryId: string; action: 'retry' | 'dismiss' } | null>(null);

  const handleAction = async (id: string, action: 'retry' | 'dismiss') => {
    setInFlight({ entryId: id, action });
    try {
      if (action === 'retry') {
        await onRetry(id);
      } else {
        await onDismiss(id);
      }
    } finally {
      setInFlight(null);
    }
  };

  if (isLoading) {
    return (
      <div 
        role="region"
        aria-label="Dead letter queue"
        className={cn("flex flex-col items-center justify-center p-12 gap-3", className)}
      >
        <Loader2 role="status" aria-live="polite" className="size-6 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground text-sm">Loading dead letter queue...</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div 
        role="region"
        aria-label="Dead letter queue"
        className={cn("flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 p-12 text-center", className)}
      >
        <CheckCircle className="size-8 text-green" aria-hidden="true" />
        <h3 className="font-display italic uppercase tracking-wide text-foreground mt-2">
          Queue empty
        </h3>
        <p className="text-sm text-muted-foreground">
          All webhook events processed successfully.
        </p>
      </div>
    );
  }

  return (
    <div 
      role="region"
      aria-label="Dead letter queue"
      className={cn("flex flex-col gap-3", className)}
    >
      {entries.map((entry) => {
        const isDismissing = inFlight?.entryId === entry.id && inFlight.action === 'dismiss';
        const isRetrying = inFlight?.entryId === entry.id && inFlight.action === 'retry';
        const isAnyActionInFlight = inFlight?.entryId === entry.id;

        return (
          <article
            key={entry.id}
            role="article"
            aria-label={`Failed event ${entry.eventType} from ${entry.messageId}`}
            className="flex flex-col bg-card border border-border/40 rounded-lg border-l-4 border-l-red p-4 shadow-sm"
          >
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">{entry.messageId}</span>
                <span className="text-muted-foreground text-xs">·</span>
                <span className="text-sm font-semibold text-foreground">{entry.eventType}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                First seen {relativeTime(entry.firstSeenAt)} · Retries: {entry.retryCount}
              </div>
            </div>

            <div className="mt-2 pl-3 border-l-2 border-red/40 bg-red/5 rounded-r-md py-2 pr-3 flex items-start gap-1.5">
              <AlertCircle className="size-3 text-red mt-1 shrink-0" aria-hidden="true" />
              <span className="text-sm text-foreground break-words">{entry.lastError}</span>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isAnyActionInFlight}
                onClick={() => handleAction(entry.id, 'dismiss')}
              >
                {isDismissing ? <Loader2 className="size-3 mr-2 animate-spin" aria-hidden="true" /> : null}
                Dismiss
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={isAnyActionInFlight}
                onClick={() => handleAction(entry.id, 'retry')}
              >
                {isRetrying ? <Loader2 className="size-3 mr-2 animate-spin" aria-hidden="true" /> : null}
                Retry
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
