import React, { useState } from 'react';
import StudioHubGrid from './StudioHubGrid';
import ShiftRosterRow from './ShiftRosterRow';
import WaitlistRecoveryWidget from './WaitlistRecoveryWidget';
import ClientReliabilityScore from './ClientReliabilityScore';
import CrossTrainApprovalCard from './CrossTrainApprovalCard';
import CrossTrainAccessGate from './CrossTrainAccessGate';
import { Button } from '@/components/ui/button';

export function MindbodyDashboard() {
  const [role, setRole] = useState<'trainer' | 'leader'>('trainer');
  const [showGate, setShowGate] = useState(false);
  const [accessState, setAccessState] = useState<'locked' | 'granted' | 'pending'>('locked');
  const [tokenStatus, setTokenStatus] = useState<string>('Not linked');
  const [isLoadingToken, setIsLoadingToken] = useState(false);

  const testGetUserToken = async () => {
    setIsLoadingToken(true);
    setTokenStatus('Requesting...');
    try {
      const response = await fetch('/api/mindbody/issueUserToken', {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch token');
      }
      console.log('Token response:', data);
      setTokenStatus(`Success! Linked. AccessToken: ${data.AccessToken?.substring(0, 15)}...`);
    } catch (error: any) {
      console.error('Error fetching token:', error);
      setTokenStatus(`Error: ${error.message || 'Check console'}`);
    } finally {
      setIsLoadingToken(false);
    }
  };

  const handleGateRequest = (notes: string) => {
    console.log('Request submitted:', notes);
    setShowGate(false);
    setAccessState('pending');
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
    <div className="min-h-full w-full bg-background p-6 flex flex-col gap-8">
      <div className="flex justify-between items-center bg-card p-4 rounded border border-border">
        <div>
          <h2 className="text-xl font-bold">Mindbody End-to-End Integration</h2>
          <p className="text-sm text-muted-foreground">Manage your studio operations seamlessly.</p>
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
        <div className="bg-card p-4 rounded border border-border">
          <h3 className="font-bold mb-4">Cross-Train Operations</h3>
          <Button onClick={() => setShowGate(true)}>
            Access Foreign Client Record
          </Button>
        </div>
      )}

      <div className="bg-card p-4 rounded border border-border">
        <h3 className="font-bold mb-4">Mindbody API Connection</h3>
        <p className="text-sm text-slate-500 mb-4 dark:text-slate-400">
          Status: {tokenStatus}
        </p>
        <Button onClick={testGetUserToken} disabled={isLoadingToken}>
          {isLoadingToken ? 'Requesting...' : 'Test Mindbody API Sandbox Connection'}
        </Button>
      </div>

      {accessState === 'pending' && (
        <div className="bg-card p-4 rounded border border-border max-w-sm">
          <h3 className="font-bold mb-4">Leader Inbox View</h3>
          <CrossTrainApprovalCard
            request={{
              id: "req123",
              requestingTrainerName: "Marina",
              requestingTrainerInitials: "MR",
              targetClientName: "Allison P.",
              targetStudioName: "Uptown Studio",
              reason: "Covering a shift",
              createdAt: new Date(),
            }}
            onApprove={handleApprove}
            onDeny={handleDeny}
          />
        </div>
      )}

      {accessState === 'granted' && (
        <div className="bg-card p-4 rounded border border-border">
          <h3 className="font-bold mb-4 text-green">Access Granted</h3>
          <p>The foreign visitor banner would now display "access granted" globally for this trainer.</p>
          <Button variant="outline" className="mt-4" onClick={() => setAccessState('locked')}>Reset Workflow</Button>
        </div>
      )}

      {accessState !== 'granted' && (
        <CrossTrainAccessGate
          open={showGate}
          onOpenChange={setShowGate}
          existingRequestStatus={accessState === 'pending' ? 'pending' : 'none'}
          clientName="Allison P."
          clientHomeStudioName="Uptown Studio"
          currentStudioName="Downtown Studio"
          onRequest={() => handleGateRequest("Need to review notes.")}
          onBack={() => setShowGate(false)}
        />
      )}

      <div className="border border-border/50 rounded-xl bg-muted/50 overflow-hidden">
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
                score={82}
                counts={{
                  completed: 120,
                  reschedule: 10,
                  earlyCancel: 10,
                  lateCancel: 4,
                  noShow: 1
                }}
              />
            )
          }}
        />
      </div>
    </div>
  );
}
