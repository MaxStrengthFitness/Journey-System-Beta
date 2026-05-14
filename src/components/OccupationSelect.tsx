import React, { useMemo } from 'react';
import { 
  Select, 
  SelectContent, 
  SelectGroup, 
  SelectItem, 
  SelectLabel, 
  SelectSeparator,
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { OCCUPATIONS, OccupationalProfile } from '../data/occupational-matrix';

export interface OccupationSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function OccupationSelect({ value, onChange, disabled }: OccupationSelectProps) {
  // Group occupations by category
  const groupedOccupations = useMemo(() => {
    return OCCUPATIONS.reduce((acc, occ) => {
      if (!acc[occ.category]) {
        acc[occ.category] = [];
      }
      acc[occ.category].push(occ);
      return acc;
    }, {} as Record<string, OccupationalProfile[]>);
  }, []);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-12 bg-white border border-slate-200 text-slate-900 focus:ring-[#F06C22] rounded-xl font-bold disabled:opacity-50 hover:bg-slate-50 transition-colors w-full shadow-sm">
        <SelectValue placeholder={disabled ? "N/A" : "Select Client Occupation..."} />
      </SelectTrigger>
      <SelectContent className="bg-slate-900 border-slate-700 rounded-xl max-h-[300px] shadow-2xl">
        {(Object.entries(groupedOccupations) as [string, OccupationalProfile[]][]).map(([category, occupations], idx, arr) => (
          <SelectGroup key={category}>
            <SelectLabel className="text-[10px] uppercase tracking-wider text-slate-500 font-bold py-2 px-3 sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
              {category}
            </SelectLabel>
            {occupations.map((occ) => (
              <SelectItem 
                key={occ.id} 
                value={occ.title} // Use title as value for simpler integration with existing data format
                className="font-medium text-slate-200 focus:bg-slate-800 focus:text-white cursor-pointer rounded-lg mx-1 py-2.5 text-sm transition-colors"
              >
                {occ.title}
              </SelectItem>
            ))}
            {idx < arr.length - 1 && <SelectSeparator className="bg-slate-800 my-1 mx-2" />}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

