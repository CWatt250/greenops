'use client';

import Link from 'next/link';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Briefcase, ClipboardCheck, ClipboardList, Wrench, UsersRound, Map,
  RadioTower, Wallet, FileText, BarChart2, DollarSign, Globe, Settings,
  LogOut, Loader2,
} from 'lucide-react';
import { useState } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: 'owner' | 'dispatcher' | 'crew' | 'customer' | null;
}

interface SectionLink {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface Section {
  heading: string;
  items: SectionLink[];
}

const ADMIN_SECTIONS: Section[] = [
  {
    heading: 'Records',
    items: [
      { label: 'Jobs',     href: '/dashboard/jobs',     icon: Briefcase },
      { label: 'Forms',    href: '/dashboard/forms',    icon: ClipboardList },
      { label: 'Crews',    href: '/dashboard/crews',    icon: UsersRound },
      { label: 'Services', href: '/dashboard/services', icon: Wrench },
    ],
  },
  {
    heading: 'Field',
    items: [
      { label: 'Routes',   href: '/dashboard/routes',  icon: Map },
      { label: 'Dispatch', href: '/dashboard/crew',    icon: RadioTower },
    ],
  },
  {
    heading: 'Money',
    items: [
      { label: 'Proposals', href: '/dashboard/proposals', icon: ClipboardCheck },
      { label: 'Invoices',  href: '/dashboard/invoices',  icon: FileText },
      { label: 'Billing',   href: '/dashboard/billing',   icon: Wallet },
    ],
  },
  {
    heading: 'Insight',
    items: [
      { label: 'Analytics',     href: '/dashboard/analytics',     icon: BarChart2 },
      { label: 'Profitability', href: '/dashboard/profitability', icon: DollarSign },
      { label: 'Portal Inbox',  href: '/dashboard/portal-admin',  icon: Globe },
      { label: 'Settings',      href: '/dashboard/settings',      icon: Settings },
    ],
  },
];

const CREW_SECTIONS: Section[] = [];

export function MobileMoreDrawer({ open, onOpenChange, role }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [signingOut, setSigningOut] = useState(false);

  if (role === 'customer' || role === null) return null;

  const sections = role === 'crew' ? CREW_SECTIONS : ADMIN_SECTIONS;

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    onOpenChange(false);
    router.push('/login');
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>More</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {sections.map((s) => (
            <section key={s.heading}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                {s.heading}
              </p>
              <ul className="grid grid-cols-2 gap-2">
                {s.items.map(({ label, href, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => onOpenChange(false)}
                      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-3 text-sm font-medium hover:bg-accent/40"
                    >
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-md shrink-0"
                        style={{ backgroundColor: 'var(--orange-soft)', color: 'var(--orange-deep)' }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <Button
            type="button"
            variant="ghost"
            onClick={signOut}
            disabled={signingOut}
            className="w-full gap-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          >
            {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
