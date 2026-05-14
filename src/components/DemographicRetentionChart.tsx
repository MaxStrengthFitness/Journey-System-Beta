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
    return (
      <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl">
        <p className="text-white font-black uppercase tracking-tight mb-2 border-b border-slate-700 pb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 py-1">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: entry.color }}>
              {entry.name}
            </span>
            <span className="text-sm font-black text-white">
              {entry.value} <span className="text-[10px] text-slate-400">mos</span>
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function DemographicRetentionChart({ data }: { data?: any[] }) {
  if (!data || data.length === 0) {
    return <div className="text-slate-400 text-xs text-center flex items-center justify-center h-full font-bold uppercase tracking-widest">No Data Available</div>;
  }

  const chartData = data;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" vertical={false} />
        <XAxis 
          dataKey="ageBracket" 
          stroke="#64748B" 
          tick={{ fill: '#64748B', fontWeight: 800, fontSize: 12 }} 
          tickMargin={10} 
          axisLine={{ stroke: '#CBD5E1' }}
        />
        <YAxis 
          stroke="#64748B" 
          tick={{ fill: '#64748B', fontWeight: 700, fontSize: 12 }} 
          axisLine={false} 
          tickLine={false}
          tickFormatter={(value) => `${value}m`}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F1F5F9' }} />
        <Legend 
          wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 'bold', color: '#64748B' }}
          iconType="circle"
        />
        <Bar dataKey="Corporate & Tech" fill="#115E8D" radius={[6, 6, 0, 0]} barSize={30} />
        <Bar dataKey="Healthcare" fill="#0A2E46" radius={[6, 6, 0, 0]} barSize={30} />
        <Bar dataKey="Manual Labor" fill="#F97316" radius={[6, 6, 0, 0]} barSize={30} />
      </BarChart>
    </ResponsiveContainer>
  );
}
