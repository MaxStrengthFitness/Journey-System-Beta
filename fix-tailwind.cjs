const fs = require('fs');
let code = fs.readFileSync('src/components/ClientProfileView.tsx', 'utf8');

// The Canvas & Structural Depth
code = code.replace(/className="max-w-\[1400px\] mx-auto space-y-2 pb-8 px-2 sm:px-4"/g, 'className="max-w-[1400px] mx-auto space-y-2 pb-8 px-2 sm:px-4 bg-slate-50 dark:bg-slate-950 min-h-screen pt-4"');

// Premium Card Pattern
const cardPattern = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm';
// Replace the gradient header
code = code.replace(/bg-gradient-to-br from-\[#115E8D\] to-slate-900 rounded-\[16px\] px-3 sm:px-4 py-3 mb-2 shadow-md relative overflow-hidden text-white flex flex-wrap items-center justify-between gap-4/g, 
  cardPattern + ' px-3 sm:px-4 py-3 mb-2 relative overflow-hidden flex flex-wrap items-center justify-between gap-4');

// Primary Headers (Client Name, Section Titles)
code = code.replace(/text-lg sm:text-2xl font-black uppercase tracking-tighter leading-none m-0 truncate/g, 'text-lg sm:text-2xl font-bold uppercase tracking-tighter leading-none m-0 truncate text-slate-900 dark:text-slate-50');

// Header icons that were white need to be dark mode compliant
code = code.replace(/text-white\/70 hover:text-white hover:bg-white\/10/g, 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800');
code = code.replace(/bg-white\/10 flex items-center justify-center shrink-0 border border-white\/20/g, 'bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700');
code = code.replace(/text-white\/50/g, 'text-slate-500 dark:text-slate-400');

// Badges inside the header
code = code.replace(/bg-\[#38BDF8\]\/10 text-\[#38BDF8\] border-\[#38BDF8\]\/30 px-2 py-0.5 rounded text-\[10px\] font-black uppercase tracking-widest shadow-\[0_0_10px_rgba\(56,189,248,0.2\)\]/g, 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/50 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest');
code = code.replace(/bg-emerald-500\/10 text-emerald-400 border-emerald-500\/30 px-2 py-0.5 rounded text-\[10px\] font-black uppercase tracking-widest shadow-\[0_0_10px_rgba\(52,211,153,0.2\)\]/g, 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest');

// Flair Row
code = code.replace(/bg-amber-500\/10 text-amber-500 border-amber-500\/30 shadow-\[0_0_15px_rgba\(245,158,11,0.2\)\]/g, 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50');
code = code.replace(/bg-purple-500\/10 text-purple-400 border-purple-500\/30 shadow-\[0_0_15px_rgba\(168,85,247,0.2\)\]/g, 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/50');
code = code.replace(/bg-teal-500\/10 text-teal-400 border-teal-500\/30 shadow-\[0_0_15px_rgba\(20,184,166,0.2\)\]/g, 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800/50');

// Last/Next bubbles
code = code.replace(/bg-white\/10 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-white\/5 whitespace-nowrap/g, 'bg-slate-100 dark:bg-slate-800 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-slate-200 dark:border-slate-700 whitespace-nowrap text-slate-600 dark:text-slate-300');
code = code.replace(/text-white\/80/g, 'text-slate-600 dark:text-slate-300');
code = code.replace(/<span className="text-white">/g, '<span className="text-slate-900 dark:text-white">');
code = code.replace(/<span className="font-black text-white">/g, '<span className="font-bold text-slate-900 dark:text-white">');

// Active/Inactive Tab
code = code.replace(/className="flex-none min-w-\[80px\] rounded-full border border-slate-200 h-\[40px\] px-4 font-black uppercase text-\[10px\] tracking-widest text-\[#68717A\] bg-transparent data-\[state=active\]:border-transparent data-\[state=active\]:bg-\[#115E8D\] data-\[state=active\]:text-white transition-all data-\[state=active\]:shadow-sm snap-center"/g, 'className="flex-none min-w-[80px] rounded-md h-[40px] px-4 font-bold text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-transparent data-[state=active]:bg-slate-100 data-[state=active]:dark:bg-slate-800 data-[state=active]:text-slate-900 data-[state=active]:dark:text-white transition-all snap-center"');

fs.writeFileSync('src/components/ClientProfileView.tsx', code);
console.log("Done replacing first set.");
