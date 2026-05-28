import fs from 'fs';

const path = 'src/components/ClientProfileView.tsx';
let content = fs.readFileSync(path, 'utf8');
let lines = content.split('\n');

// 1. Rename the tab list item
const tabListIndex = lines.findIndex(l => l.includes('{ val: "focus", label: "Focus" },'));
if (tabListIndex !== -1) {
    lines[tabListIndex] = lines[tabListIndex].replace('{ val: "focus", label: "Focus" },', '{ val: "journal", label: "Journal" },');
}

// 2. Rename activeTab condition
const useEffectIndex = lines.findIndex(l => l.includes('if (activeTab !== "journey" && activeTab !== "focus") return;'));
if (useEffectIndex !== -1) {
    lines[useEffectIndex] = lines[useEffectIndex].replace('activeTab !== "focus"', 'activeTab !== "journal"');
}

// 3. Rename TabsContent value
const tabsContentIndex = lines.findIndex(l => l.includes('<TabsContent value="focus"'));
if (tabsContentIndex !== -1) {
    lines[tabsContentIndex] = lines[tabsContentIndex].replace('<TabsContent value="focus"', '<TabsContent value="journal"');
}

// 4. Extract Progress Report Archive Card
const cardStart = lines.findIndex(l => l.includes('<TabsContent value="statistics_disabled" className="hidden">')) + 1; // 3465 is TabsContent, Card starts 3466
let cardEnd = -1;

if (cardStart !== 0) {
    let depth = 0;
    for (let i = cardStart; i < lines.length; i++) {
        if (lines[i].includes('<Card ') || lines[i].includes('<Card>') || lines[i].trim() === '<Card' || lines[i].includes('<Card\n')) {
            depth++;
        }
        if (lines[i].includes('</Card>')) {
            depth--;
            if (depth === 0) {
                cardEnd = i;
                break;
            }
        }
    }
}

if (cardStart !== 0 && cardEnd !== -1) {
    const cardLines = lines.slice(cardStart, cardEnd + 1);
    
    // Remove the card from its original place
    lines.splice(cardStart, cardEnd - cardStart + 1);
    
    // Now find where to insert it. We want to insert it right before the closing </div> of the bg-white container in value="journal"
    // We already know tabsContentIndex is the start of the `<TabsContent value="journal"...`
    // Let's find the `</TabsContent>` for it.
    let tabEndIndex = -1;
    let tabDepth = 0;
    for (let i = tabsContentIndex; i < lines.length; i++) {
        if (lines[i].includes('<TabsContent')) tabDepth++;
        if (lines[i].includes('</TabsContent>')) {
            tabDepth--;
            if (tabDepth === 0) {
                tabEndIndex = i;
                break;
            }
        }
    }
    
    if (tabEndIndex !== -1) {
        // Insert right before `tabEndIndex - 1` (since there's a </div> at tabEndIndex - 1)
        lines.splice(tabEndIndex - 1, 0, ...cardLines);
    }
}

fs.writeFileSync(path, lines.join('\n'));
console.log('Done refactoring ClientProfileView.tsx');
