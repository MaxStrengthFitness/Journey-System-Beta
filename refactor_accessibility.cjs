const fs = require('fs');
const path = require('path');

const focusClasses = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark";

const targetFiles = [
  'src/components/BriefingScreen.tsx',
  'src/components/ExecutionSequenceCard.tsx',
  'src/components/SequenceRow.tsx',
  'src/components/PostSessionBriefingView.tsx',
  'src/components/InsightsDashboardView.tsx',
  'src/components/BottomTabBar.tsx',
  'src/components/HubScreen.tsx',
  'src/components/VictoryHUDScreen.tsx',
  'src/components/AppHeader.tsx',
  'src/components/StickyCTA.tsx'
];

targetFiles.forEach((file) => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');

  // Insert focus classes into buttons if not already there
  content = content.replace(/(<(?:button|Button)[^>]+className=")([^"]+)(")/g, (match, prefix, classNames, suffix) => {
    if (classNames.includes("focus-visible:ring")) {
      return match;
    }
    return prefix + classNames + " " + focusClasses + suffix;
  });

  // Map category to emojis in BriefingScreen
  if (file.includes('BriefingScreen.tsx')) {
    content = content.replace(
      /<Target className="w-3\.5 h-3\.5" \/>\s*ACTIVE FOCUS:\s*\{f\.category\}/g,
      `{f.category === 'Posture' ? '🦴' : f.category === 'Pace' ? '⏱️' : f.category === 'Path' ? '🛤️' : f.category === 'Purpose' ? '🧠' : '🎯' }
                        ACTIVE FOCUS: {f.category}`
    );
  }

  // Same thing for ClientFocusDashboard if needed
  
  fs.writeFileSync(filePath, content, 'utf8');
});
