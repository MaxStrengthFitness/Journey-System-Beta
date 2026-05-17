import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

const app = initializeApp({ projectId: config.projectId });
const db = getFirestore(app, config.firestoreDatabaseId);

console.log('db databaseId:', db.databaseId);
