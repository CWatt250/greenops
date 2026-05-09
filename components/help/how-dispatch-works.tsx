'use client';

import { useState } from 'react';
import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HowItWorks, HiwList, type HowItWorksSection } from './how-it-works';
import { SendAppToWorker } from '@/components/dispatch/send-app-to-worker';

const SECTIONS: HowItWorksSection[] = [
  {
    heading: '📡 What this page does',
    body: (
      <p>
        Dispatch is your real-time view of every crew&apos;s day. As crews tap{' '}
        <strong>Start</strong> and <strong>Complete</strong> on their phones,
        this page updates instantly — you&apos;ll see jobs flip from
        Scheduled → In Progress → Done without refreshing.
      </p>
    ),
  },
  {
    heading: '🔄 How it updates live',
    body: (
      <>
        <HiwList items={[
          <>Crews tap <strong>Start Job</strong> → job shows In Progress here within ~2 seconds.</>,
          <>Crews tap <strong>Complete</strong> → job marks Done with timestamp + crew member.</>,
          <>GPS pings update truck locations every 30 seconds (when the worker has the app open).</>,
          <>Issues flagged by crew show red badges immediately.</>,
        ]} />
        <p className="text-muted-foreground">
          No refresh needed — the page subscribes to live database changes via Supabase Realtime.
        </p>
      </>
    ),
  },
  {
    heading: '👀 What to look for',
    body: (
      <HiwList items={[
        <><span className="text-emerald-600">Green checkmark</span> — job done on time.</>,
        <><span className="text-amber-600">Yellow timer</span> — in progress.</>,
        <><span className="text-rose-600">Red ⚠️ badge</span> — running over the scheduled window or crew flagged an issue.</>,
        <><span className="text-muted-foreground">Gray clock</span> — scheduled but not started.</>,
      ]} />
    ),
  },
  {
    heading: '🎯 Common workflows',
    body: (
      <div className="space-y-2">
        <p><strong>Morning (8 AM):</strong></p>
        <HiwList items={[
          'Glance at this page — confirm all crews clocked in.',
          'Watch the "in progress" count start climbing.',
          'Reassign jobs if anyone called out.',
        ]} />
        <p><strong>Midday check:</strong></p>
        <HiwList items={[
          'See which crews are running ahead/behind schedule.',
          'Click any job to see notes, photos, GPS log.',
          'Use Routes if you need to rebalance.',
        ]} />
        <p><strong>End of day:</strong></p>
        <HiwList items={[
          'Verify all jobs marked complete.',
          'Review any flagged issues before crews leave.',
          'Review tomorrow\u2019s schedule.',
        ]} />
      </div>
    ),
  },
  {
    heading: '🚨 Troubleshooting',
    body: (
      <div className="space-y-2">
        <p><strong>A crew member isn&apos;t showing up?</strong></p>
        <p className="text-muted-foreground">
          They may not have logged into the app yet. Use{' '}
          <strong>Send App to Worker</strong> below to text them the link.
        </p>
        <p><strong>Job stuck in &ldquo;In Progress&rdquo;?</strong></p>
        <p className="text-muted-foreground">
          Crew probably forgot to tap Complete. Click the job → manually mark complete.
        </p>
        <p><strong>GPS not updating?</strong></p>
        <p className="text-muted-foreground">
          Worker may have closed the app or denied location permissions. Have
          them reopen the app and tap <strong>Allow Location</strong> when prompted.
        </p>
      </div>
    ),
  },
];

export function HowDispatchWorks() {
  const [sendOpen, setSendOpen] = useState(false);

  return (
    <>
      <HowItWorks
        label="How Dispatch Works"
        title="How Dispatch Works"
        subtitle="Live crew status, in plain English."
        sections={SECTIONS}
        footerCta={
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-2"
              style={{ color: 'var(--orange-deep)' }}>
              📲 Send the app to your crew
            </p>
            <Button
              type="button"
              onClick={() => setSendOpen(true)}
              className="w-full text-white gap-1.5"
              style={{ backgroundColor: 'var(--orange)' }}
            >
              <Smartphone className="h-4 w-4" />
              Send App to Worker
            </Button>
          </>
        }
      />
      <SendAppToWorker open={sendOpen} onOpenChange={setSendOpen} />
    </>
  );
}
