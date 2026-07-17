import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl">
        <p className="text-white font-bold uppercase tracking-tight mb-2 border-b border-slate-700 pb-2">{label}</p>
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-xs font-bold uppercase tracking-widest text-[#F06C22]">
            Avg Gain
          </span>
          <span className="text-sm font-bold text-white">
            +{payload[0].value}%
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export function MachineEfficacyChart({ data }: { data?: any[] }) {
  if (!data || data.length === 0) {
    return <div className="text-slate-400 text-xs text-center flex items-center justify-center h-full font-bold uppercase tracking-widest">No Data Available</div>;
  }

  // Use up to top 8 machines to prevent crowding
  const chartData = data.slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" vertical={false} />
        <XAxis 
          dataKey="machineName" 
          stroke="#64748B" 
          tick={{ fill: '#64748B', fontWeight: 800, fontSize: 10 }} 
          tickMargin={10} 
          axisLine={{ stroke: '#CBD5E1' }}
          tickFormatter={(val) => {
             // abbreviate if too long
             if (val.length > 10) return val.substring(0, 10) + '...';
             return val;
          }}
        />
        <YAxis 
          stroke="#64748B" 
          tick={{ fill: '#64748B', fontWeight: 700, fontSize: 12 }} 
          axisLine={false} 
          tickLine={false}
          tickFormatter={(value) => `${value}%`}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F1F5F9' }} />
        <Bar dataKey="percentIncreaseOperationalLoad" radius={[6, 6, 0, 0]} barSize={40}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#115E8D' : '#0A2E46'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
