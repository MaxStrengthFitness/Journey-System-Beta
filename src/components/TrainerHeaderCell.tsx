import React from "react";

interface TrainerHeaderCellProps extends React.HTMLAttributes<HTMLDivElement> {
  key?: string | number;
  initials: string;
  name: string;
  sessionCount: number;
}

export function TrainerHeaderCell({
  initials,
  name,
  sessionCount,
  ...props
}: TrainerHeaderCellProps) {
  return (
    <div className="flex flex-col items-center justify-center py-2 px-1" {...props}>
      <div className="w-8 h-8 rounded-full border border-div-l mb-1.5 flex items-center justify-center bg-bg-dark text-white font-display italic text-sm">
        {initials}
      </div>
      <span className="font-display italic text-ink-l1 uppercase text-sm leading-none whitespace-nowrap">
        {name}
      </span>
      <span className="font-display italic text-ink-l4 text-[11px] uppercase tabular-nums tracking-wider mt-0.5">
        {sessionCount} SESS
      </span>
    </div>
  );
}
