'use client';

import Link from 'next/link';
import { Megaphone } from 'lucide-react';

interface Props {
  message: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

export function PortalBanner({ message, ctaLabel, ctaUrl }: Props) {
  const isExternal = ctaUrl?.startsWith('http://') || ctaUrl?.startsWith('https://');
  return (
    <div
      className="rounded-xl bg-[var(--orange-soft)] border-l-4 px-4 py-3 flex items-start gap-3"
      style={{ borderLeftColor: 'var(--orange)' }}
      role="region"
      aria-label="Announcement from TLC"
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-md shrink-0"
        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
      >
        <Megaphone className="h-4 w-4" />
      </div>
      <p
        className="flex-1 text-sm leading-relaxed whitespace-pre-wrap"
        style={{ color: 'var(--orange-deep)' }}
      >
        {message}
      </p>
      {ctaLabel && ctaUrl && (
        <div className="shrink-0">
          {isExternal ? (
            <a
              href={ctaUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--orange)' }}
            >
              {ctaLabel}
            </a>
          ) : (
            <Link
              href={ctaUrl}
              className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--orange)' }}
            >
              {ctaLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
