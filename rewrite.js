const fs = require('fs');
let code = fs.readFileSync('src/components/AdminStudioManager.tsx', 'utf-8');

code = code.replace(/await addDoc\(collection\(db, 'networks'\).*?setIsCreatingNetwork\(false\);/s, match => match + "\n      await onRefresh?.('networks');");
code = code.replace(/await addDoc\(collection\(db, 'studios'\).*?setNewStudioName\(''\);/s, match => match + "\n      await onRefresh?.('studios');");
code = code.replace(/await deleteDoc\(doc\(db, 'networks', networkId\)\);\n\s*if \(selectedNetworkId === networkId\) \{\n\s*setSelectedNetworkId\(null\);\n\s*\}/s, match => match + "\n      await onRefresh?.('networks');");

code = code.replace(/await updateDoc\(doc\(db, 'networks', networkId\), \{\n\s*studioIds: updatedStudioIds\n\s*\}\);\n\s*\/\/ Update Studio doc\n\s*await updateDoc\(doc\(db, 'studios', studioId\), \{\n\s*networkId: networkId\n\s*\}\);/s, match => match + "\n      await onRefresh?.('networks');\n      await onRefresh?.('studios');");

code = code.replace(/await updateDoc\(doc\(db, 'networks', networkId\), \{\n\s*studioIds: updatedStudioIds\n\s*\}\);\n\s*\/\/ Update Studio doc\n\s*await updateDoc\(doc\(db, 'studios', studioId\), \{\n\s*networkId: null\n\s*\}\);/s, match => match + "\n      await onRefresh?.('networks');\n      await onRefresh?.('studios');");

code = code.replace(/alert\("Clinical Studio profile synchronization complete!"\);/s, match => match + "\n      await onRefresh?.('studios');\n      await onRefresh?.('trainers');");

// Let's not forget remove staff and add staff:
code = code.replace(/await updateDoc\(doc\(db, 'trainers', trainerId\), \{\n\s*accessibleStudioIds: arrayUnion\(selectedStudioId\)\n\s*\}\);\n\s*setIsAddingStaff\(false\);/s, match => match + "\n      await onRefresh?.('trainers');");
code = code.replace(/await updateDoc\(doc\(db, 'trainers', trainerId\), \{\n\s*accessibleStudioIds: arrayRemove\(selectedStudioId\),\n\s*activeGuestStudioIds: arrayRemove\(selectedStudioId\)\n\s*\}\);/s, match => match + "\n      await onRefresh?.('trainers');");


fs.writeFileSync('src/components/AdminStudioManager.tsx', code);
