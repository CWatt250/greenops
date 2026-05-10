import Link from 'next/link';
import {
  ClipboardCheck, Receipt, UserPlus, Map, RadioTower, CalendarDays, Ruler,
} from 'lucide-react';

const ACTIONS = [
  { label: 'New estimate',           icon: ClipboardCheck, href: '/dashboard/proposals/new' },
  { label: 'New invoice',            icon: Receipt,        href: '/dashboard/invoices/new' },
  { label: 'Add client',             icon: UserPlus,       href: '/dashboard/clients/new' },
  { label: 'Build route',            icon: Map,            href: '/dashboard/routes/new' },
  { label: 'Dispatch crew',          icon: RadioTower,     href: '/dashboard/crew' },
  { label: "View today's schedule",  icon: CalendarDays,   href: '/dashboard/schedule?view=day' },
] as const;

export function QuickActionsGrid() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b">
        <h2
          className="text-base uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-display), Impact, sans-serif', fontWeight: 400 }}
        >
          Quick actions
        </h2>
      </div>
      <div className="p-3 space-y-2">
        {/* Measure leads — it's the in-the-field anchor for any sales
         *  conversation. Spans the full row on mobile + sits big at the
         *  top of the desktop grid. */}
        <Link
          href="/dashboard/measure"
          className="group flex items-center gap-3 rounded-xl px-4 py-4 font-semibold transition-all border-2 hover:shadow-md"
          style={{
            backgroundColor: 'var(--orange)',
            color: '#fff',
            borderColor: 'var(--orange-deep, #D14816)',
          }}
        >
          <span
            className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0 bg-white/20"
          >
            <Ruler className="h-6 w-6" />
          </span>
          <span className="flex-1">
            <span className="block text-base">Measure property</span>
            <span className="block text-[11px] font-normal opacity-90">
              Pull up satellite, draw the lawn, generate a quote
            </span>
          </span>
        </Link>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ACTIONS.map(({ label, icon: Icon, href }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-accent/40 hover:border-[var(--orange)] border border-transparent transition-all"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0 transition-colors"
                style={{ backgroundColor: 'var(--orange-soft)', color: 'var(--orange-deep)' }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
