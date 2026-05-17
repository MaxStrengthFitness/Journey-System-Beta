import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const lines = content.split('\n');

// Find start of WorkoutTrackerView
const startIndex = lines.findIndex(l => l.includes('function WorkoutTrackerView'));

if (startIndex !== -1) {
    for (let i = startIndex; i < lines.length; i++) {
        lines[i] = lines[i].replace(/currentSession/g, 'activeSession');
        lines[i] = lines[i].replace(/setCurrentSession/g, 'setActiveSession');
        
        // Let's be careful with 'sessions' -> 'clientSessions'.
        // Let's see if there was any actual 'sessions' in WorkoutTrackerView before.
        // Usually prop `sessions` might exist.
        // WorkoutTrackerView props: `sessions={clientSessions}`
    }
}

fs.writeFileSync('src/fix2.mjs', `export const fn = () => { console.log("hello"); };`);
