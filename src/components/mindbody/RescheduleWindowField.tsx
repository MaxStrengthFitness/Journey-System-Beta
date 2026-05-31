import React, { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '../../lib/utils';

export type RescheduleWindowFieldProps = {
  value: number;
  onChange: (newValue: number) => void;
  studioName?: string;
  className?: string;
};

/**
 * RescheduleWindowField
 * 
 * Controlled numeric input for configuring the Mindbody reschedule window per studio.
 * Visualizes bounds constraints and out-of-bounds warnings for the Ledger webhook.
 */
export default function RescheduleWindowField({
  value,
  onChange,
  studioName,
  className,
}: RescheduleWindowFieldProps): React.ReactElement {
  const inputId = useId();
  const helperId = useId();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const parsed = parseInt(rawVal, 10);
    
    if (isNaN(parsed)) {
      onChange(0);
      return;
    }
    
    const clamped = Math.max(0, Math.min(60, parsed));
    onChange(clamped);
  };

  return (
    <div className={cn("flex flex-col items-start", className)}>
      <Label htmlFor={inputId} className="mb-1.5">
        Reschedule Window
      </Label>
      
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          type="number"
          min={0}
          max={60}
          step={1}
          value={value}
          onChange={handleInputChange}
          aria-describedby={helperId}
          className="w-20"
        />
        <span className="text-sm text-muted-foreground">minutes</span>
      </div>

      <p id={helperId} className="text-xs text-muted-foreground mt-1.5">
        How long after a cancellation a rebooking counts as a reschedule
        {studioName ? ` for ${studioName}` : ''}. Solon recommends 3, Willoughby 10.
      </p>

      {value === 0 && (
        <div 
          role="status" 
          aria-live="polite" 
          className="bg-amber/15 text-ink-l1 dark:text-ink-d1 px-2 py-1 rounded text-xs mt-2"
        >
          Disabled — all cancel-then-rebook pairs will log as separate events.
        </div>
      )}
      
      {value > 30 && (
        <div 
          role="status" 
          aria-live="polite" 
          className="bg-amber/15 text-ink-l1 dark:text-ink-d1 px-2 py-1 rounded text-xs mt-2"
        >
          Wide windows may incorrectly group unrelated bookings.
        </div>
      )}
    </div>
  );
}
