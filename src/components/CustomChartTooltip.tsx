import React from 'react';

/**
 * Reusable Custom Tooltip for Recharts styled with MSF brand colors.
 * Usage:
 * <Tooltip content={<CustomChartTooltip />} />
 */
export function CustomChartTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0A2E46] border border-[#114B72] shadow-2xl p-4 flex flex-col gap-2 rounded-xl min-w-[140px]">
        <p className="font-black String-widest uppercase text-[#38BDF8] text-[10px] mb-1 leading-none">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex justify-between items-center gap-4">
            <span className="text-white text-xs font-bold">{entry.name}</span>
            <span className="text-[#F97316] text-xs font-black">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}
