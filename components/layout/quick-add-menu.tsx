'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Ruler, Briefcase, ClipboardCheck, FileText, UserPlus, X } from 'lucide-react';

const ITEMS = [
  { label: 'Measure new property', href: '/dashboard/measure',      icon: Ruler },
  { label: 'New job',              href: '/dashboard/jobs/new',     icon: Briefcase },
  { label: 'New proposal',         href: '/dashboard/proposals/new', icon: ClipboardCheck },
  { label: 'New invoice',          href: '/dashboard/invoices/new', icon: FileText },
  { label: 'Add client',           href: '/dashboard/clients/new',  icon: UserPlus },
];

/**
 * Top-right "+" menu in the mobile header. One tap surfaces the most
 * common create-something actions; Measure leads the list because it's
 * the in-the-field anchor.
 */
export function QuickAddMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full"
        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
        aria-label="Quick add"
      >
        <Plus className="h-4 w-4" />
      </button>

      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 z-[80] bg-black/30"
          aria-label="Close menu"
        />
      )}

      {open && (
        <div
          role="menu"
          className="md:hidden fixed top-16 right-3 z-[81] w-64 rounded-xl border bg-popover shadow-xl ring-1 ring-foreground/10 overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Quick add
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="py-1">
            {ITEMS.map(({ label, href, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent/40"
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md"
                    style={{ backgroundColor: 'var(--orange-soft)', color: 'var(--orange-deep)' }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
