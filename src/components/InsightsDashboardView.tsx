import React, { useState } from 'react';
import { Filter, Loader2, AlertCircle, BarChart3, Activity, TrendingUp, Dumbbell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ActivityLevel } from '../data/occupational-matrix';
import { InsightsFilterState } from '../data/insights-logic';
import { StrengthGainsDemographicChart } from './StrengthGainsDemographicChart';
import { StrengthGainsMuscleGroupChart } from './StrengthGainsMuscleGroupChart';
import { MachineEfficacyChart } from './MachineEfficacyChart';
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
    <div className="flex flex-col w-full h-full bg-bg-dark overflow-x-hidden p-4 md:p-8 space-y-6 safe-area-pt pb-24">
      {/* Header & Filter Hub */}
      <div className="shrink-0 flex flex-col gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-display italic font-bold uppercase tracking-tighter text-white leading-none">
            Clinical Insights
          </h1>
          <p className="text-xs md:text-sm font-bold uppercase tracking-widest text-cyan mt-2">
            Demographic & Efficacy Analytics
          </p>
        </div>

        <div className="bg-bg-dark border border-div-d p-4 rounded-2xl shadow-xl flex flex-col md:flex-row gap-4 items-center w-full">
          <div className="flex items-center gap-2 text-ink-d2 font-bold uppercase tracking-widest text-xs shrink-0 md:mr-2">
            <Filter className="w-4 h-4" />
            Filters
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
            <select 
              defaultValue="30days"
              className="bg-surface-1 border border-div-d text-white font-bold h-10 md:h-12 text-xs md:text-sm rounded-xl px-3 outline-none focus:ring-2 focus:ring-cyan w-full"
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
              className="bg-surface-1 border border-div-d text-white font-bold h-10 md:h-12 text-xs md:text-sm rounded-xl px-3 outline-none focus:ring-2 focus:ring-cyan w-full"
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
              className="bg-surface-1 border border-div-d text-white font-bold h-10 md:h-12 text-xs md:text-sm rounded-xl px-3 outline-none focus:ring-2 focus:ring-cyan w-full"
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
              className="bg-surface-1 border border-div-d text-white font-bold h-10 md:h-12 text-xs md:text-sm rounded-xl px-3 outline-none focus:ring-2 focus:ring-cyan w-full"
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
             <Card key={i} className="bg-bg-l-card border-div-l rounded-2xl shadow-lg flex flex-col h-[320px]">
               <CardHeader className="border-b border-div-l p-4 shrink-0 flex flex-row items-center justify-between">
                 <div>
                   <div className="h-4 bg-div-l rounded w-48 mb-2"></div>
                   <div className="h-3 bg-div-l rounded w-32"></div>
                 </div>
                 <div className="w-6 h-6 animate-spin opacity-50">
                   <MaxStrengthLogo />
                 </div>
               </CardHeader>
               <CardContent className="flex-1 p-4 flex flex-col items-center justify-center text-center">
                 <div className="flex flex-col items-center opacity-50">
                   <BarChart3 className="w-12 h-12 text-ink-d2 mb-3" />
                   <p className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d3">Processing Data...</p>
                 </div>
               </CardContent>
             </Card>
          ))}
        </div>
      )}

      {error && (
        <div className="flex-1 flex flex-col items-center justify-center text-red-400">
           <AlertCircle className="w-10 h-10 mb-3 text-red-500" />
           <p className="text-xs font-bold uppercase tracking-widest">Failed to load insights</p>
           <p className="text-[11px] font-medium text-ink-d3 mt-1">{error.message}</p>
        </div>
      )}

      {/* Chart Grid - redesigned for iPad & responsive sizing */}
      {!loading && !error && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 content-start pb-12">
          
          {/* Card 1: Strength Gains by Demographics */}
          <Card className="bg-bg-l-card border-div-l rounded-2xl shadow-lg flex flex-col lg:col-span-2">
            <CardHeader className="border-b border-div-l p-4 shrink-0">
              <CardTitle className="text-lg font-bold uppercase text-ink-l1 tracking-tight flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan" />
                Strength Gains by Demographic
              </CardTitle>
              <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d3">
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
          <Card className="bg-bg-l-card border-div-l rounded-2xl shadow-lg flex flex-col h-[360px]">
            <CardHeader className="border-b border-div-l p-4 shrink-0">
              <CardTitle className="text-lg font-bold uppercase text-ink-l1 tracking-tight flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-cta" />
                Muscle Group Efficacy
              </CardTitle>
              <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-d3">
                Average percent increase per major segment
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-2 sm:p-4">
              <div className="w-full h-[240px]">
                 <StrengthGainsMuscleGroupChart data={data?.strengthGainsByMuscleGroup} />
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Machine Efficacy */}
          <Card className="bg-bg-l-card border-div-l rounded-2xl shadow-lg flex flex-col h-[360px]">
            <CardHeader className="border-b border-div-l p-4 shrink-0">
              <CardTitle className="text-lg font-bold uppercase text-ink-l1 tracking-tight flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green" />
                Machine Strength Gains
              </CardTitle>
              <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-green">
                Average Strength Gain % Across All Clients
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-2 sm:p-4">
               <div className="w-full h-[240px]">
                  <MachineEfficacyChart data={data?.machineEfficacy} />
               </div>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}
