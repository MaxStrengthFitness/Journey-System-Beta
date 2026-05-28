const fs = require('fs');
let content = fs.readFileSync('src/components/ClientProfileView.tsx', 'utf8');
content = content.replace(/dark:bg-slate-900\/50 dark:bg-slate-800/g, 'dark:bg-slate-800');
content = content.replace(/dark:border-slate-800 dark:border-slate-700/g, 'dark:border-slate-700');
content = content.replace(/hover: hover:bg-slate-700/g, 'hover:bg-slate-700');
content = content.replace(/dark:dark:/g, 'dark:');
fs.writeFileSync('src/components/ClientProfileView.tsx', content);
