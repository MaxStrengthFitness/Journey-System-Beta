import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl">
        <p className="text-[#F06C22] font-black uppercase tracking-tight mb-2 border-b border-slate-700 pb-1 text-xs">{label}</p>
        <div className="flex items-center justify-between gap-4 py-0.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
            Strength Increase
          </span>
          <span className="text-xs font-black text-white">
            +{payload[0].value}%
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export function StrengthGainsMuscleGroupChart({ data }: { data?: any[] }) {
  if (!data || data.length === 0) {
    return <div className="text-slate-400 text-xs text-center flex items-center justify-center h-full font-bold uppercase tracking-widest">No Data Available</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 20, right: 20, left: 20, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={true} vertical={false} />
        <XAxis 
          type="number"
          stroke="#64748B" 
          tick={{ fill: '#64748B', fontWeight: 700, fontSize: 10 }} 
          axisLine={false} 
          tickLine={false}
          tickFormatter={(value) => `+${value}%`}
        />
        <YAxis 
          dataKey="muscleGroup" 
          type="category"
          stroke="#64748B" 
          tick={{ fill: '#64748B', fontWeight: 800, fontSize: 10 }} 
          tickMargin={10} 
          axisLine={{ stroke: '#CBD5E1' }}
          width={100}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F1F5F9' }} />
        <Bar dataKey="averagePercentGain" fill="#F06C22" radius={[0, 4, 4, 0]} barSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}
