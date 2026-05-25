const fs = require('fs');
const path = require('path');

const targetFiles = [
  'src/components/BriefingScreen.tsx',
  'src/components/ExecutionSequenceCard.tsx',
  'src/components/SequenceRow.tsx',
  'src/components/PostSessionBriefingView.tsx',
  'src/components/InsightsDashboardView.tsx',
  'src/components/DateChip.tsx',
  'src/components/BottomTabBar.tsx',
  'src/components/HubScreen.tsx'
];

targetFiles.forEach((file) => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace text-[8px], text-[9px], text-[10px] with text-[11px]
  content = content.replace(/text-\[8px\]/g, 'text-[11px]');
  content = content.replace(/text-\[9px\]/g, 'text-[11px]');
  content = content.replace(/text-\[10px\]/g, 'text-[11px]');

  fs.writeFileSync(filePath, content, 'utf8');
});
