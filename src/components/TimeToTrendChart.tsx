import React from 'react';
import {
  LineChart,
  Line,
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
        <p className="text-white font-black uppercase tracking-tight mb-2 border-b border-slate-700 pb-2">Session: {label}</p>
        <div className="flex flex-col gap-2">
          {payload.map((entry: any, index: number) => {
            if (entry.dataKey === 'milestone') return null; // Don't show baseline purely on tooltip
            return (
              <div key={index} className="flex items-center justify-between gap-6 py-0.5">
                <span className="text-xs font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: entry.color }}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  {entry.name}
                </span>
                <span className="text-sm font-black text-white">
                  {entry.value} <span className="text-[10px] text-slate-400">lbs</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

export function TimeToTrendChart({ data }: { data?: any[] }) {
  if (!data || data.length === 0) {
    return <div className="text-slate-400 text-xs text-center flex items-center justify-center h-full font-bold uppercase tracking-widest">No Data Available</div>;
  }

  const chartData = data;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={chartData}
        margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" vertical={false} />
        <XAxis 
          dataKey="session" 
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
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend 
          wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 'bold', color: '#64748B' }}
          iconType="circle"
        />
        {/* Plotting the Lines */}
        <Line 
          type="monotone" 
          dataKey="Sedentary" 
          name="Sedentary Desk" 
          stroke="#115E8D" 
          strokeWidth={4} 
          dot={{ r: 5, fill: '#115E8D', strokeWidth: 0 }} 
          activeDot={{ r: 8 }} 
        />
        <Line 
          type="monotone" 
          dataKey="Manual Labor" 
          stroke="#F97316" 
          strokeWidth={4} 
          dot={{ r: 5, fill: '#F97316', strokeWidth: 0 }} 
          activeDot={{ r: 8 }} 
        />
        <Line 
          type="monotone" 
          dataKey="Clinical" 
          name="Healthcare Clinical" 
          stroke="#0A2E46" 
          strokeWidth={4} 
          dot={{ r: 5, fill: '#0A2E46', strokeWidth: 0 }} 
          activeDot={{ r: 8 }} 
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
