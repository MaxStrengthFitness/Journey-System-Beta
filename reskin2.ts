import * as fs from 'fs';

function reskinFile(filepath: string) {
    let code = fs.readFileSync(filepath, 'utf-8');

    const replacements: [RegExp, string][] = [
      // Backgrounds
      [/bg-slate-900\/50/g, 'bg-slate-50'],
      [/bg-slate-900\/80/g, 'bg-slate-50'],
      [/bg-slate-900\/20/g, 'bg-slate-50'],
      [/bg-slate-900\/40/g, 'bg-slate-50'],
      [/bg-slate-900\/60/g, 'bg-slate-50'],
      [/bg-slate-900/g, 'bg-white'],
      [/bg-slate-800\/80/g, 'bg-slate-50'],
      [/bg-slate-800\/50/g, 'bg-slate-50'],
      [/bg-slate-800/g, 'bg-white'],
      
      // Text
      [/text-white/g, 'text-slate-900'],
      [/text-slate-300/g, 'text-slate-600'],
      [/text-slate-400/g, 'text-slate-500'],
      [/text-slate-200/g, 'text-slate-700'],

      // Borders
      [/border-slate-800/g, 'border-slate-200'],
      [/border-slate-700\/50/g, 'border-slate-200'],
      [/border-slate-700\/80/g, 'border-slate-200'],
      [/border-slate-700/g, 'border-slate-200'],
      [/border-slate-600/g, 'border-slate-300'],
      
      // Highlights and Accents
      [/#0A2E46/g, 'bg-slate-100 text-slate-800'],
      [/text-\[\#38BDF8\]/g, 'text-sky-600'],
      [/bg-\[\#38BDF8\]\/10/g, 'bg-sky-50'],
      [/bg-\[\#38BDF8\]/g, 'bg-sky-500'],
      [/border-\[\#38BDF8\]\/30/g, 'border-sky-300'],
      [/border-\[\#38BDF8\]/g, 'border-sky-500'],
      [/border-\[\#114B72\]/g, 'border-slate-200'],
      [/bg-\[\#114B72\]/g, 'bg-sky-600 text-white'],
      [/hover:bg-\[\#18689D\]/g, 'hover:bg-sky-700 text-white'],
      [/hover:bg-slate-800/g, 'hover:bg-slate-50 text-slate-900'],
      [/hover:bg-slate-700/g, 'hover:bg-slate-100 text-slate-900'],
      [/hover:text-white/g, 'hover:text-slate-900'],
      // Fix nested cards and inputs
      [/bg-[#0A2E46]/g, 'bg-slate-100'],
      [/border-[#114B72]/g, 'border-slate-200'],
      // Replace empty states bg
      [/bg-slate-900\/30/g, 'bg-slate-50'],
      [/bg-rose-950\/20/g, 'bg-rose-50'],
      [/border-rose-900\/40/g, 'border-rose-200'],
      [/border-rose-900\/30/g, 'border-rose-200'],
      [/border-rose-900\/50/g, 'border-rose-200'],
      [/bg-sky-500\/10/g, 'bg-sky-50'],
      [/border-sky-500\/20/g, 'border-sky-200'],
      [/bg-amber-500\/10/g, 'bg-amber-50'],
      [/border-amber-500\/20/g, 'border-amber-200'],
      [/bg-emerald-500\/10/g, 'bg-emerald-50'],
      [/border-emerald-500\/20/g, 'border-emerald-200'],
      [/bg-rose-500\/10/g, 'bg-rose-50'],
      [/border-rose-500\/20/g, 'border-rose-200'],
      [/bg-indigo-900\/50/g, 'bg-indigo-50'],
      [/border-indigo-500\/30/g, 'border-indigo-200'],
      [/text-indigo-300/g, 'text-indigo-600'],
      [/shadow-\[0_0_15px_rgba\(99,102,241,0.2\)\]/g, 'shadow-sm'],
      [/shadow-\[0_0_15px_rgba\(56,189,248,0.2\)\]/g, 'shadow-sm'],
      [/shadow-\[0_0_15px_rgba\(240,108,34,0.2\)\]/g, 'shadow-sm'],
      [/shadow-\[0_0_15px_rgba\(240,108,34,0.3\)\]/g, 'shadow-sm'],
      [/shadow-\[0_0_15px_rgba\(56,189,248,0.15\)\]/g, 'shadow-sm'],
      [/shadow-\[0_0_15px_rgba\(225,29,72,0.3\)\]/g, 'shadow-sm'],
      [/shadow-\[0_0_8px_#10B981\]/g, 'shadow-none'],
    ];

    for (const [regex, replacement] of replacements) {
        code = code.replace(regex, replacement);
    }
    
    // specifically for TrainerMachineEditor which might have dialogs
    code = code.replace(/text-rose-400/g, 'text-rose-600');
    code = code.replace(/bg-rose-500\/20/g, 'bg-rose-100');
    
    fs.writeFileSync(filepath, code);
    console.log(`Successfully reskinned ${filepath}`);
}

reskinFile('src/components/TrainerMachineEditor.tsx');
