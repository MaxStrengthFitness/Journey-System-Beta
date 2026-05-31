import React, { useState } from 'react';
import StudioHubGrid from './StudioHubGrid';
import ShiftRosterRow from './ShiftRosterRow';
import WaitlistRecoveryWidget from './WaitlistRecoveryWidget';
import ClientReliabilityScore from './ClientReliabilityScore';
import CrossTrainApprovalCard from './CrossTrainApprovalCard';
import CrossTrainAccessGate from './CrossTrainAccessGate';
import { Button } from '@/components/ui/button';

export function MindbodySandbox() {
  const [role, setRole] = useState<'trainer' | 'leader'>('trainer');
  const [showGate, setShowGate] = useState(false);
  const [accessState, setAccessState] = useState<'locked' | 'granted' | 'requested'>('locked');

  const handleGateRequest = (notes: string) => {
    console.log('Request submitted:', notes);
    setShowGate(false);
    setAccessState('requested');
  };

  const handleApprove = () => {
    console.log('Approved by leader');
    setAccessState('granted');
  };

  const handleDeny = () => {
    console.log('Denied by leader');
    setAccessState('locked');
  };

  return (
    <div className="min-h-full w-full bg-slate-50 dark:bg-slate-950 p-6 flex flex-col gap-8">
      <div className="flex justify-between items-center bg-white p-4 rounded border dark:bg-slate-900 border-border">
        <div>
          <h2 className="text-xl font-bold">Mindbody End-to-End Demo</h2>
          <p className="text-sm text-muted-foreground">Toggle options to view different states of the integration components.</p>
        </div>
        <div className="flex gap-4">
          <Button variant={role === 'trainer' ? 'default' : 'outline'} onClick={() => setRole('trainer')}>
            Trainer View
          </Button>
          <Button variant={role === 'leader' ? 'default' : 'outline'} onClick={() => setRole('leader')}>
            Leader View
          </Button>
        </div>
      </div>

      {accessState === 'locked' && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded border border-border">
          <h3 className="font-bold mb-4">Cross-Train Demo</h3>
          <Button onClick={() => setShowGate(true)}>
            Simulate Click on Foreign Client Appointment
          </Button>
        </div>
      )}

      {accessState === 'requested' && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded border border-border max-w-sm">
          <h3 className="font-bold mb-4">Leader Inbox View</h3>
          <CrossTrainApprovalCard
            requestId="req123"
            clientName="Allison P."
            homeStudioName="Uptown Studio"
            requestingTrainerName="Marina"
            requestingStudioName="Downtown Studio"
            requestedAt={new Date()}
            status="pending"
            onApprove={handleApprove}
            onDeny={handleDeny}
          />
        </div>
      )}

      {accessState === 'granted' && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded border border-border">
          <h3 className="font-bold mb-4 text-green-600">Access Granted</h3>
          <p>The foreign visitor banner would now display "access granted" globally for this trainer.</p>
          <Button variant="outline" className="mt-4" onClick={() => setAccessState('locked')}>Reset Workflow</Button>
        </div>
      )}

      <CrossTrainAccessGate
        isOpen={showGate}
        onOpenChange={setShowGate}
        clientName="Allison P."
        homeStudioName="Uptown Studio"
        onRequestAccess={handleGateRequest}
      />

      <div className="border border-border/50 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden">
        <StudioHubGrid
          role={role}
          studioName="Downtown Studio"
          dailyPulse={{
            shiftRoster: (
              <ShiftRosterRow
                trainer={{ id: 't1', initials: 'MA', fullName: 'Marina', brandColor: '#F37427', sessionCount: 11 }}
                timeColumns={['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00']}
                appointments={[
                  { id: 'a1', clientName: 'Marquita R.', time: '07:00', state: 'scheduled', isNextUp: true },
                  { id: 'a2', clientName: 'Allison P.', time: '08:00', state: 'arrived', syncState: 'syncing' },
                  { id: 'a3', clientName: 'Mike C.', time: '08:30', state: 'active' },
                  { id: 'a4', clientName: 'Karen D.', time: '09:00', state: 'completed' },
                  { id: 'a5', clientName: 'Foreign C.', time: '10:00', state: 'scheduled', isForeign: true, isLocked: accessState !== 'granted' },
                ]}
                currentTime={new Date(new Date().setHours(8, 35, 0, 0))}
                availableTimes={['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00']}
                onAppointmentClick={(apt) => {
                  if (apt.isForeign && apt.isLocked) {
                    setShowGate(true);
                  } else {
                    console.log('clicked', apt.id);
                  }
                }}
              />
            ),
            waitlistRecovery: (
              <WaitlistRecoveryWidget
                openSlots={[
                  { id: 's1', time: new Date(new Date().setHours(7, 30, 0, 0)), trainerId: 't1', trainerName: 'Marina' },
                  { id: 's2', time: new Date(new Date().setHours(8, 0, 0, 0)), trainerId: 't2', trainerName: 'Giovanni' },
                ]}
                waitlist={[
                  { clientId: 'c1', clientName: 'Karen Doe', preferences: 'mornings only' },
                  { clientId: 'c2', clientName: 'Mike Chen', preferences: '' },
                  { clientId: 'c3', clientName: 'Mandeep Singh', preferences: 'Marina specifically' },
                ]}
                onMatch={(slotId, clientId) => console.log('match', slotId, clientId)}
              />
            )
          }}
          retention={{
            reliabilityScore: (
              <ClientReliabilityScore
                clientName="Marquita R."
                score={82}
                scoreTrend="up"
                lifetimeClasses={145}
                totalLateCancels={4}
                totalNoShows={1}
                daysSinceLastVisit={3}
                sixMonthTrend={[75, 78, 70, 85, 80, 82]}
              />
            )
          }}
        />
      </div>
    </div>
  );
}
