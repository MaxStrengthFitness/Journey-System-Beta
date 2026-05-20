import * as fs from 'fs';

function fixBogus(filepath: string) {
  let code = fs.readFileSync(filepath, 'utf-8');

  // Any text-[bg-slate-100 text-slate-800] should just be text-[#0A2E46]
  code = code.replace(/text-\[bg-slate-100 text-slate-800\]/g, 'text-[#0A2E46]');
  code = code.replace(/bg-\[bg-slate-100 text-slate-800\]/g, 'bg-[#0A2E46]');

  // What about just `bg-slate-100 text-slate-800` where a #0A2E46 background used to be?
  // Let's leave that if it's correct syntax, but maybe we should revert it to light/dark versions if needed.
  // Actually, `#0A2E46` was an accent header color.
  
  // also fix App background. 
  // `<div className="flex flex-col min-h-screen bg-background ...` is usually fine.
  
  // Look for `border-slate-200/50` -> `border-slate-200/50 dark:border-slate-800/50`
  code = code.replace(/border-slate-200\/50(?!\sdark:)/g, 'border-slate-200/50 dark:border-slate-800/50');

  // Fix hover:bg-white to hover:bg-white dark:hover:bg-slate-800 
  code = code.replace(/hover:bg-white(?!\sdark:)/g, 'hover:bg-white dark:hover:bg-slate-800');
  code = code.replace(/hover:text-slate-900(?!\sdark:)/g, 'hover:text-slate-900 dark:hover:text-slate-50');
  
  fs.writeFileSync(filepath, code);
}

fixBogus('src/App.tsx');
fixBogus('src/components/TrainerControlHubView.tsx');
