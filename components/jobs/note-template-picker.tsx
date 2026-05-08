'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Sticker } from 'lucide-react';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { NoteTemplate } from '@/types';

interface Props {
  /**
   * Either inserts (appends) the template body, or replaces the field
   * entirely. Caller decides per onApply impl.
   */
  onApply: (body: string) => void;
}

export function NoteTemplatePicker({ onApply }: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    supabase
      .from('note_templates')
      .select('*')
      .order('label')
      .then(({ data }) => {
        setTemplates((data ?? []) as NoteTemplate[]);
        setLoaded(true);
      });
  }, [open, loaded, supabase]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors',
        )}
        type="button"
      >
        <Sticker className="h-3 w-3" />
        Apply template
        <ChevronDown className="h-3 w-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={4} className="w-72 p-1.5 max-h-[280px] overflow-y-auto">
        {!loaded ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            No templates yet. Add some in <span className="font-medium">Settings → Note Templates</span>.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    onApply(t.body);
                    setOpen(false);
                  }}
                  className="w-full text-left rounded-md px-2 py-1.5 hover:bg-accent/60"
                >
                  <p className="text-xs font-semibold">{t.label}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{t.body}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
