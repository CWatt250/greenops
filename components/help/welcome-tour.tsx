'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface Step {
  title: string;
  body: React.ReactNode;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to TLC Management Platform',
    body: (
      <>
        <p>
          A 60-second tour to point out the key bits. You can skip and figure
          it out yourself any time — nothing here is mandatory.
        </p>
      </>
    ),
  },
  {
    title: 'The sidebar — four sections',
    body: (
      <>
        <p>The sidebar groups everything by what you'll be doing:</p>
        <ul className="mt-2 space-y-1.5 text-sm">
          <li>
            <strong>Daily</strong> — Dashboard, Schedule, Routes, Dispatch.
            Today's work.
          </li>
          <li>
            <strong>Records</strong> — Clients, Jobs, Forms, Crews, Services,
            Measure Property. The sources of truth.
          </li>
          <li>
            <strong>Money</strong> — Proposals, Invoices, Billing.
            Where revenue lives.
          </li>
          <li>
            <strong>Insight</strong> — Analytics, Profitability, Portal Inbox,
            Settings.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: 'Add your first customer',
    body: (
      <>
        <p>
          Start with a customer. Click <strong>Clients</strong> in the sidebar
          → <strong>+ New Client</strong>. Address autocomplete is built in —
          just type the street and pick.
        </p>
      </>
    ),
  },
  {
    title: 'Set service prices',
    body: (
      <>
        <p>
          Open <strong>Services</strong> in the sidebar. Every service starts
          at $0 — set base prices once and they auto-fill into proposals,
          invoices, and per-sq-ft pricing.
        </p>
      </>
    ),
  },
  {
    title: 'Schedule a job',
    body: (
      <>
        <p>
          Drag a job onto a crew lane in <strong>Schedule</strong>. Day / Week
          / Month toggle is at the top. Drop into the gray "Unassigned" lane
          to clear a crew without losing the date.
        </p>
      </>
    ),
  },
  {
    title: 'You\'re ready',
    body: (
      <>
        <p>
          Need a refresher later? The <strong>❓ Help</strong> button in the
          bottom-right corner re-opens this tour and gives quick page
          explainers.
        </p>
      </>
    ),
  },
];

export function WelcomeTour() {
  const supabase = createClient();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // ?tour=1 force-replays the tour for demos / Trent.
      if (params?.get('tour') === '1') {
        if (!cancelled) {
          setProfileId(user.id);
          setOpen(true);
          setStep(0);
        }
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('welcome_tour_completed, role')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      // Only owners and dispatchers see the tour.
      const role = (profile as { role?: string } | null)?.role;
      if (role !== 'owner' && role !== 'dispatcher') return;
      const completed = (profile as { welcome_tour_completed?: boolean } | null)?.welcome_tour_completed;
      if (!completed) {
        setProfileId(user.id);
        setOpen(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function persistComplete() {
    if (!profileId) return;
    try {
      await supabase
        .from('profiles')
        .update({ welcome_tour_completed: true })
        .eq('id', profileId);
    } catch { /* ignored — non-fatal */ }
  }

  function next() {
    if (step >= STEPS.length - 1) {
      finish();
    } else {
      setStep((s) => s + 1);
    }
  }

  function prev() {
    if (step > 0) setStep((s) => s - 1);
  }

  async function finish() {
    setOpen(false);
    await persistComplete();
  }

  async function skip() {
    setOpen(false);
    await persistComplete();
  }

  if (!open) return null;

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(11, 11, 11, 0.5)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
    >
      <div className="w-full max-w-md rounded-2xl bg-popover ring-1 ring-foreground/10 shadow-2xl overflow-hidden">
        <div
          className="px-5 py-4 border-b flex items-center justify-between"
          style={{ backgroundColor: 'var(--orange-soft)' }}
        >
          <p className="text-[10px] font-mono uppercase tracking-wider"
            style={{ color: 'var(--orange-deep)' }}
          >
            Step {step + 1} of {STEPS.length}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={skip}
            className="text-[10px] gap-1 h-7"
            style={{ color: 'var(--orange-deep)' }}
          >
            <X className="h-3 w-3" />
            Skip
          </Button>
        </div>

        <div className="p-6 space-y-3">
          <h2
            className="page-title"
            style={{ fontSize: 22 }}
          >
            {current.title}
          </h2>
          <div className="text-sm text-muted-foreground leading-relaxed">
            {current.body}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={prev}
            disabled={isFirst}
            className="gap-1.5"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </Button>
          {isFirst ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={skip}
            >
              Skip — I&apos;ll figure it out
            </Button>
          ) : (
            <span className="flex-1" />
          )}
          <Button
            size="sm"
            onClick={next}
            className="gap-1.5"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            {isFirst ? 'Take the tour' : isLast ? 'Done' : 'Next'}
            {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
