const fs = require('fs');

let content = fs.readFileSync('src/components/ClientProgressReportView.tsx', 'utf8');

// Find the block
const startIdx = content.indexOf('  if (mode === "view") {');
const endMarker = '  // Selection view handled at start';
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
    console.error('Could not find block bounds');
    process.exit(1);
}

let block = content.substring(startIdx, endIdx);

// 1. Strip Tailwind Print Utilities
block = block.replace(/\s*print:bg-white\b/g, '');
block = block.replace(/\s*print:text-black\b/g, '');
block = block.replace(/\s*print:text-\[#0A2E46\]\b/g, '');
block = block.replace(/\s*print:bg-slate-50\b/g, '');
block = block.replace(/\s*print:border-slate-200\b/g, '');
block = block.replace(/\s*print:border-slate-100\b/g, '');
block = block.replace(/\s*print:border-slate-300\b/g, '');
block = block.replace(/\s*print:shadow-none\b/g, '');
block = block.replace(/\s*print:m-0\b/g, '');
block = block.replace(/\s*print:p-0\b/g, '');
block = block.replace(/\s*print:hidden\b/g, '');
block = block.replace(/\s*print:break-inside-avoid\b/g, ' break-inside-avoid');
block = block.replace(/\s*print:text-slate-500\b/g, '');
block = block.replace(/\s*print:text-slate-600\b/g, '');
block = block.replace(/\s*print:text-slate-700\b/g, '');
block = block.replace(/\s*print:bg-slate-100\b/g, '');
block = block.replace(/\s*print:bg-transparent\b/g, '');
block = block.replace(/\s*print:border\b/g, '');

// Clean any empty classNames that might have been left if print was the only class
block = block.replace(/className="\s+"/g, '');

// 2 & 3 & 4 & 5. Replace <style> block
const styleStart = block.indexOf('<style>');
const styleEnd = block.indexOf('</style>') + 8;

const newStyle = `<style>{\`
          @media print {
            @page { size: letter; margin: 0.4in; }
            body, html { 
               background-color: #0A2E46 !important; 
               -webkit-print-color-adjust: exact !important; 
               print-color-adjust: exact !important; 
            }
            .print-area { 
               width: 100% !important; 
               max-width: none !important;
            }
            .no-print { display: none !important; }
            header, section, .break-inside-avoid {
               break-inside: avoid !important;
               page-break-inside: avoid !important;
            }
          }
        \`}</style>`;

block = block.substring(0, styleStart) + newStyle + block.substring(styleEnd);

fs.writeFileSync('transformed_block.txt', block);
content = content.substring(0, startIdx) + block + content.substring(endIdx);
fs.writeFileSync('src/components/ClientProgressReportView.tsx', content);

console.log("Done!");
