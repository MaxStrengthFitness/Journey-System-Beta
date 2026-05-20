import * as fs from 'fs';

function applyLightDarkThemes(filepath: string) {
  let code = fs.readFileSync(filepath, 'utf-8');

  // We have a mix of states.
  // 1. Some classes are pure light (e.g., in TrainerControlHubView.tsx)
  // 2. Some classes are pure dark (e.g., in App.tsx)

  // First, normalize everything to pure light mode.
  // Translate pure dark classes to pure light classes (using our reskin mappings).
  const darkToLight: [RegExp, string][] = [
    [/bg-slate-950/g, 'bg-slate-50'],
    [/bg-slate-900\/50/g, 'bg-slate-50'],
    [/bg-slate-900\/80/g, 'bg-slate-50'],
    [/bg-slate-900\/20/g, 'bg-slate-50'],
    [/bg-slate-900\/40/g, 'bg-slate-50'],
    [/bg-slate-900\/60/g, 'bg-slate-50'],
    [/bg-slate-900/g, 'bg-white'],
    [/bg-slate-800\/80/g, 'bg-slate-50'],
    [/bg-slate-800\/50/g, 'bg-slate-50'],
    [/bg-slate-800/g, 'bg-white'],
    [/text-white/g, 'text-slate-900'],
    [/text-slate-300/g, 'text-slate-600'],
    [/text-slate-400/g, 'text-slate-500'],
    [/text-slate-200/g, 'text-slate-700'],
    [/border-slate-800/g, 'border-slate-200'],
    [/border-slate-700\/50/g, 'border-slate-200'],
    [/border-slate-700\/80/g, 'border-slate-200'],
    [/border-slate-700/g, 'border-slate-200'],
    [/border-slate-600/g, 'border-slate-300'],
    [/#0A2E46/g, 'bg-slate-100 text-slate-800'],
  ];

  for (const [regex, replacement] of darkToLight) {
    code = code.replace(regex, replacement);
  }

  // Now, everything is in light mode. Let's append the correct dark modifiers to the light classes.
  // But wait, regex replacements could double up if we aren't careful.
  // We should do mapping with a targeted regex for classNames.
  
  // We'll write a custom replacer that processes the contents of `className="..."` or `className={cn(...)}` or `className={...}`
  function processClassString(classStr: string) {
    // Basic mapping: Light -> Light + Dark
    const classMap: Record<string, string> = {
      'bg-slate-50': 'bg-slate-50 dark:bg-slate-950',
      'bg-zinc-50': 'bg-zinc-50 dark:bg-zinc-950',
      'bg-white': 'bg-white dark:bg-slate-900',
      'bg-slate-100': 'bg-slate-100 dark:bg-slate-800',
      'text-slate-900': 'text-slate-900 dark:text-slate-50',
      'text-slate-800': 'text-slate-800 dark:text-slate-200',
      'text-slate-700': 'text-slate-700 dark:text-slate-300',
      'text-slate-600': 'text-slate-600 dark:text-slate-400',
      'text-slate-500': 'text-slate-500 dark:text-slate-400',
      'border-slate-100': 'border-slate-100 dark:border-slate-800',
      'border-slate-200': 'border-slate-200 dark:border-slate-800',
      'border-slate-300': 'border-slate-300 dark:border-slate-700',
      'shadow-sm': 'shadow-sm dark:shadow-none',
      'shadow-2xl': 'shadow-2xl dark:shadow-none',
    };

    let words = classStr.split(/([\s'"`]+)/);
    for (let i = 0; i < words.length; i++) {
        let w = words[i];
        
        // Remove existing dark classes so we don't duplicate
        if (w.startsWith('dark:')) {
            words[i] = '';
            continue;
        }

        if (classMap[w]) {
            words[i] = classMap[w];
        }
    }
    // Filter out empty resulting strings from removed dark classes
    return words.join('').replace(/\s+/g, ' ').trim();
  }

  // Find all className="something" 
  code = code.replace(/className="([^"]+)"/g, (match, p1) => {
    return `className="${processClassString(p1)}"`;
  });

  // Find all className={'something' } or cn("something") 
  // Let's just run it over the whole file broadly but carefully. It's safe since tailwind classes are very specific.
  
  // Wait, the above regex only gets `className="abc"`. It misses cn("abc", ...) or className={\`abc ${v}\`}
  // A broader approach:
  const globalClassMap = {
      'bg-slate-50': 'bg-slate-50 dark:bg-slate-950',
      'bg-white': 'bg-white dark:bg-slate-900',
      'bg-slate-100': 'bg-slate-100 dark:bg-slate-800',
      'text-slate-900': 'text-slate-900 dark:text-slate-50',
      'text-slate-800': 'text-slate-800 dark:text-slate-200',
      'text-slate-700': 'text-slate-700 dark:text-slate-300',
      'text-slate-600': 'text-slate-600 dark:text-slate-400',
      'text-slate-500': 'text-slate-500 dark:text-slate-400',
      'border-slate-200': 'border-slate-200 dark:border-slate-800',
      'border-slate-300': 'border-slate-300 dark:border-slate-700',
  };

  // We need to only match these as whole words, avoiding ones that are already preceded by `dark:`
  Object.entries(globalClassMap).forEach(([light, lightAndDark]) => {
      // Negative lookbehind for `dark:`, then word boundary. 
      // But JS regex doesn't support lookbehind in very old engines. In modern JS it does.
      code = code.replace(new RegExp("(?<!dark:)\\\\b" + light + "\\\\b", "g"), lightAndDark);
  });
  
  fs.writeFileSync(filepath, code);
  console.log('Processed', filepath);
}

applyLightDarkThemes('src/components/TrainerControlHubView.tsx');
applyLightDarkThemes('src/App.tsx');
