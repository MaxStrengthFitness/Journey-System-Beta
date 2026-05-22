import React, { ReactNode } from 'react';
import { cn } from '../lib/utils';
import { getMachineStyle } from '../lib/machine-colors';
import { TriangleAlert, Wrench } from 'lucide-react';

interface ClinicalCardProps {
  children: ReactNode;
  machineName: string;
  hasMaintenanceNote?: boolean;
  isRedAlert?: boolean;
  className?: string;
}

export function ClinicalCard({
  children,
  machineName,
  hasMaintenanceNote = false,
  isRedAlert = false,
  className,
}: ClinicalCardProps) {
  const baseColorStyles = getMachineStyle(machineName);
  const borderColor = baseColorStyles?.border || 'border-slate-200';

  return (
    <div
      className={cn(
        "flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-sm overflow-hidden h-full transition-all group border-y lg:border border-l-4",
        borderColor,
        className
      )}
    >
      {hasMaintenanceNote && (
        <div className={cn(
          "px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest",
          isRedAlert ? "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400" : "bg-slate-50 text-slate-500 dark:bg-slate-900/20 dark:text-slate-400"
        )}>
          {isRedAlert ? <TriangleAlert className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
          {isRedAlert ? "Red Alert - Do Not Use" : "Not Performed"}
        </div>
      )}
      {children}
    </div>
  );
}
