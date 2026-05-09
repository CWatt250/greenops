'use client';

import { ReactNode, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';

export interface HowItWorksSection {
  /** Emoji + heading rendered in uppercase. */
  heading: string;
  /** Body content. Strings are rendered as paragraphs; nested arrays as bullets. */
  body: ReactNode;
}

interface Props {
  /** Visible label on the trigger button, e.g. "How Dispatch Works". */
  label: string;
  /** Title shown at the top of the drawer. Defaults to `label`. */
  title?: string;
  /** Short subtitle under the title. */
  subtitle?: string;
  sections: HowItWorksSection[];
  /** Optional CTA button rendered at the bottom of the drawer. */
  footerCta?: ReactNode;
  /** Trigger style. "ghost" is for compact spots like page headers. */
  variant?: 'ghost' | 'outline';
  /** Hide the visible label on the trigger and render an icon-only button.
   *  Used when the page header has no room for a full button. */
  iconOnly?: boolean;
}

export function HowItWorks({
  label,
  title,
  subtitle,
  sections,
  footerCta,
  variant = 'ghost',
  iconOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={variant}
        onClick={() => setOpen(true)}
        className="gap-1.5"
        title={label}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        {!iconOnly && <span>{label}</span>}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{title ?? label}</SheetTitle>
            {subtitle && <SheetDescription>{subtitle}</SheetDescription>}
          </SheetHeader>

          <div className="mt-5 space-y-6 text-sm leading-relaxed">
            {sections.map((s, i) => (
              <section key={i}>
                <h3
                  className="text-[11px] font-bold uppercase tracking-[0.12em] mb-2"
                  style={{ color: 'var(--orange-deep)' }}
                >
                  {s.heading}
                </h3>
                <div className="space-y-2 text-foreground">{s.body}</div>
              </section>
            ))}
          </div>

          {footerCta && <div className="mt-6 pt-4 border-t">{footerCta}</div>}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Tiny helper for tight bullet lists used by HowItWorks content. */
export function HiwList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1 ml-1">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-muted-foreground" aria-hidden>•</span>
          <span className="flex-1">{it}</span>
        </li>
      ))}
    </ul>
  );
}
