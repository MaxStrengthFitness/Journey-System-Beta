const fs = require('fs');
const path = require('path');

const targetFiles = [
  'src/components/BriefingScreen.tsx',
  'src/components/HubScreen.tsx',
  'src/components/PreSessionOverview.tsx',
  'src/components/PostSessionBriefingView.tsx',
  'src/components/InsightsDashboardView.tsx',
  'src/components/DateChip.tsx',
  'src/components/BottomTabBar.tsx',
  'src/components/ExecutionSequenceCard.tsx',
  'src/components/ScheduleSlot.tsx',
  'src/components/ClientProfileView.tsx'
];

targetFiles.forEach((file) => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');

  // Shapes - Cards / Overlays
  content = content.replace(/rounded-\[2rem\]/g, 'rounded-3xl');
  content = content.replace(/rounded-\[1\.5rem\]/g, 'rounded-3xl');
  content = content.replace(/rounded-\[32px\]/g, 'rounded-3xl');
  content = content.replace(/rounded-\[24px\]/g, 'rounded-2xl');
  content = content.replace(/rounded-\[20px\]/g, 'rounded-2xl');
  content = content.replace(/rounded-\[16px\]/g, 'rounded-2xl');
  content = content.replace(/rounded-\[14px\]/g, 'rounded-2xl');
  content = content.replace(/rounded-\[12px\]/g, 'rounded-2xl');
  content = content.replace(/rounded-\[10px\]/g, 'rounded-xl');
  content = content.replace(/rounded-\[8px\]/g, 'rounded-lg');

  // Buttons, Pills & Status Chips
  // Actually, we should replace rounded-xl on buttons w/ rounded-full. Let's rely on manual fixes for buttons.

  // Eyebrows
  content = content.replace(/text-\[10px\]\s+font-black\s+uppercase\s+tracking-widest/g, 'text-[11px] font-medium uppercase tracking-wide opacity-70');
  content = content.replace(/text-\[10px\]\s+font-black\s+uppercase\s+tracking-\[0\.2em\]/g, 'text-[11px] font-medium uppercase tracking-wide opacity-70');
  content = content.replace(/text-\[10px\]\s+sm:text-xs\s+font-black\s+uppercase\s+tracking-widest/g, 'text-[11px] font-medium uppercase tracking-wide opacity-70');
  content = content.replace(/font-black\s+uppercase\s+tracking-widest\s+text-\[10px\]/g, 'text-[11px] font-medium uppercase tracking-wide opacity-70');
  content = content.replace(/text-\[10px\]\s+font-bold\s+uppercase\s+tracking-widest/g, 'text-[11px] font-medium uppercase tracking-wide opacity-70');

  // Display
  content = content.replace(/font-black\s+italic/g, 'font-display italic font-bold');
  content = content.replace(/font-black/g, 'font-bold');

  fs.writeFileSync(filePath, content, 'utf8');
});
