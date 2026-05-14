import fs from 'fs';

let content = fs.readFileSync('src/components/WorkoutChartGrid.tsx', 'utf8');

// Container & Header Backgrounds
content = content.replace(/bg-white/g, 'bg-[#0A2E46]');
content = content.replace(/bg-\[\#fcfcfc\]/g, 'bg-[#0e171e]');
content = content.replace(/bg-zinc-950/g, 'bg-[#0e171e]');

// Controls / Elements
content = content.replace(/bg-zinc-900/g, 'bg-slate-800');
content = content.replace(/bg-zinc-800/g, 'bg-slate-700');

// Borders
content = content.replace(/border-rose-600/g, 'border-[#F06C22]');
content = content.replace(/border-rose-500/g, 'border-[#F06C22]');
content = content.replace(/border-zinc-200/g, 'border-slate-800');
content = content.replace(/border-zinc-100/g, 'border-slate-700');
content = content.replace(/border-zinc-800/g, 'border-slate-700');

// Accents
content = content.replace(/bg-rose-600/g, 'bg-[#F06C22]');
content = content.replace(/bg-rose-500/g, 'bg-[#F06C22]');
content = content.replace(/text-rose-600/g, 'text-[#F06C22]');
content = content.replace(/text-rose-500/g, 'text-[#F06C22]');
content = content.replace(/focus:border-rose-600/g, 'focus:border-[#F06C22]');
content = content.replace(/focus:ring-rose-600/g, 'focus:ring-[#F06C22]');
content = content.replace(/hover:border-rose-600\/40/g, 'hover:border-[#F06C22]/40');
content = content.replace(/hover:bg-rose-600/g, 'hover:bg-[#F06C22]');
content = content.replace(/group-hover:text-rose-500/g, 'group-hover:text-[#F06C22]');
content = content.replace(/group-hover\/settings:text-rose-500/g, 'group-hover/settings:text-[#F06C22]');
content = content.replace(/shadow-\[0_0_10px_rgba\(225,29,72,0\.4\)\]/g, 'shadow-[0_0_10px_rgba(240,108,34,0.4)]');

// Hover states & smaller backgrounds
content = content.replace(/hover:bg-rose-50\/30/g, 'hover:bg-slate-800/50');
content = content.replace(/hover:bg-rose-50\/50/g, 'hover:bg-slate-800/80');
content = content.replace(/group-hover:bg-rose-50\/50/g, 'group-hover:bg-slate-800/50');
content = content.replace(/bg-zinc-50\/50/g, 'bg-slate-900/50');
content = content.replace(/bg-zinc-100/g, 'bg-slate-800');
content = content.replace(/hover:bg-white/g, 'hover:bg-slate-800');

// Text
content = content.replace(/text-zinc-900/g, 'text-white');
content = content.replace(/text-zinc-800/g, 'text-slate-200');
content = content.replace(/text-zinc-700/g, 'text-slate-300');
content = content.replace(/text-zinc-600/g, 'text-slate-400');
content = content.replace(/text-zinc-500/g, 'text-slate-500');
content = content.replace(/text-zinc-400/g, 'text-slate-400');
content = content.replace(/text-zinc-300/g, 'text-slate-300');

// Other
content = content.replace(/divide-zinc-200/g, 'divide-slate-800/50');
content = content.replace(/bg-zinc-400/g, 'bg-slate-600');

// Replace {log ? (... )} logic to include skipped logic:
const originalStr = `{log ? (
                           <div className="flex flex-col items-center justify-center">
                              <div className="flex items-baseline gap-0.5">
                                 <span className="text-[14px] font-black tracking-tighter text-white tabular-nums leading-none">
                                   {log.weight}
                                 </span>
                              </div>`;

const replaceStr = `{log ? (
                           (log.reps === '0' && log.seconds === '0') ? (
                             <div className="flex items-center justify-center opacity-40 grayscale">
                               <span className="text-[8px] font-black pointer-events-none text-slate-500 tracking-tighter">[SKIPPED]</span>
                             </div>
                           ) : (
                           <div className="flex flex-col items-center justify-center">
                              <div className="flex items-baseline gap-0.5">
                                 <span className="text-[14px] font-black tracking-tighter text-white tabular-nums leading-none">
                                   {log.weight}
                                 </span>
                              </div>`;

content = content.replace(originalStr, replaceStr);

// A second replacement block just in case to close the parens properly
// Need to add an extra parenthesis to close the ternary we just added
content = content.replace(
  `                           </div>
                         ) : (
                           <div className="flex items-center justify-center opacity-10">`,
  `                           </div>
                           )
                         ) : (
                           <div className="flex items-center justify-center opacity-10">`
);


fs.writeFileSync('src/components/WorkoutChartGrid.tsx', content, 'utf8');
console.log('Colors replaced successfully');
