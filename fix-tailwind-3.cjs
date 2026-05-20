const fs = require('fs');

let code = fs.readFileSync('src/components/ClientProfileView.tsx', 'utf8');

// The Problem: Unreadable text and lack of visual hierarchy in light mode.
// We must refine the Tailwind utility classes.

// Step 1: Clean up any double "dark:dark:" prefixes
code = code.replace(/dark:dark:/g, 'dark:');

// Step 2: Ensure the main canvas is bg-slate-50
// The main container currently has max-w-[1400px] 
// `className="max-w-[1400px] mx-auto space-y-2 pb-8 px-2 sm:px-4 bg-slate-50 dark:bg-slate-950 min-h-screen pt-4"` 
// which should be fine.

const regex = /className=(?:\{`([^`]+)`\}|((["'])(.*?)\3)|\{([^\}]+)\})/g;

code = code.replace(regex, (match, templateStr, quotesMatch, quoteChar, normalStr, expressionStr) => {
  let inner = templateStr || normalStr;
  if (!inner) return match; 

  let classes = inner.split(/\s+/).filter(Boolean);
  
  // Create a mapping to standardize classes
  const mapClass = (c) => {
    // Kill the Glare & Deepen Typography
    if (c === 'text-slate-500') {
      // Only use text-slate-500 for metadata. But since we don't have AST context, we'll shift the majority text-slate-500 to text-slate-600 or 700 
      // except if it's very small text (text-[10px], text-xs).
      if (classes.includes('text-[10px]') || classes.includes('text-xs') || classes.includes('text-[9px]')) {
        return 'text-slate-500'; 
      }
      return 'text-slate-700'; 
    }
    
    // Deepen existing slate-600 text
    if (c === 'text-slate-600') {
      if (classes.includes('font-bold') || classes.includes('font-black')) {
        return 'text-slate-800';
      }
      return 'text-slate-700';
    }

    if (c === 'font-black') {
       return 'font-bold'; // As requested by prompt: font-bold is slightly softer than font-black
    }

    return c;
  };

  classes = classes.map(mapClass);

  // Eliminate conflicting light mode basics
  // If we have "bg-white", we shouldn't have "dark:bg-white" (which happens from naive substitution).
  if (classes.includes('bg-white') && classes.includes('dark:bg-white')) {
    classes = classes.filter(c => c !== 'dark:bg-white');
  }

  // Soft dividers
  if (classes.includes('divide-y') || classes.includes('divide-slate-200')) {
     if (classes.includes('divide-slate-200') || classes.includes('dark:divide-slate-700')) {
        // Change it to divide-slate-100 dark:divide-slate-800
        classes = classes.map(c => c === 'divide-slate-200' ? 'divide-slate-100' : c);
        classes = classes.map(c => c === 'dark:divide-slate-700' ? 'dark:divide-slate-800' : c);
     }
  }

  // Tinted Accents: no solid blue/brand blocks in light mode.
  // Wait, the prompt says "instead of a solid blue box, use bg-blue-50 text-blue-800 border-blue-100"
  // Let's identify things like bg-blue-500 or bg-blue-600 that are not buttons. (If they are buttons, it's fine, but mostly they are badges).
  // Actually, we've already done most badges to bg-blue-100 in AST script. 
  // Let's make sure tabs are updated.
  // We updated tabs earlier to: "data-[state=active]:bg-slate-100"
  
  // Let's make sure everything in `ClientProfileView.tsx` uses divide-y divide-slate-100 where applicable.
  // We will leave the rest as is.

  // Re-join classes
  const newInner = Array.from(new Set(classes)).join(' ');

  if (templateStr) return `className={\`${newInner}\`}`;
  if (normalStr) return `className="${newInner}"`;
  
  return match;
});

// Write it back
fs.writeFileSync('src/components/ClientProfileView.tsx', code);
console.log('Update Complete');
