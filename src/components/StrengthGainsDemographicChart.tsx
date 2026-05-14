import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl">
        <p className="text-white font-black uppercase tracking-tight mb-1 border-b border-slate-700 pb-1 text-xs">{label}</p>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">{data.segment}</p>
        <div className="flex items-center justify-between gap-4 py-0.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#38BDF8]">
            {payload[0].name}
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

export function StrengthGainsDemographicChart({ data }: { data?: any[] }) {
  if (!data || data.length === 0) {
    return <div className="text-slate-400 text-xs text-center flex items-center justify-center h-full font-bold uppercase tracking-widest">No Data Available</div>;
  }

  const chartData = data.map(d => ({
    name: d.label,
    gain: d.averagePercentGain,
    segment: d.segment
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 20, right: 30, left: 30, bottom: 0 }}
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
          dataKey="name" 
          type="category"
          stroke="#64748B" 
          tick={{ fill: '#64748B', fontWeight: 800, fontSize: 10 }} 
          tickMargin={10} 
          axisLine={{ stroke: '#CBD5E1' }}
          width={120}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F1F5F9' }} />
        <Bar dataKey="gain" fill="#38BDF8" radius={[0, 4, 4, 0]} name="Avg Gain" barSize={12} />
      </BarChart>
    </ResponsiveContainer>
  );
}
