const fs = require('fs');
const path = require('path');

const targetFiles = [
  'src/index.css',
  'src/components/BriefingScreen.tsx',
  'src/components/HubScreen.tsx',
  'src/components/PreSessionOverview.tsx',
  'src/components/PostSessionBriefingView.tsx',
  'src/components/InsightsDashboardView.tsx',
  'src/components/DateChip.tsx',
  'src/components/BottomTabBar.tsx',
  'src/components/ExecutionSequenceCard.tsx',
  'src/App.tsx'
];

targetFiles.forEach((file) => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace cyan colors
  content = content.replace(/text-\[#38BDF8\]/g, 'text-cyan');
  content = content.replace(/bg-\\[#38BDF8\\]/g, 'bg-cyan'); // escaping fixes?
  content = content.replace(/bg-\[#38BDF8\]/g, 'bg-cyan');
  content = content.replace(/border-\[#38BDF8\]/g, 'border-cyan');
  content = content.replace(/ring-\[#38BDF8\]/g, 'ring-cyan');
  content = content.replace(/text-sky-400/g, 'text-cyan');
  content = content.replace(/bg-sky-400/g, 'bg-cyan');
  
  // Replace backgrounds
  content = content.replace(/bg-\[#0A2E46\]/g, 'bg-bg-dark');
  content = content.replace(/bg-slate-900\/50/g, 'bg-surface-2');
  content = content.replace(/bg-slate-900/g, 'bg-bg-dark');
  content = content.replace(/bg-slate-800\/80/g, 'bg-surface-2');
  content = content.replace(/bg-slate-800\/50/g, 'bg-surface-2');
  content = content.replace(/bg-slate-800\/30/g, 'bg-surface-2');
  content = content.replace(/bg-slate-800/g, 'bg-surface-1');
  
  content = content.replace(/bg-\[#0e171e\]/g, 'bg-surface-1');
  content = content.replace(/bg-\[#0B151F\]/g, 'bg-surface-1');

  // Also catch rgba versions of cyan if needed
  content = content.replace(/rgba\(56,189,248,0\.1\)/g, 'rgba(var(--cyan),0.1)'); // if we had var(--cyan) we can instead just use Tailwind classes, but we can leave inline rgba styles alone if they use --color-cyan, wait, bg-cyan/10 works. 
  
  // Actually Tailwind accepts `border-cyan/30`. We can just change `border-[#38BDF8]/30`
  content = content.replace(/border-\[#38BDF8\]\/(\d+)/g, 'border-cyan/$1');
  content = content.replace(/bg-\[#38BDF8\]\/(\d+)/g, 'bg-cyan/$1');
  content = content.replace(/text-\[#38BDF8\]\/(\d+)/g, 'text-cyan/$1');
  content = content.replace(/fill-\[#38BDF8\]\/(\d+)/g, 'fill-cyan/$1');
  content = content.replace(/fill-\[#38BDF8\]/g, 'fill-cyan');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${file}`);
});
