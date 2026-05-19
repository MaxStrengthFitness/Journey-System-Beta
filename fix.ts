import * as fs from 'fs';

function fixFile(filepath: string) {
    let code = fs.readFileSync(filepath, 'utf-8');

    code = code.replace(/bg-\[bg-slate-100 text-slate-800\]/g, 'bg-slate-100 text-slate-800');
    code = code.replace(/text-\[bg-slate-100 text-slate-800\]/g, 'text-slate-800');
    
    // Also let's fix some other hardcoded colors from the grep output
    // text-slate-900 on buttons with #F06C22 (amber) should probably be white text for contrast
    code = code.replace(/bg-\[\#F06C22\] hover:bg-\[\#d95b16\] text-slate-900/g, 'bg-[#F06C22] hover:bg-[#d95b16] text-white');
    code = code.replace(/bg-\[\#10B981\](.+?)text-slate-900/g, 'bg-[#10B981]$1text-white');
    code = code.replace(/bg-\[\#115E8D\] hover:bg-\[\#115E8D\]\/90 text-slate-900/g, 'bg-[#115E8D] hover:bg-[#115E8D]/90 text-white');
    // For text-[#F06C22] and text-[#10B981] etc... those are fine.
    
    fs.writeFileSync(filepath, code);
}

fixFile('src/components/TrainerControlHubView.tsx');
fixFile('src/components/TrainerMachineEditor.tsx');
console.log('Fixed invalid Tailwind classes');
