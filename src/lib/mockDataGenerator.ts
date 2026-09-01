
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  getDocs, 
  query, 
  limit,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Client, WorkoutSession, ExerciseLog, Routine } from '../types';

export async function generateMockClientWithHistory(trainerId: string, trainerInitials: string) {
  try {
    // 1. Get some real machines to use for the routine
    const machinesSnap = await getDocs(query(collection(db, 'machines'), limit(5)));
    const machines = machinesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    if (machines.length < 2) {
      throw new Error("Need at least 2 machines in database to generate mock history.");
    }

    const selectedMachineIds = machines.slice(0, 2).map(m => m.id);

    // 2. Create the Mock Client
    const clientData: Partial<Client> = {
      firstName: "Mock",
      lastName: "Client " + Math.floor(Math.random() * 1000),
      gender: "Male",
      age: 45,
      isActive: true,
      remainingSessions: 24,
      completedSessions: 17,
      sessionCount: 17,
      occupation: "AI Researcher",
      createdAt: serverTimestamp(),
      packageTier: "6-Month",
      goals: "Maintain muscle mass and improve joint health over the next 60 days.",
      activityLevel: "Moderate",
      trainingPedigree: "Intermediate",
      recoveryMetric: "Average",
      homeStudioId: null as any
    };

    const clientRef = await addDoc(collection(db, 'clients'), clientData);
    const clientId = clientRef.id;

    // 3. Create a Routine for the client
    const routineData: Partial<Routine> = {
      clientId,
      name: "Standard A",
      machineIds: selectedMachineIds as string[],
      createdAt: serverTimestamp()
    };
    const routineRef = await addDoc(collection(db, 'routines'), routineData);
    const routineId = routineRef.id;

    // 4. Generate 17 sessions over 60 days (approx 2 per week)
    const sessions: WorkoutSession[] = [];
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - 60);

    for (let i = 0; i < 17; i++) {
        const sessionDate = new Date(startDate);
        // Add roughly 3.5 days between sessions
        sessionDate.setDate(startDate.getDate() + Math.floor(i * 3.5));
        
        if (sessionDate > now) break;

        const dateStr = sessionDate.toISOString().split('T')[0];
        
        const session: Partial<WorkoutSession> = {
            clientId,
            routineId,
            sessionType: 'Standard',
            sessionNumber: i + 1,
            date: dateStr,
            trainerInitials,
            trainerId,
            status: 'Completed',
            startTime: Timestamp.fromDate(new Date(sessionDate.setHours(10, 0, 0))),
            endTime: Timestamp.fromDate(new Date(sessionDate.setHours(10, 30, 0))),
            createdAt: Timestamp.fromDate(sessionDate)
        };

        const sessionRef = await addDoc(collection(db, 'sessions'), session);
        const sessionId = sessionRef.id;

        // 5. Generate logs for each machine in the session
        for (const machineId of selectedMachineIds) {
            const log: Partial<ExerciseLog> = {
                sessionId,
                clientId,
                machineId: machineId as string,
                weight: (80 + Math.floor(i * 1.5)).toString(), // Slight progression
                reps: "8",
                seconds: "60",
                timeSpent: "75",
                targetWeight: (85 + Math.floor(i * 1.5)).toString(),
                repQuality: 2,
                createdAt: Timestamp.fromDate(sessionDate)
            };
            await addDoc(collection(db, 'exerciseLogs'), log);
        }
    }

    return { clientId, clientName: `${clientData.firstName} ${clientData.lastName}` };
  } catch (error) {
    console.error("Error generating mock client:", error);
    throw error;
  }
}
