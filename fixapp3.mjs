import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');
const lines = content.split('\n');

const startIndex = lines.findIndex(l => l.includes('function WorkoutTrackerView'));

for (let i = startIndex; i < lines.length; i++) {
    lines[i] = lines[i].replace(/currentSession/g, 'activeSession');
    lines[i] = lines[i].replace(/setCurrentSession/g, 'setActiveSession');
    lines[i] = lines[i].replace(/currentNotesSession/g, 'activeNotesSession');
    lines[i] = lines[i].replace(/setCurrentNotesSession/g, 'setActiveNotesSession');
    
    // We only replace 'setSessions(' with 'setClientSessions('
    lines[i] = lines[i].replace(/setSessions\(/g, 'setClientSessions(');
    
    // For 'sessions', we can just replace 'sessions' with 'clientSessions' UNLESS it's a string literal like 'sessions' (firestore collection)
    // Actually, 'sessions' was previously `clientSessions.map(...)`, `clientSessions.map(...)` etc.
    // Let's replace `sessions` with `clientSessions` but keep 'sessions' intact if wrapped in quotes.
    lines[i] = lines[i].replace(/(?<!['"])sessions(?!\w|>|\/|:|')/g, 'clientSessions');
    // We might miss some edge cases, maybe replace `sessions.` with `clientSessions.`, `sessions,` with `clientSessions,` 
    // Let's do `[sessions` -> `[clientSessions`, `sessions.length` -> `clientSessions.length`, ` sessions` -> ` clientSessions`
}

fs.writeFileSync('src/App.tsx', lines.join('\n'));
