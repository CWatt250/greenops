'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ClipboardList, Receipt, MessageCircle, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/portal', label: 'Home', icon: Home },
  { href: '/portal/jobs', label: 'Jobs', icon: ClipboardList },
  { href: '/portal/invoices', label: 'Invoices', icon: Receipt },
  { href: '/portal/messages', label: 'Messages', icon: MessageCircle },
  { href: '/portal/settings', label: 'Settings', icon: Settings },
];

export function PortalNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t safe-area-inset-bottom">
      <div className="flex items-center justify-around px-2 py-2 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/portal' ? pathname === '/portal' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[56px]',
                isActive ? 'text-white' : 'text-gray-500 hover:text-gray-700'
              )}
              style={isActive ? { backgroundColor: 'var(--color-brand-green-raw)' } : {}}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
