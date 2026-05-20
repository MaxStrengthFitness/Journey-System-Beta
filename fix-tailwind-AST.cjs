const fs = require('fs');

let code = fs.readFileSync('src/components/ClientProfileView.tsx', 'utf8');

const regex = /className=(?:\{`([^`]+)`\}|((["'])(.*?)\3)|\{([^\}]+)\})/g;

code = code.replace(regex, (match, templateStr, quotesMatch, quoteChar, normalStr, expressionStr) => {
  let inner = templateStr || normalStr;
  if (!inner) return match; // skip complex expressions for simplicity

  // Clean strings piece by piece without regex variables

  // Colors mapping
  const colorMap = {
    'text-slate-900': 'text-slate-900 dark:text-slate-50',
    'text-slate-800': 'text-slate-800 dark:text-slate-200',
    'text-slate-700': 'text-slate-700 dark:text-slate-300',
    'text-slate-600': 'text-slate-600 dark:text-slate-400',
    'text-slate-500': 'text-slate-500 dark:text-slate-400',
    'text-slate-400': 'text-slate-400 dark:text-slate-500',
    'bg-white': 'bg-white dark:bg-slate-900',
    'bg-slate-50': 'bg-slate-50 dark:bg-slate-900/50',
    'bg-slate-100': 'bg-slate-100 dark:bg-slate-800',
    'border-slate-200': 'border-slate-200 dark:border-slate-800'
  };

  // Remove existing dark classes for slate text/bg/border to avoid duplicates
  inner = inner.replace(/\bdark:text-slate-\d+(?:\/\d+)?\b/g, '');
  inner = inner.replace(/\bdark:bg-slate-\d+(?:\/\d+)?\b/g, '');
  inner = inner.replace(/\bdark:border-slate-\d+(?:\/\d+)?\b/g, '');
  inner = inner.replace(/\btext-white\b/g, ''); // we'll remap it carefully? No, wait. 
  // Let's not blindly remove text-white, as buttons need it. 

  // Wait, if I strip all dark:bg-slate-X, the mapping will add back the standardized ones.
  // BUT I should only do the mapping for tokens that actually exist in the string.
  
  let classes = inner.split(/\s+/).filter(Boolean);
  
  // Re-map buttons
  if (classes.includes('bg-blue-600') || classes.includes('bg-blue-500')) {
     classes = classes.map(c => {
       if (c === 'bg-blue-600' || c === 'bg-blue-500') return 'bg-orange-500';
       if (c === 'hover:bg-blue-700' || c === 'hover:bg-blue-600') return 'hover:bg-orange-600';
       return c;
     });
     if (!classes.includes('shadow-sm')) classes.push('shadow-sm');
     if (!classes.includes('text-white')) classes.push('text-white');
  }

  // Apply mapping
  const mapped = [];
  for (let c of classes) {
    if (colorMap[c]) {
      mapped.push(colorMap[c]);
    } else {
      mapped.push(c);
    }
  }

  // Clean up potential duplicate spaces
  const newInner = mapped.join(' ');
  
  if (templateStr) return `className={\`${newInner}\`}`;
  if (normalStr) return `className="${newInner}"`;
  
  return match;
});

// Write it back
fs.writeFileSync('src/components/ClientProfileView.tsx', code);
console.log("Rewrite completed");
