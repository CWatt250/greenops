'use client';

import { HowItWorks, HiwList, type HowItWorksSection } from './how-it-works';

// ── Routes ───────────────────────────────────────────────────────────────
const ROUTES_SECTIONS: HowItWorksSection[] = [
  {
    heading: '🗺️ What this page does',
    body: (
      <p>
        Build a per-crew, per-day driving route from today&apos;s jobs.
        Click <strong>Optimize</strong> and our solver (VROOM via OpenRouteService)
        sequences stops to minimize total drive time across selected crews.
      </p>
    ),
  },
  {
    heading: '⚙️ How optimization works',
    body: (
      <HiwList items={[
        'Pick a date + the crews you want to dispatch.',
        'Stops auto-load from jobs scheduled that day (assigned + unassigned).',
        'Click ✨ Optimize — each crew gets a balanced share with a workday window.',
        'Drag any stop to a different crew or reorder by hand if needed.',
        'Save creates one route per crew. Dispatch sends crews their stop list.',
      ]} />
    ),
  },
  {
    heading: '🎯 Tips',
    body: (
      <HiwList items={[
        'Stops with a stored client lat/lng skip live geocoding — set those in the client profile.',
        'The depot defaults to your company address. Set it in Settings to control return-to-base routing.',
        'After optimizing you can still drag stops between crews — geometry rebuilds automatically.',
      ]} />
    ),
  },
  {
    heading: '🚨 Troubleshooting',
    body: (
      <HiwList items={[
        <><strong>All stops go to one crew?</strong> Make sure you selected 2+ crews; the optimizer balances within selected vehicles only.</>,
        <><strong>Some stops are unassigned?</strong> Their address didn&apos;t geocode. Open the client and add a service address that Mapbox recognizes.</>,
        <><strong>Optimize fails?</strong> Check that ORS_API_KEY is set in Vercel and that stops have valid coordinates.</>,
      ]} />
    ),
  },
];

export const HowRoutesWorks = () => (
  <HowItWorks
    label="How Routes Work"
    title="How Routes Work"
    subtitle="Optimize and dispatch a day of jobs."
    sections={ROUTES_SECTIONS}
  />
);

// ── Schedule ─────────────────────────────────────────────────────────────
const SCHEDULE_SECTIONS: HowItWorksSection[] = [
  {
    heading: '📅 What this page does',
    body: (
      <p>
        The Schedule is a drag-and-drop grid of crews × time. Drop a job onto
        a crew lane and that crew is now assigned for that date.
      </p>
    ),
  },
  {
    heading: '🖱️ Drag and drop',
    body: (
      <HiwList items={[
        'Day / Week / Month toggle at the top changes the time horizon.',
        'Drag a job between cells to reassign or reschedule.',
        'Drop into the gray Unassigned lane to clear a crew without losing the date.',
        'Click any job to open its detail page.',
      ]} />
    ),
  },
  {
    heading: '🔁 Recurring jobs',
    body: (
      <p>
        Jobs flagged with a recurrence rule (weekly, biweekly, monthly) auto-
        generate future occurrences when you mark the current one complete.
        Edit the rule on the job detail page.
      </p>
    ),
  },
  {
    heading: '🚨 Troubleshooting',
    body: (
      <HiwList items={[
        <><strong>Job won&apos;t drop?</strong> The target cell may be in the past — the schedule blocks back-dating.</>,
        <><strong>Crew lane is missing?</strong> Make sure the crew is marked Active in <strong>Crews</strong>.</>,
      ]} />
    ),
  },
];

export const HowScheduleWorks = () => (
  <HowItWorks
    label="How the Schedule Works"
    title="How the Schedule Works"
    subtitle="Drag-and-drop assignments by crew × day."
    sections={SCHEDULE_SECTIONS}
  />
);

// ── Forms ────────────────────────────────────────────────────────────────
const FORMS_SECTIONS: HowItWorksSection[] = [
  {
    heading: '📋 What this page does',
    body: (
      <p>
        Build custom forms — checklists, inspections, sign-offs, chemical
        applications — that crews fill out on their phones from the job page.
      </p>
    ),
  },
  {
    heading: '🛠️ Field types',
    body: (
      <HiwList items={[
        'Short text / long text',
        'Number (with optional unit)',
        'Yes / no toggle',
        'Single-choice and multi-choice',
        'Photo (camera capture, multiple)',
        'Signature (canvas)',
      ]} />
    ),
  },
  {
    heading: '⏱ Pre / Post / On-demand',
    body: (
      <HiwList items={[
        <><strong>Pre-job:</strong> required before the crew can tap Start.</>,
        <><strong>Post-job:</strong> required before the crew can tap Complete.</>,
        <><strong>On-demand:</strong> crew can fill anytime; great for incident reports.</>,
      ]} />
    ),
  },
  {
    heading: '🚨 Troubleshooting',
    body: (
      <HiwList items={[
        <><strong>Form not appearing on a job?</strong> Confirm the form is Active and either company-wide or attached to that specific job.</>,
        <><strong>Photos not uploading?</strong> Worker may be on poor signal — submissions queue and retry once back online.</>,
      ]} />
    ),
  },
];

export const HowFormsWorks = () => (
  <HowItWorks
    label="How Forms Work"
    title="How Forms Work"
    subtitle="Build it once, fill it forever."
    sections={FORMS_SECTIONS}
  />
);

// ── Profitability ───────────────────────────────────────────────────────
const PROFITABILITY_SECTIONS: HowItWorksSection[] = [
  {
    heading: '💰 What this page does',
    body: (
      <p>
        Per-job and per-client cost-vs-revenue, factoring labor, materials,
        equipment, and a configurable overhead rate. Sort by lowest margin
        to find work that&apos;s losing money.
      </p>
    ),
  },
  {
    heading: '🧮 How margins are calculated',
    body: (
      <HiwList items={[
        <><strong>Labor cost</strong> = sum of (crew member hourly × clocked hours × (1 + labor burden %)).</>,
        <><strong>Materials + equipment</strong> = manually entered on each job&apos;s Costing tab.</>,
        <><strong>Overhead</strong> = revenue × company.overhead_pct (default 15%).</>,
        <><strong>Profit</strong> = revenue − (labor + materials + equipment + overhead).</>,
        <><strong>Margin %</strong> = profit ÷ revenue × 100.</>,
      ]} />
    ),
  },
  {
    heading: '✅ What you need for accuracy',
    body: (
      <HiwList items={[
        'Crew members have hourly rates set on the crew detail page.',
        'Crews actually clock in/out (otherwise labor is $0).',
        'Materials + equipment costs entered on each job.',
        'Overhead % set in Settings → Job Costing.',
        'Job has either a linked invoice or a manually-entered revenue value.',
      ]} />
    ),
  },
  {
    heading: '🚨 Troubleshooting',
    body: (
      <HiwList items={[
        <><strong>Margins look wrong?</strong> Open the job&apos;s Costing tab — the breakdown shows exactly where each dollar comes from.</>,
        <><strong>$0 labor?</strong> The crew didn&apos;t clock in/out for that job.</>,
      ]} />
    ),
  },
];

export const HowProfitabilityWorks = () => (
  <HowItWorks
    label="How Profitability Works"
    title="How Profitability Works"
    subtitle="Job-level cost vs. revenue, plain math."
    sections={PROFITABILITY_SECTIONS}
  />
);

// ── Proposals ───────────────────────────────────────────────────────────
const PROPOSALS_SECTIONS: HowItWorksSection[] = [
  {
    heading: '🧾 What this page does',
    body: (
      <p>
        Build estimates and contracts. Pick a client, add line items from
        your service catalog (or write custom ones), preview the PDF, and
        send.
      </p>
    ),
  },
  {
    heading: '🔢 Pricing knobs',
    body: (
      <HiwList items={[
        <><strong>Frequency discount:</strong> weekly clients get a discount per visit; the math is configurable per service.</>,
        <><strong>Complexity multiplier:</strong> simple/moderate/complex bumps labor by a fixed %.</>,
        <><strong>Per-visit vs. per-month:</strong> billing mode controls how the line is invoiced and how the annual value rolls up.</>,
        <><strong>Custom line items:</strong> not in the catalog? Add a one-off — it doesn&apos;t pollute your catalog.</>,
      ]} />
    ),
  },
  {
    heading: '🎯 Common workflows',
    body: (
      <HiwList items={[
        'Cold lead → use Property Measurement → Generate Proposal directly.',
        'Existing client → New Proposal, pick the client, copy from a previous proposal if similar.',
        'Approved → click Convert to Job(s) — recurring contracts spawn the right job cadence.',
      ]} />
    ),
  },
];

export const HowProposalsWorks = () => (
  <HowItWorks
    label="How Proposals Work"
    title="How Proposals Work"
    subtitle="From estimate to signed contract."
    sections={PROPOSALS_SECTIONS}
  />
);

// ── Property Measurement ────────────────────────────────────────────────
const MEASURE_SECTIONS: HowItWorksSection[] = [
  {
    heading: '📐 What this page does',
    body: (
      <p>
        Type an address, draw the lawn / beds / hardscape on the map, and
        get instant square footage. Save to a client or generate a proposal
        in two clicks.
      </p>
    ),
  },
  {
    heading: '✏️ Drawing',
    body: (
      <HiwList items={[
        'Click points around the area to outline a polygon. Double-click to close.',
        'Pick a type per shape: turf (mowable), beds, hardscape, other.',
        'Lines (driveways, edging) use the line tool — measured in linear feet.',
        'Use Undo to remove the last shape; click any shape to delete or relabel.',
      ]} />
    ),
  },
  {
    heading: '💾 Three save paths',
    body: (
      <HiwList items={[
        <><strong>Save to client:</strong> attaches the measurement + map snapshot to a specific client.</>,
        <><strong>Save standalone:</strong> for cold leads — measurement persists with just an address.</>,
        <><strong>Generate proposal:</strong> jumps straight into the proposal wizard with totals pre-filled.</>,
      ]} />
    ),
  },
  {
    heading: '🚨 Troubleshooting',
    body: (
      <HiwList items={[
        <><strong>Map won&apos;t load?</strong> Check NEXT_PUBLIC_MAPBOX_TOKEN is set; the address bar geocodes via Mapbox.</>,
        <><strong>Square footage looks off?</strong> Make sure your polygon is closed (double-click the last point) and you&apos;re zoomed in enough to trace accurately.</>,
      ]} />
    ),
  },
];

export const HowMeasureWorks = () => (
  <HowItWorks
    label="How Property Measurement Works"
    title="How Property Measurement Works"
    subtitle="Address → polygons → instant square footage."
    sections={MEASURE_SECTIONS}
  />
);
