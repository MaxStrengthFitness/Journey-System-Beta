import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

initializeApp({
  projectId: 'gen-lang-client-0731527386'
});
const db = getFirestore('ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa');

async function main() {
  console.log('Resetting system health status in Firestore...');
  const docRef = db.collection('system').doc('health');
  await docRef.set({
    status: 'healthy',
    signatureFailures24h: 0,
    dlqDepth: 0,
    webhookSubscriptionActive: true,
    lastSuccessfulEventAt: Timestamp.now(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log('Health status reset successfully to HEALTHY / OPERATIONAL!');
}

main();
