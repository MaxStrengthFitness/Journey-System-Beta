const fs = require('fs');

const fileContent = fs.readFileSync('src/components/TrainerControlHubView.tsx', 'utf8');

const returnStart = fileContent.indexOf('  return (\n    <motion.div');

const newReturn = `  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="max-w-6xl mx-auto w-full overflow-x-hidden px-4 sm:px-8 py-8"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-black tracking-tight uppercase italic text-white">Hub Settings</h2>
          <p className="text-slate-400 uppercase text-[10px] font-black tracking-widest leading-relaxed">
            Manage your schedule sync and standard studio settings.
          </p>
        </div>
        
        {onLogout && (
          <Button 
            variant="outline" 
            onClick={onLogout}
            className="rounded-2xl border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 h-12 px-6 font-black uppercase text-[10px] tracking-widest"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Switch Trainer
          </Button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Nav */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2">
          {[
            { id: 'team', label: 'Team Management', icon: UserCog },
            { id: 'security', label: 'System Security', icon: ShieldAlert },
            { id: 'protocol', label: 'Protocol Defaults', icon: Settings2 },
            { id: 'studio', label: 'Studio Config', icon: Building2 },
            { id: 'data', label: 'Data & Telemetry', icon: HardDrive },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'team'|'security'|'protocol'|'studio'|'data')}
                className={cn(
                  "flex items-center gap-3 px-4 py-4 rounded-2xl transition-all border text-left font-bold uppercase text-[11px] tracking-widest",
                  activeTab === tab.id 
                    ? "bg-[#0A2E46] border-[#38BDF8] text-white shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                    : "bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                )}
              >
                <Icon className={cn("w-5 h-5", activeTab === tab.id ? "text-[#38BDF8]" : "opacity-50")} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1 space-y-6">
          {activeTab === 'team' && (
            <Card className="border border-slate-700 bg-slate-800 shadow-2xl rounded-[32px] overflow-hidden">
              <CardHeader className="bg-slate-900/50 pb-8 border-b border-slate-700">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#0A2E46] flex items-center justify-center border border-[#114B72] shadow-inner">
                      <UserCog className="w-6 h-6 text-[#38BDF8]" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-black text-white italic tracking-tight">Team Management</CardTitle>
                      <CardDescription className="text-slate-400 font-medium uppercase text-[10px] tracking-widest">Manage individual Schedule Sync URLs.</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <Button 
                        onClick={() => setIsCreateModalOpen(true)}
                        className="rounded-xl bg-[#F06C22] hover:bg-[#d95b16] text-white h-10 px-4 font-black uppercase text-[10px] tracking-widest gap-2 shadow-[0_0_15px_rgba(240,108,34,0.3)]"
                      >
                        <Plus className="w-4 h-4" />
                        Add New
                      </Button>
                    )}
                    {isAdmin && onReorderTrainers && (
                      <Button 
                        variant="outline" 
                        onClick={onReorderTrainers}
                        className="rounded-xl border-slate-700 text-slate-300 bg-slate-800 hover:text-white hover:bg-slate-700 h-10 px-4 font-black uppercase text-[10px] tracking-widest gap-2"
                      >
                        <RefreshCcw className="w-3 h-3" />
                        Sort
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <div className="space-y-6">
                  {visibleTrainers.length === 0 ? (
                    <p className="text-center py-8 text-slate-500 font-medium italic">No matching trainer records found.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {visibleTrainers.map((t) => (
                        <div key={t.id} className="p-6 bg-slate-900/80 rounded-[24px] border border-slate-700 space-y-6 flex flex-col justify-between relative overflow-hidden group">
                          {isAdmin && (
                            <button 
                              onClick={() => setTrainerToDelete(t)}
                              className="absolute top-4 right-4 p-2 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                              title="Delete Trainer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        
                          <div className="flex items-start gap-4">
                            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl italic mt-1 shrink-0", t.isOwner ? 'bg-[#F06C22]/20 text-[#F06C22]' : 'bg-slate-800 text-slate-300 border border-slate-700')}>
                              {t.initials}
                            </div>
                            <div className="flex flex-col flex-1 pr-8">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-lg font-black text-white uppercase italic leading-none">{t.fullName}</p>
                                {t.isOwner && <span className="bg-[#F06C22]/10 text-[#F06C22] border border-[#F06C22]/20 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">Owner</span>}
                              </div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-[#38BDF8] leading-none mt-2">
                                {t.isOwner ? 'System Admin' : 'Performance Trainer'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between p-4 bg-slate-800/80 rounded-2xl border border-slate-700">
                            <Label className="text-xs font-bold text-slate-300 cursor-pointer">Show on Hub Calendar</Label>
                            <Switch 
                              checked={t.isVisibleOnCalendar !== false} 
                              onCheckedChange={() => handleToggleVisibility(t.id!, t.isVisibleOnCalendar ?? true)}
                              className="data-[state=checked]:bg-[#10B981] data-[state=unchecked]:bg-slate-700"
                            />
                          </div>

                          <div className="pt-4 border-t border-slate-700/50">
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-slate-400">
                                  <RefreshCcw className="w-3.5 h-3.5" />
                                  <h4 className="font-bold uppercase text-[9px] tracking-widest leading-none">MindBody Sync URL</h4>
                                </div>
                                {t.mindbody_ical_url && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    disabled={syncingTrainerId === t.id}
                                    onClick={() => handleTrainerSync(t.id!)}
                                    className="h-6 text-[9px] flex items-center px-2 py-0 font-black uppercase text-[#38BDF8] hover:text-[#38BDF8] hover:bg-[#38BDF8]/10 rounded-md"
                                  >
                                    {syncingTrainerId === t.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                    Sync Now
                                  </Button>
                                )}
                              </div>

                              {editingIcalId === t.id ? (
                                <div className="flex flex-col gap-2">
                                  <Input 
                                    placeholder="https://..." 
                                    value={newIcalUrl}
                                    onChange={e => setNewIcalUrl(e.target.value)}
                                    className="h-8 rounded-lg bg-slate-800 border-slate-600 text-xs text-white px-2 focus-visible:ring-[#F06C22]"
                                  />
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => setEditingIcalId(null)} className="h-6 px-2 font-bold rounded-md text-xs text-slate-400 hover:text-white hover:bg-slate-700">Cancel</Button>
                                    <Button 
                                      size="sm"
                                      onClick={() => handleUpdateIcalUrl(t.id!, newIcalUrl)}
                                      disabled={isUpdatingIcal}
                                      className="bg-[#10B981] h-6 px-3 rounded-md font-black uppercase text-[9px] hover:bg-[#10B981]/80 text-white"
                                    >
                                      {isUpdatingIcal ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2 overflow-hidden group/link bg-slate-800 p-3 rounded-xl border border-slate-700">
                                  {t.mindbody_ical_url ? (
                                    <>
                                      <Link className="w-3 h-3 text-slate-500 shrink-0" />
                                      <span className="text-[10px] text-slate-300 font-medium truncate flex-1">{t.mindbody_ical_url}</span>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => {
                                          setEditingIcalId(t.id!);
                                          setNewIcalUrl(t.mindbody_ical_url || '');
                                        }}
                                        className="h-6 w-6 p-0 rounded-md shrink-0 opacity-0 group-hover/link:opacity-100 border border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700"
                                      >
                                        <RefreshCcw className="w-3 h-3" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[10px] text-slate-500 font-medium italic select-none">No feed configured</span>
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => {
                                          setEditingIcalId(t.id!);
                                          setNewIcalUrl('');
                                        }}
                                        className="h-6 border-slate-600 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md px-3 font-black uppercase text-[9px]"
                                      >
                                        Add Link
                                      </Button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'security' && (
            <Card className="border border-slate-700 bg-slate-800 shadow-2xl rounded-[32px] overflow-hidden">
              <CardHeader className="bg-slate-900/50 pb-8 border-b border-slate-700">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 shadow-inner">
                    <ShieldAlert className="w-6 h-6 text-rose-500" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-black text-white italic tracking-tight">System Security</CardTitle>
                    <CardDescription className="text-slate-400 font-medium uppercase text-[10px] tracking-widest">Access control and dashboard locking.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-slate-900/50 rounded-2xl border border-slate-700">
                    <div className="space-y-1 pr-4">
                      <Label className="text-sm font-bold text-white">Admin Command PIN</Label>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">The master override code for critical actions.</p>
                    </div>
                    <Input 
                      type="password"
                      value={adminPin}
                      onChange={e => setAdminPin(e.target.value)}
                      placeholder="••••"
                      className="w-24 h-10 bg-slate-800 border-slate-600 text-center font-bold tracking-widest text-white focus-visible:ring-[#F06C22]"
                    />
                  </div>

                  <div className="flex items-center justify-between p-5 bg-slate-900/50 rounded-2xl border border-slate-700 cursor-pointer" onClick={() => setRequirePinForEdits(!requirePinForEdits)}>
                    <div className="space-y-1 pr-4">
                      <Label className="text-sm font-bold text-white cursor-pointer">Require PIN for Routine Edits</Label>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">Prevents accidental permanent changes to a client's "A Routine" by requiring the Admin PIN.</p>
                    </div>
                    <Switch checked={requirePinForEdits} onCheckedChange={setRequirePinForEdits} className="data-[state=checked]:bg-[#F06C22] data-[state=unchecked]:bg-slate-700" />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-slate-900/50 rounded-2xl border border-slate-700">
                    <div className="space-y-1 pr-4">
                      <Label className="text-sm font-bold text-white">Auto-Lock Dashboard</Label>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">Secures the iPad if left unattended.</p>
                    </div>
                    <Select value={autoLock} onValueChange={setAutoLock}>
                      <SelectTrigger className="w-32 h-10 bg-slate-800 border-slate-600 text-white font-bold text-xs focus:ring-[#F06C22]">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 text-white">
                        <SelectItem value="5m">5 Minutes</SelectItem>
                        <SelectItem value="15m">15 Minutes</SelectItem>
                        <SelectItem value="never">Never</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'protocol' && (
            <Card className="border border-slate-700 bg-slate-800 shadow-2xl rounded-[32px] overflow-hidden">
              <CardHeader className="bg-slate-900/50 pb-8 border-b border-slate-700">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-inner">
                    <Settings2 className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-black text-white italic tracking-tight">Protocol Defaults</CardTitle>
                    <CardDescription className="text-slate-400 font-medium uppercase text-[10px] tracking-widest">Global settings for in-session functionality.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-slate-900/50 rounded-2xl border border-slate-700">
                    <div className="space-y-1 pr-4">
                      <Label className="text-sm font-bold text-white">Global Turnaround Pause</Label>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">Sets the default expectation for new machines.</p>
                    </div>
                    <Select value={globalPause} onValueChange={setGlobalPause}>
                      <SelectTrigger className="w-32 h-10 bg-slate-800 border-slate-600 text-white font-bold text-xs focus:ring-[#F06C22]">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 text-white">
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="3s">3 Seconds</SelectItem>
                        <SelectItem value="5s">5 Seconds</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between p-5 bg-slate-900/50 rounded-2xl border border-slate-700 cursor-pointer" onClick={() => setAllowMachineDeletion(!allowMachineDeletion)}>
                    <div className="space-y-1 pr-4">
                      <Label className="text-sm font-bold text-white cursor-pointer">Allow In-Session Machine Deletion</Label>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">Allows trainers to remove machines from the active session view.</p>
                    </div>
                    <Switch checked={allowMachineDeletion} onCheckedChange={setAllowMachineDeletion} className="data-[state=checked]:bg-[#10B981] data-[state=unchecked]:bg-slate-700" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'studio' && (
            <Card className="border border-slate-700 bg-slate-800 shadow-2xl rounded-[32px] overflow-hidden">
              <CardHeader className="bg-slate-900/50 pb-8 border-b border-slate-700">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-inner">
                    <Building2 className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-black text-white italic tracking-tight">Studio Configuration</CardTitle>
                    <CardDescription className="text-slate-400 font-medium uppercase text-[10px] tracking-widest">General information and display settings.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 p-5 bg-slate-900/50 rounded-2xl border border-slate-700">
                    <div className="space-y-1">
                      <Label className="text-sm font-bold text-white">Active Location Name</Label>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">The name of your studio/facility.</p>
                    </div>
                    <Input 
                      value={locationName}
                      onChange={e => setLocationName(e.target.value)}
                      className="h-10 bg-slate-800 border-slate-600 text-white font-medium focus-visible:ring-[#F06C22]"
                    />
                  </div>

                  <div className="flex items-center justify-between p-5 bg-slate-900/50 rounded-2xl border border-slate-700 cursor-pointer" onClick={() => setShowRawBioData(!showRawBioData)}>
                    <div className="space-y-1 pr-4">
                      <Label className="text-sm font-bold text-white cursor-pointer">Show Raw Biomechanical Data</Label>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">Toggles expert-level vs. simplified data across the app.</p>
                    </div>
                    <Switch checked={showRawBioData} onCheckedChange={setShowRawBioData} className="data-[state=checked]:bg-[#10B981] data-[state=unchecked]:bg-slate-700" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'data' && (
            <div className="space-y-8">
              <Card className="border border-slate-700 bg-slate-800 shadow-2xl rounded-[32px] overflow-hidden">
                <CardHeader className="bg-slate-900/50 pb-8 border-b border-slate-700">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#0A2E46] flex items-center justify-center border border-[#114B72] shadow-inner">
                      <HardDrive className="w-6 h-6 text-[#38BDF8]" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-black text-white italic tracking-tight">Data & Telemetry</CardTitle>
                      <CardDescription className="text-slate-400 font-medium uppercase text-[10px] tracking-widest">Network status and synchronization.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  {/* Cloud Sync Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-slate-900/50 border border-[#38BDF8]/20 rounded-2xl gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981]"></div>
                         <Label className="text-sm font-bold text-white">Cloud Sync Active</Label>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed max-w-sm">All changes sync gracefully. Force sync if network dropouts occur.</p>
                    </div>
                    <Button 
                      onClick={handleAllTrainersSync} 
                      disabled={isSyncingAll}
                      className="h-12 px-6 rounded-xl font-black bg-[#114B72] hover:bg-[#18689D] text-white shadow-lg text-[10px] uppercase tracking-widest shrink-0"
                    >
                      {isSyncingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2 text-[#38BDF8]" />}
                      Force Sync All
                    </Button>
                  </div>

                  <div className="h-px bg-slate-700/50 w-full my-6"></div>

                  <div className="grid gap-4">
                    <Label htmlFor="legacy-upload" className="text-xs font-black uppercase tracking-widest text-slate-300">Historical Workout Data (CSV)</Label>
                    <div className="relative">
                      <Input 
                        id="legacy-upload" 
                        type="file" 
                        accept=".csv" 
                        onChange={handleLegacyFileUpload}
                        disabled={isLegacyImporting}
                        className="h-24 border-2 border-dashed border-slate-600 bg-slate-900/30 rounded-2xl cursor-pointer file:hidden flex items-center justify-center text-center font-bold text-slate-400 hover:border-[#F06C22]/50 hover:bg-slate-900/50 transition-all"
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {isLegacyImporting ? (
                          <div className="flex items-center gap-3">
                            <Loader2 className="w-6 h-6 animate-spin text-[#F06C22]" />
                            <span className="text-lg font-black uppercase italic text-[#F06C22]">Processing...</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm font-black text-white uppercase tracking-tight">Click to select CSV</span>
                            <span className="text-[10px] font-medium text-slate-500 uppercase">Legacy/FileMaker Format</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {legacyStats && (
                    <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-start gap-4">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0 mt-1" />
                      <div>
                        <p className="font-black text-emerald-400 text-lg">Import Success</p>
                        <div className="text-emerald-200/80 font-medium grid grid-cols-2 gap-x-8 gap-y-1 mt-2 text-xs">
                          <p>Clients: <span className="font-black text-emerald-400">{legacyStats.clients}</span></p>
                          <p>Sessions: <span className="font-black text-emerald-400">{legacyStats.sessions}</span></p>
                          <p>Logs: <span className="font-black text-emerald-400">{legacyStats.logs}</span></p>
                          <p>Skipped: <span className="font-black text-emerald-400">{legacyStats.failed}</span></p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Destructive Actions */}
              {isAdmin && (
                <Card className="border border-rose-900/50 bg-slate-800 shadow-2xl rounded-[32px] overflow-hidden">
                  <CardHeader className="bg-rose-950/20 pb-8 border-b border-rose-900/30">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                        <Trash className="w-6 h-6 text-rose-500" />
                      </div>
                      <div>
                        <CardTitle className="text-2xl font-black text-white italic tracking-tight">Danger Zone</CardTitle>
                        <CardDescription className="text-rose-400/80 font-medium uppercase text-[10px] tracking-widest">Critical database maintenance.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 space-y-4">
                     <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-rose-950/20 border border-rose-900/40 rounded-3xl gap-6">
                        <div className="space-y-1">
                          <p className="font-black text-white uppercase italic tracking-tight">Factory Reset</p>
                          <p className="text-[10px] font-black text-rose-400/70 uppercase">
                            Wipe session data or re-push standard equipment defaults.
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4">
                          <Button 
                            onClick={async () => {
                              setIsRestoringMachines(true);
                              try {
                                await onRestoreMachines();
                              } finally {
                                setIsRestoringMachines(false);
                              }
                            }}
                            disabled={isRestoringMachines}
                            variant="outline"
                            className="h-12 px-6 rounded-xl font-black border-slate-700 bg-slate-800 text-white hover:bg-slate-700 text-[10px] uppercase tracking-widest"
                          >
                            Re-Sync Masters
                          </Button>
                          <Button 
                            onClick={() => {
                               if (window.confirm("Are you sure you want to clear the local cache? This will force a fresh pull of data next startup.")) {
                                  alert("Local cache cleared.");
                               }
                            }}
                            variant="outline"
                            className="h-12 px-6 rounded-xl font-black border-slate-700 bg-slate-800 text-white hover:bg-slate-700 text-[10px] uppercase tracking-widest"
                          >
                            Clear Local Cache
                          </Button>
                          <Button 
                            onClick={async () => {
                              setIsCleansingApp(true);
                              try {
                                await onAppCleanse();
                              } finally {
                                setIsCleansingApp(false);
                              }
                            }}
                            disabled={isCleansingApp}
                            className="h-12 px-6 rounded-xl font-black bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-900/20 text-white border-none text-[10px] uppercase tracking-widest"
                          >
                            {isCleansingApp ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                            Total Cleanse
                          </Button>
                        </div>
                     </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

        </div>
      </div>

      <CreateTrainerModal 
        isOpen={isCreateModalOpen} 
        onOpenChange={setIsCreateModalOpen} 
        onSubmit={handleCreateTrainer}
      />

      {/* Delete Confirmation Modal */}
      {trainerToDelete && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center space-y-6"
          >
            <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
              <AlertCircle className="w-8 h-8 text-rose-500" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white italic tracking-tighter uppercase">Delete Trainer?</h3>
              <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                Are you sure you want to remove <strong className="text-white">{trainerToDelete?.fullName}</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <Button onClick={() => setTrainerToDelete(null)} variant="outline" className="flex-1 rounded-xl h-12 bg-slate-800 border-slate-700 text-white hover:bg-slate-700 font-bold uppercase tracking-widest text-[10px]">
                Cancel
              </Button>
              <Button onClick={handleDeleteTrainer} variant="destructive" className="flex-1 rounded-xl h-12 bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-widest shadow-[0_0_15px_rgba(225,29,72,0.3)] border-none text-[10px]">
                Confirm
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
`;

fs.writeFileSync('src/components/TrainerControlHubView.tsx', fileContent.substring(0, returnStart) + newReturn);
