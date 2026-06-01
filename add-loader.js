import fs from 'fs';
const file = "src/components/ClientDirectoryView.tsx";
let content = fs.readFileSync(file, 'utf8');

// Add Loader2 to import from lucide-react if not present
if (!content.includes('Loader2')) {
  content = content.replace(
    /import { ([^}]+) } from 'lucide-react';/,
    "import { $1, Loader2 } from 'lucide-react';"
  );
}

const searchHtml = `<Search className="h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />`;
const replaceHtml = `{isSearchingDb ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Search className="h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />}`;

if (content.includes(searchHtml)) {
  content = content.replace(searchHtml, replaceHtml);
}

fs.writeFileSync(file, content);
console.log('Fixed Loader2');
