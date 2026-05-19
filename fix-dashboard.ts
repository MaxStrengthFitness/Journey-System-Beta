import * as fs from 'fs';

let content = fs.readFileSync('src/components/MachineLeaderboardDashboard.tsx', 'utf8');

content = content.replace(
  /\{leaderboardData && \([\s\S]*?Last Sync:[\s\S]*?\)\}/,
  `<p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Live Aggregation</p>`
);

content = content.replace(
  /Fetch(?:\w*) Materialized Rankings\.\.\./,
  "Aggregating Live Leaderboard Data..."
);

content = content.replace(
  /Materialized Rank Intelligence/,
  "Real-Time Rank Intelligence"
);

content = content.replace(
  /Materialized Distribution/,
  "Real-Time Distribution"
);

content = content.replace(
  /Materialized views allow for instant network-wide comparisons without the latency or cost of multi-collection aggregations\./,
  "Dynamically computing real-time distributions across the network."
);

const percentileLogic = `
  const percentiles = useMemo(() => {
    if (localRankings.length === 0) return null;
    const weights = localRankings.map(r => r.weight).sort((a,b) => a-b);
    const getP = (p: number) => {
      const idx = Math.max(0, Math.floor((p/100) * weights.length) - 1);
      return weights[idx] || weights[0];
    };
    return {
      p99: getP(99) || getP(100),
      p90: getP(90),
      p75: getP(75),
      p50: getP(50)
    };
  }, [localRankings]);

  const machineDetails = MACHINE_DATABASE[selectedMachine];
`;

content = content.replace(/const machineDetails = MACHINE_DATABASE\[selectedMachine\];/, percentileLogic);

const thresholdBlockRegex = /\{leaderboardData\?\.machineData\[selectedMachine\]\?\.percentileThresholds \? \([\s\S]*?\) : \([\s\S]*?Thresholds not yet synced\.\<\/p\>[\s\S]*?\)\}/;
const newThresholdBlock = `{percentiles ? (
                          <div className="space-y-4">
                            {Object.entries({ p99: percentiles.p99, p90: percentiles.p90, p75: percentiles.p75, p50: percentiles.p50 })
                              .map(([key, val]) => (
                                <div key={key} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-white/5">
                                  <span className="text-[10px] font-black uppercase text-slate-500">{key.toUpperCase()} Rank</span>
                                  <span className="text-sm font-black text-[#38BDF8] italic">{val} LBS</span>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic text-center py-4">No data to compute thresholds.</p>
                        )}`;

content = content.replace(thresholdBlockRegex, newThresholdBlock);

fs.writeFileSync('src/components/MachineLeaderboardDashboard.tsx', content);
