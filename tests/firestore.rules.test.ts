import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { setDoc, getDoc, doc, collection, getDocs, addDoc } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest';
import * as fs from 'fs';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  // Initialize testing environment
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-ai-studio',
    firestore: {
      rules,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  
  // Setup standard base data
  // Studio 1 (Studio A)
  // Studio 2 (Studio B)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'studios', 'studioA'), { name: 'Studio A' });
    await setDoc(doc(db, 'studios', 'studioB'), { name: 'Studio B' });
    
    // Trainer A (Studio A)
    await setDoc(doc(db, 'trainers', 'trainerA'), {
      role: 'LifeTransformer',
      primaryHomeStudioId: 'studioA',
      accessibleStudioIds: ['studioA']
    });
    
    // Trainer A's Secret
    await setDoc(doc(db, 'trainers', 'trainerA', 'secrets', 'account'), {
      pinHash: 'xyz'
    });
    
    // Trainer B (Studio B)
    await setDoc(doc(db, 'trainers', 'trainerB'), {
      role: 'LifeTransformer',
      primaryHomeStudioId: 'studioB',
      accessibleStudioIds: ['studioB']
    });
    
    // Session in Studio A
    await setDoc(doc(db, 'sessions', 'sessionA'), {
      hostedAtStudioId: 'studioA',
      clientId: 'clientA'
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore Security Rules', () => {
  // (a) regular Trainer getDocs(collection('trainers')) SUCCEEDS
  it('allows regular Trainer to read trainers collection', async () => {
    const trainerContext = testEnv.authenticatedContext('trainerA', {
      email: 'trainera@test.com'
    });
    const db = trainerContext.firestore();
    const query = getDocs(collection(db, 'trainers'));
    await assertSucceeds(query);
  });

  // (b) cross-studio session read FAILS
  it('denies cross-studio session read', async () => {
    const trainerContext = testEnv.authenticatedContext('trainerB', {
      email: 'trainerb@test.com'
    });
    const db = trainerContext.firestore();
    const p = getDoc(doc(db, 'sessions', 'sessionA'));
    await assertFails(p);
  });

  // (c) cross-studio session create FAILS
  it('denies cross-studio session create', async () => {
    const trainerContext = testEnv.authenticatedContext('trainerB', {
      email: 'trainerb@test.com'
    });
    const db = trainerContext.firestore();
    const p = setDoc(doc(db, 'sessions', 'sessionA_new'), {
      hostedAtStudioId: 'studioA',
      clientId: 'clientA'
    });
    await assertFails(p);
  });

  // (d) same-studio session read SUCCEEDS
  it('allows same-studio session read', async () => {
    const trainerContext = testEnv.authenticatedContext('trainerA', {
      email: 'trainera@test.com'
    });
    const db = trainerContext.firestore();
    const p = getDoc(doc(db, 'sessions', 'sessionA'));
    await assertSucceeds(p);
  });

  // (e) trainer-B reading trainers/trainer-A/secrets/account FAILS
  it('denies trainer reading another trainers secret account', async () => {
    const trainerContext = testEnv.authenticatedContext('trainerB', {
      email: 'trainerb@test.com'
    });
    const db = trainerContext.firestore();
    const p = getDoc(doc(db, 'trainers', 'trainerA', 'secrets', 'account'));
    await assertFails(p);
  });

  // (f) unauthenticated access_requests create SUCCEEDS with {fullName,email,status:'Pending'} and FAILS when email is missing
  it('allows unauthenticated access_requests create with valid fields', async () => {
    const unauthContext = testEnv.unauthenticatedContext();
    const db = unauthContext.firestore();
    const p = addDoc(collection(db, 'access_requests'), {
      fullName: 'Test User',
      email: 'test@example.com',
      status: 'Pending'
    });
    await assertSucceeds(p);
  });

  it('denies unauthenticated access_requests create when email is missing', async () => {
    const unauthContext = testEnv.unauthenticatedContext();
    const db = unauthContext.firestore();
    const p = addDoc(collection(db, 'access_requests'), {
      fullName: 'Test User',
      status: 'Pending'
    });
    await assertFails(p);
  });
});
