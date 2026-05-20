const fs = require('fs');

const filesToProcess = [
  'src/components/ClientProgressReportView.tsx',
  'src/components/StrengthGainsDemographicChart.tsx',
  'src/components/StrengthGainsMuscleGroupChart.tsx',
  'src/components/MachineEfficacyChart.tsx',
  'src/components/TimeToTrendChart.tsx',
  'src/components/WorkoutChartGrid.tsx'
];

const regex = /className=(?:\{`([^`]+)`\}|((["'])(.*?)\3)|\{([^\}]+)\})/g;

filesToProcess.forEach(file => {
  if (!fs.existsSync(file)) return;
  console.log('Processing', file);
  
  let code = fs.readFileSync(file, 'utf8');
  
  // Step 1: Clean up any double "dark:dark:" prefixes
  code = code.replace(/dark:dark:/g, 'dark:');
  
  code = code.replace(regex, (match, templateStr, quotesMatch, quoteChar, normalStr, expressionStr) => {
    let inner = templateStr || normalStr;
    if (!inner) return match; 
  
    let classes = inner.split(/\s+/).filter(Boolean);
    
    // Create a mapping to standardize classes
    const mapClass = (c) => {
      // Colors mapping
      const colorMap = {
        'text-slate-900': 'text-slate-900 dark:text-slate-50',
        'text-slate-800': 'text-slate-800 dark:text-slate-200',
        'text-slate-700': 'text-slate-700 dark:text-slate-300',
        'bg-slate-50': 'bg-slate-50 dark:bg-slate-900/50',
        'bg-slate-100': 'bg-slate-100 dark:bg-slate-800',
        'border-slate-200': 'border-slate-200 dark:border-slate-800',
        'border-slate-100': 'border-slate-100 dark:border-slate-800'
      };
      
      let mapped = colorMap[c] || c;
      if (mapped.includes(' ')) return mapped; // was already mapped to space separated
  
      if (c === 'text-slate-500') {
        if (classes.includes('text-[10px]') || classes.includes('text-xs') || classes.includes('text-[9px]')) {
          return 'text-slate-500'; 
        }
        return 'text-slate-700 dark:text-slate-300'; 
      }
      
      if (c === 'text-slate-600') {
        if (classes.includes('font-bold') || classes.includes('font-black')) {
          return 'text-slate-800 dark:text-slate-200';
        }
        return 'text-slate-700 dark:text-slate-300';
      }
  
      if (c === 'font-black') {
         return 'font-bold'; 
      }
  
      // Background dark mappings if missing
      if (c === 'bg-white' && !classes.includes('dark:bg-slate-900') && !classes.includes('dark:bg-slate-800')) {
        return 'bg-white dark:bg-slate-900';
      }
  
      return c;
    };
  
    // flatten classes in case mapClass returned space-separated strings
    let mappedClasses = [];
    classes.forEach(c => {
      const mapped = mapClass(c);
      mapped.split(' ').forEach(mc => mappedClasses.push(mc));
    });
  
    classes = mappedClasses;
  
    // Eliminate conflicting light mode basics
    if (classes.includes('bg-white') && classes.includes('dark:bg-white')) {
      classes = classes.filter(c => c !== 'dark:bg-white');
    }
  
    if (classes.includes('divide-y') || classes.includes('divide-slate-200')) {
       if (classes.includes('divide-slate-200') || classes.includes('dark:divide-slate-700')) {
          classes = classes.map(c => c === 'divide-slate-200' ? 'divide-slate-100' : c);
          classes = classes.map(c => c === 'dark:divide-slate-700' ? 'dark:divide-slate-800' : c);
       }
    }
    
    // Cards
    if (classes.includes('bg-white') && classes.includes('border') && !classes.includes('shadow-sm')) {
       classes.push('shadow-sm');
    }
  
    // Re-join classes
    const newInner = Array.from(new Set(classes)).join(' ');
  
    if (templateStr) return `className={\`${newInner}\`}`;
    if (normalStr) return `className="${newInner}"`;
    
    return match;
  });
  
  fs.writeFileSync(file, code);
  console.log('Saved', file);
});
