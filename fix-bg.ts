import * as fs from 'fs';

let code = fs.readFileSync('src/components/TrainerControlHubView.tsx', 'utf-8');

code = code.replace(/bg-slate-100 text-slate-800 flex items-center justify-center border border-slate-200 shadow-inner/g, 'bg-slate-100 flex items-center justify-center border border-slate-200 shadow-inner');

fs.writeFileSync('src/components/TrainerControlHubView.tsx', code);
