const fs = require('fs');

const fileContent = fs.readFileSync('src/components/ClientProgressReportView.tsx', 'utf8');

const startIndex = fileContent.indexOf('if (mode === "view") {');
let endIndex = fileContent.indexOf('// Selection view handled at start');
endIndex = fileContent.lastIndexOf('}', endIndex) + 1;

let viewBlock = fileContent.substring(startIndex, endIndex);

// Strip Tailwind Print Utilities completely safely
viewBlock = viewBlock.replace(/\s*print:[a-zA-Z0-9\-#\/\[\]%]+/g, '');

let newStyleBlock = `<style>{\`
          @media print {
            @page { size: letter; margin: 0.4in; }
            body, .print-area {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .print-area {
              width: 100% !important;
              max-width: none !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .no-print { display: none !important; }
            header, section {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        \`}</style>`;

// Replace the old style block
viewBlock = viewBlock.replace(/<style>\{`[\s\S]*?`\}<\/style>/, newStyleBlock);

fs.writeFileSync('transformed_block3.txt', viewBlock);
console.log('done transformation');
