import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bug, Clock } from 'lucide-react';

export function AdminBugReports() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const q = query(collection(db, 'bug_reports'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching reports:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-bold uppercase text-xs">Loading reports...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-200 dark:border-rose-500/30">
          <Bug className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black uppercase italic tracking-tight text-slate-900 dark:text-white">Bug Reports</h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Issues submitted by users</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {reports.length === 0 ? (
          <Card className="rounded-[32px] border-slate-200 dark:border-slate-800 border-dashed bg-slate-50/50 dark:bg-slate-900/50">
            <CardContent className="p-12 text-center">
              <Bug className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
              <p className="text-xs uppercase font-bold text-slate-500 tracking-widest">No bug reports found.</p>
            </CardContent>
          </Card>
        ) : (
          reports.map(report => (
            <Card key={report.id} className="rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
               <CardHeader className="pb-2">
                 <div className="flex items-center gap-2 justify-between">
                   <CardTitle className="text-sm font-bold uppercase tracking-tight flex items-center gap-2">
                      <span className="w-2 rounded-full h-2 bg-rose-500" />
                      {report.issueType || 'General Bug'}
                   </CardTitle>
                   <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                     <Clock className="w-3 h-3" />
                     {report.createdAt?.toDate?.()?.toLocaleString() || 'Unknown Time'}
                   </span>
                 </div>
                 <CardDescription className="text-[10px] uppercase tracking-widest font-bold">
                   Submitted by: <span className="text-sky-500">{report.userEmail || report.userName || 'Unknown User'}</span> 
                   {report.studioName && <span className="ml-2 text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-100 dark:border-amber-900/60">{report.studioName}</span>}
                 </CardDescription>
               </CardHeader>
               <CardContent className="space-y-4 pt-2">
                  <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{report.description}</p>
                  </div>
                  
                  {(report.browser || report.os) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[9px] uppercase tracking-widest bg-white dark:bg-slate-900 border-slate-200">{report.platform || 'Platform: Unknown'}</Badge>
                      <Badge variant="outline" className="text-[9px] uppercase tracking-widest bg-white dark:bg-slate-900 border-slate-200">{report.browser || 'Browser: Unknown'}</Badge>
                    </div>
                  )}
               </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
