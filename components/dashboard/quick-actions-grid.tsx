import Link from 'next/link';
import {
  ClipboardCheck, Receipt, UserPlus, Map, RadioTower, CalendarDays,
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
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
  );
}
