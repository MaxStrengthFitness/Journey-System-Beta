import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/activeSession/g, 'currentSession');
code = code.replace(/setActiveSession/g, 'setCurrentSession');
code = code.replace(/clientSessions/g, 'sessions');
code = code.replace(/setClientSessions/g, 'setSessions');
code = code.replace(/activeNotesSession/g, 'currentNotesSession');
code = code.replace(/setActiveNotesSession/g, 'setCurrentNotesSession');

fs.writeFileSync('src/App.tsx', code);
