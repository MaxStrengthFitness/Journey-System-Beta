const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../firebase-applet-config.json');

if (fs.existsSync(configPath)) {
  console.log('firebase-applet-config.json already exists. Skipping generation.');
  process.exit(0);
}

console.log('firebase-applet-config.json not found. Checking environment variables...');

let configData = {};

if (process.env.VITE_FIREBASE_CONFIG) {
  try {
    configData = JSON.parse(process.env.VITE_FIREBASE_CONFIG);
    console.log('Successfully parsed Firebase config from VITE_FIREBASE_CONFIG env variable.');
  } catch (err) {
    console.error('Failed to parse VITE_FIREBASE_CONFIG JSON:', err.message);
  }
} else if (process.env.VITE_FIREBASE_API_KEY) {
  configData = {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    firestoreDatabaseId: process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
  };
  console.log('Constructed Firebase config from individual environment variables.');
} else {
  console.warn('WARNING: No Firebase configuration environment variables found. Generating a dummy config to prevent build failure.');
  configData = {
    projectId: "dummy-project",
    appId: "1:1234:web:1234",
    apiKey: "dummy-api-key",
    authDomain: "dummy.firebaseapp.com",
    firestoreDatabaseId: "dummy-db",
    storageBucket: "dummy.appspot.com",
    messagingSenderId: "1234",
    measurementId: "G-DUMMY"
  };
}

try {
  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
  console.log('Successfully generated firebase-applet-config.json');
} catch (err) {
  console.error('Error writing firebase-applet-config.json:', err.message);
  process.exit(1);
}
