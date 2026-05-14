import React, { useState } from 'react';
import { Filter, Loader2, AlertCircle, BarChart3, Activity, TrendingUp, Dumbbell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ActivityLevel } from '../data/occupational-matrix';
import { InsightsFilterState } from '../data/insights-logic';
import { StrengthGainsDemographicChart } from './StrengthGainsDemographicChart';
import { StrengthGainsMuscleGroupChart } from './StrengthGainsMuscleGroupChart';
import { DemographicRetentionChart } from './DemographicRetentionChart';
import { useInsightsData } from '../hooks/useInsightsData';
import { MaxStrengthLogo } from './MaxStrengthLogo';

export function InsightsDashboardView(props: any) {
  const [filters, setFilters] = useState<InsightsFilterState>({
    startDate: null,
    endDate: null,
    ageBrackets: [],
    genders: [],
    activityLevels: []
  });

  const { data, loading, error } = useInsightsData(filters);

  return (
    <div className="flex flex-col w-full h-full bg-[#0A2E46] overflow-x-hidden p-4 md:p-8 space-y-6 safe-area-pt pb-24">
      {/* Header & Filter Hub */}
      <div className="shrink-0 flex flex-col gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black italic uppercase tracking-tighter text-white leading-none">
            Clinical Insights
          </h1>
          <p className="text-xs md:text-sm font-bold uppercase tracking-widest text-[#38BDF8] mt-2">
            Demographic & Efficacy Analytics
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-700 p-4 rounded-2xl shadow-xl flex flex-col md:flex-row gap-4 items-center w-full">
          <div className="flex items-center gap-2 text-slate-400 font-bold uppercase tracking-widest text-xs shrink-0 md:mr-2">
            <Filter className="w-4 h-4" />
            Filters
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
            <select 
              defaultValue="30days"
              className="bg-slate-800 border border-slate-700 text-white font-bold h-10 md:h-12 text-xs md:text-sm rounded-xl px-3 outline-none focus:ring-2 focus:ring-[#38BDF8] w-full"
            >
              <option value="30days">Last 30 Days</option>
              <option value="90days">Last 90 Days</option>
              <option value="ytd">Year to Date</option>
              <option value="all">All Time</option>
            </select>

            <select 
              defaultValue="all"
              onChange={(e) => setFilters(prev => ({
                ...prev,
                ageBrackets: e.target.value === 'all' ? [] : [{ min: parseInt(e.target.value.split('-')[0]) || 56, max: parseInt(e.target.value.split('-')[1]) || 120, label: e.target.value }]
              }))}
              className="bg-slate-800 border border-slate-700 text-white font-bold h-10 md:h-12 text-xs md:text-sm rounded-xl px-3 outline-none focus:ring-2 focus:ring-[#38BDF8] w-full"
            >
              <option value="all">All Ages</option>
              <option value="18-35">18 - 35</option>
              <option value="36-55">36 - 55</option>
              <option value="56+">56+</option>
            </select>

            <select 
              defaultValue="all"
              onChange={(e) => setFilters(prev => ({
                ...prev,
                genders: e.target.value === 'all' ? [] : [e.target.value as any]
              }))}
              className="bg-slate-800 border border-slate-700 text-white font-bold h-10 md:h-12 text-xs md:text-sm rounded-xl px-3 outline-none focus:ring-2 focus:ring-[#38BDF8] w-full"
            >
              <option value="all">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>

            <select 
              defaultValue="all" 
              onChange={(e) => setFilters(prev => ({ 
                ...prev, 
                activityLevels: e.target.value === 'all' ? [] : [e.target.value as ActivityLevel] 
              }))}
              className="bg-slate-800 border border-slate-700 text-white font-bold h-10 md:h-12 text-xs md:text-sm rounded-xl px-3 outline-none focus:ring-2 focus:ring-[#38BDF8] w-full"
            >
              <option value="all">All Activity Levels</option>
              <option value="Highly Sedentary">Highly Sedentary</option>
              <option value="Sedentary">Sedentary</option>
              <option value="Moderate / Mixed">Moderate</option>
              <option value="Active">Active</option>
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 content-start pb-12 animate-pulse mb-8">
          {[1, 2, 3].map(i => (
             <Card key={i} className="bg-[#F8F9FA]/60 border-slate-200/30 rounded-3xl shadow-lg flex flex-col h-[320px]">
               <CardHeader className="border-b border-slate-200/50 p-4 shrink-0 flex flex-row items-center justify-between">
                 <div>
                   <div className="h-4 bg-slate-300 rounded w-48 mb-2"></div>
                   <div className="h-3 bg-slate-200 rounded w-32"></div>
                 </div>
                 <div className="w-6 h-6 animate-spin opacity-50">
                   <MaxStrengthLogo />
                 </div>
               </CardHeader>
               <CardContent className="flex-1 p-4 flex flex-col items-center justify-center text-center">
                 <div className="flex flex-col items-center opacity-50">
                   <BarChart3 className="w-12 h-12 text-slate-400 mb-3" />
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Processing Data...</p>
                 </div>
               </CardContent>
             </Card>
          ))}
        </div>
      )}

      {error && (
        <div className="flex-1 flex flex-col items-center justify-center text-red-400">
           <AlertCircle className="w-10 h-10 mb-3 text-red-500" />
           <p className="text-xs font-black uppercase tracking-widest">Failed to load insights</p>
           <p className="text-[10px] font-bold text-slate-500 mt-1">{error.message}</p>
        </div>
      )}

      {/* Chart Grid - redesigned for iPad & responsive sizing */}
      {!loading && !error && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 content-start pb-12">
          
          {/* Card 1: Strength Gains by Demographics */}
          <Card className="bg-[#F8F9FA] border-slate-200/50 rounded-3xl shadow-lg flex flex-col lg:col-span-2">
            <CardHeader className="border-b border-slate-200 p-4 shrink-0">
              <CardTitle className="text-lg font-black uppercase text-slate-800 tracking-tight flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#38BDF8]" />
                Strength Gains by Demographic
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Average percent increase across cohorts & health conditions
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-2 sm:p-4">
              <div className="w-full h-[400px]">
                <StrengthGainsDemographicChart data={data?.strengthGainsByDemographic} />
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Average Strength Increase by Muscle Group */}
          <Card className="bg-[#F8F9FA] border-slate-200/50 rounded-3xl shadow-lg flex flex-col h-[360px]">
            <CardHeader className="border-b border-slate-200 p-4 shrink-0">
              <CardTitle className="text-lg font-black uppercase text-slate-800 tracking-tight flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-[#F06C22]" />
                Muscle Group Efficacy
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Average percent increase per major segment
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-2 sm:p-4">
              <div className="w-full h-[240px]">
                 <StrengthGainsMuscleGroupChart data={data?.strengthGainsByMuscleGroup} />
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Retention */}
          <Card className="bg-[#F8F9FA] border-slate-200/50 rounded-3xl shadow-lg flex flex-col h-[360px]">
            <CardHeader className="border-b border-slate-200 p-4 shrink-0">
              <CardTitle className="text-lg font-black uppercase text-slate-800 tracking-tight flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#10B981]" />
                Demographic Retention
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-[#10B981]">
                Average LTV / Lifespan in Months
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-2 sm:p-4">
               <div className="w-full h-[240px]">
                  <DemographicRetentionChart data={data?.retention} />
               </div>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}
