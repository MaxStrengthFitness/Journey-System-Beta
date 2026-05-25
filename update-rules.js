import fs from "fs";

let content = fs.readFileSync("firestore.rules", "utf-8");

const collectionsToUpdate = [
  "clientMachineSettings",
  "routines",
  "routineAdjustments",
  "exerciseLogs",
  "sessionNotes",
  "trainerFocuses",
  "progressReports",
  "focusRecords",
];

for (const coll of collectionsToUpdate) {
  const collRegex = new RegExp(`match \\/${coll}\\/\\{[^}]+\\} \\{\\s*allow read: if isAuthenticated\\(\\);\\s*allow (create, update|create|update): if isAuthenticated\\(\\)([^;]*);`, 'g');
  
  content = content.replace(collRegex, (match, op, rest) => {
    return match.replace("allow read: if isAuthenticated();", "allow read: if isAuthenticated() && (isSuperAdmin() || isFranchiseOwner() || (resource.data.studioId != null && isTrainerOfStudio(resource.data.studioId)));")
                .replace(`allow ${op}: if isAuthenticated()${rest};`, `allow ${op}: if isAuthenticated()${rest} && (request.resource.data.studioId != null && isTrainerOfStudio(request.resource.data.studioId)) && (resource == null || resource.data.studioId == request.resource.data.studioId);`);
  });
}

// Clients rule is a bit different
// From: allow read: if isAuthenticated();
// To: allow read: if isAuthenticated() && (isSuperAdmin() || isFranchiseOwner() || (getStudioIdFromData(resource.data) != null && isTrainerOfStudio(getStudioIdFromData(resource.data))));
content = content.replace(
  /match \/clients\/\{clientId\} \{\s*allow read: if isAuthenticated\(\);/,
  "match /clients/{clientId} {\n      allow read: if isAuthenticated() && (isSuperAdmin() || isFranchiseOwner() || (getStudioIdFromData(resource.data) != null && isTrainerOfStudio(getStudioIdFromData(resource.data))));"
);

// Machine Setting Changes
content = content.replace(
  /match \/machineSettingChanges\/\{changeId\} \{\s*allow read: if isAuthenticated\(\);\s*allow create: if isAuthenticated\(\);/,
  "match /machineSettingChanges/{changeId} {\n      allow read: if isAuthenticated() && (isSuperAdmin() || isFranchiseOwner() || (resource.data.studioId != null && isTrainerOfStudio(resource.data.studioId)));\n      allow create: if isAuthenticated() && (request.resource.data.studioId != null && isTrainerOfStudio(request.resource.data.studioId));"
);

// Schedules
content = content.replace(
  /match \/schedules\/\{scheduleId\} \{\s*allow read: if isAuthenticated\(\);/,
  "match /schedules/{scheduleId} {\n      allow read: if isAuthenticated() && (isSuperAdmin() || isFranchiseOwner() || (resource.data.studioId != null && isTrainerOfStudio(resource.data.studioId)));"
);

// Add auditLogs
if (!content.includes("auditLogs")) {
  const auditLogsRule = `
    // AUDIT LOGS
    match /auditLogs/{logId} {
      allow read: if isSuperAdmin() || isFranchiseOwner();
      allow create: if isAuthenticated();
      allow update, delete: if isSuperAdmin();
    }
  `;
  content = content.replace("match /leaderboards/{docId} {", auditLogsRule + "\n    match /leaderboards/{docId} {");
}

// Add machineRoster subcollection to studios
if (!content.includes("machineRoster")) {
  const rosterRule = `
      match /machineRoster/{machineId} {
        allow read: if isTrainerOfStudio(studioId);
        allow write: if isStudioOwnerOrHeadTrainer(studioId);
      }
  `;
  content = content.replace("allow delete: if isSuperAdmin();\n    }", "allow delete: if isSuperAdmin();\n" + rosterRule + "\n    }");
}

fs.writeFileSync("firestore.rules", content, "utf-8");
console.log("Updated rules");
