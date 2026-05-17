const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Inside WorkoutTrackerView only
// We know WorkoutTrackerView starts at 5135.
// Let's replace 'activeSession' with 'currentSession', 'setActiveSession' with 'setCurrentSession'
// 'clientSessions' with 'sessions', 'setClientSessions' with 'setSessions'

code = code.replace(/activeSession/g, 'currentSession');
code = code.replace(/setActiveSession/g, 'setCurrentSession');
code = code.replace(/clientSessions/g, 'sessions');
code = code.replace(/setClientSessions/g, 'setSessions');

fs.writeFileSync('src/App.tsx', code);
