import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Activity, Webhook, Key, RefreshCw, Server, AlertCircle, CheckCircle2, ChevronLeft, Link2, Clock, Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Trainer, Studio } from '../types';

interface Props {
  authTrainer: Trainer | null;
  activeStudioId: string | null;
  onBack: () => void;
  studios: Studio[];
}

export function IntegrationsHubView({ authTrainer, activeStudioId, onBack, studios }: Props) {
  const [mindbodyKey, setMindbodyKey] = useState('************************');
  const [webhookUrl, setWebhookUrl] = useState('https://api.maxstrength.fitness/webhooks/mindbody');
  const [autoSync, setAutoSync] = useState(true);
  const [syncInterval, setSyncInterval] = useState('15');
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('success');
  
  const activeStudio = studios.find(s => s.id === activeStudioId);

  const handleTestConnection = () => {
    setConnectionStatus('testing');
    setIsTestLoading(true);
    setTimeout(() => {
      setConnectionStatus('success');
      setIsTestLoading(false);
    }, 1500);
  };

  const logs = [
    { id: 1, time: '10:45 AM', type: 'info', message: 'Auto-sync completed. 3 schedule updates found.' },
    { id: 2, time: '10:30 AM', type: 'info', message: 'Auto-sync completed. No changes.' },
    { id: 3, time: '10:15 AM', type: 'info', message: 'Auto-sync completed. No changes.' },
    { id: 4, time: '09:55 AM', type: 'warning', message: 'Webhook payload missing event_id. Ignored.' },
    { id: 5, time: '09:30 AM', type: 'success', message: 'Manual sync triggered by Admin.' },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-black/40 text-slate-900 dark:text-slate-100 p-4 lg:p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full space-y-6 lg:space-y-8 pb-32">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <Button
              variant="ghost"
              className="pl-0 text-slate-500 hover:text-slate-900 dark:hover:text-white mb-2"
              onClick={onBack}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Hub
            </Button>
            <h1 className="text-2xl lg:text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center">
              <Webhook className="w-6 h-6 mr-3 text-brand" />
              Integrations & Webhooks
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage Mindbody API connections, automated schedule syncing, and CRM data flows for {activeStudio?.name || 'your studio'}.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Systems Operational
            </div>
            <Button onClick={handleTestConnection} disabled={isTestLoading} variant="outline" className="h-9">
              <RefreshCw className={`w-4 h-4 mr-2 ${isTestLoading ? 'animate-spin' : ''}`} />
              Test Connection
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Config */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center">
                  <Server className="w-4 h-4 mr-2 text-brand" />
                  Primary CRM Connection
                </CardTitle>
                <CardDescription>Configure credentials to securely authenticate with the Mindbody Public API.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Mindbody Site ID</label>
                  <Input 
                    defaultValue={activeStudio?.mindbodySiteId || "Not configured"} 
                    disabled 
                    className="bg-slate-50 dark:bg-slate-900/50" 
                  />
                  <p className="text-[10px] text-slate-400">Site ID is managed in Studio Settings.</p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center">
                    <Key className="w-3 h-3 mr-1.5" />
                    API Key
                  </label>
                  <div className="flex gap-2">
                    <Input 
                      type="password" 
                      value={mindbodyKey} 
                      onChange={(e) => setMindbodyKey(e.target.value)} 
                      className="font-mono text-sm"
                    />
                    <Button variant="secondary" className="px-4">Update</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center">
                  <Link2 className="w-4 h-4 mr-2 text-indigo-500" />
                  Webhook Receivers
                </CardTitle>
                <CardDescription>Endpoints configured to listen for live schedule updates.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex justify-between">
                    <span>Schedule Endpoint</span>
                    <Badge variant="outline" className="text-[10px] py-0 h-4 bg-emerald-500/10 text-emerald-600 border-0">ACTIVE</Badge>
                  </label>
                  <div className="flex gap-2">
                    <Input 
                      value={webhookUrl} 
                      onChange={(e) => setWebhookUrl(e.target.value)} 
                      className="font-mono text-xs"
                    />
                    <Button variant="outline" className="px-4">Copy</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Sync Engine & Logs */}
          <div className="space-y-6">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950 border-t-4 border-t-brand">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center justify-between">
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-2 text-brand" />
                    Auto-Sync Engine
                  </div>
                  <Switch checked={autoSync} onCheckedChange={setAutoSync} />
                </CardTitle>
                <CardDescription>Poll the CRM for missing updates periodically.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Polling Interval</label>
                  <select 
                    value={syncInterval}
                    onChange={(e) => setSyncInterval(e.target.value)}
                    disabled={!autoSync}
                    className="w-full h-10 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-brand disabled:opacity-50"
                  >
                    <option value="5">Every 5 minutes</option>
                    <option value="15">Every 15 minutes (Recommended)</option>
                    <option value="30">Every 30 minutes</option>
                    <option value="60">Hourly</option>
                  </select>
                </div>
              </CardContent>
              <CardFooter className="bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 p-4">
                <div className="flex flex-col space-y-1 w-full">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Engine Status</div>
                  <div className="text-sm font-medium flex items-center text-emerald-600 dark:text-emerald-400">
                    <Activity className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
                    {autoSync ? 'Running (Next sync in 4m 12s)' : 'Paused manually'}
                  </div>
                </div>
              </CardFooter>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-[#1e1e1e] border-0 text-slate-300">
              <CardHeader className="pb-3 border-b border-white/10">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center">
                  <Terminal className="w-3.5 h-3.5 mr-2" />
                  System Logs
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-64 overflow-y-auto p-4 space-y-3 font-mono text-[10px] lg:text-xs">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3">
                      <span className="text-slate-500 shrink-0">{log.time}</span>
                      <span className={`${log.type === 'error' ? 'text-red-400' : log.type === 'warning' ? 'text-yellow-400' : log.type === 'success' ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-start gap-3 opacity-50">
                    <span className="text-slate-500 shrink-0">09:00 AM</span>
                    <span className="text-slate-300">System initialized. Waiting for events...</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
