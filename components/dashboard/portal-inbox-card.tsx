import Link from 'next/link';
import { FileText, Mail, Flag } from 'lucide-react';

export type PortalInboxKind = 'request' | 'message' | 'complaint';

export interface PortalInboxItem {
  id: string;
  kind: PortalInboxKind;
  /** Display name of the customer who sent it. */
  client: string;
  /** Short preview of the body / first message line. */
  preview: string;
  /** Relative time ("12 min ago", "2 hr ago"). Pre-formatted at the source. */
  relativeTime: string;
  /** Where clicking the row should navigate. */
  href: string;
}

interface Props {
  items: PortalInboxItem[];
}

const KIND_META: Record<PortalInboxKind, { Icon: React.ElementType; color: string; label: string }> = {
  request:   { Icon: FileText, color: 'var(--orange)',          label: 'Request' },
  message:   { Icon: Mail,     color: '#3B82F6',                label: 'Message' },
  complaint: { Icon: Flag,     color: '#EF4444',                label: 'Complaint' },
};

export function PortalInboxCard({ items }: Props) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 border-b">
        <h2
          className="text-base uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-display), Impact, sans-serif', fontWeight: 400 }}
        >
          Portal inbox
        </h2>
        <Link
          href="/dashboard/portal-admin"
          className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
        >
          View all
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8 px-4 italic">
          No new portal activity.
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => {
            const meta = KIND_META[item.kind];
            const Icon = meta.Icon;
            return (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={item.href}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-muted/40 transition-colors"
                >
                  <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: meta.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.client}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.preview}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                    {item.relativeTime}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
