'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import type { RouteStatus } from '@/types';

interface Props {
  routeId: string;
  routeTitle: string;
  status: RouteStatus;
}

export function DeleteRouteButton({ routeId, routeTitle, status }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  async function handleDelete() {
    const { error } = await supabase.from('routes').delete().eq('id', routeId);
    if (error) { toast.error(error.message); return; }
    toast.success('Route deleted.');
    router.push('/dashboard/routes');
    router.refresh();
  }

  // Once a route has gone live we don't expose the destructive action by
  // default — the dispatcher should mark it complete or build a new one.
  if (status === 'in_progress' || status === 'complete') return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
        onClick={() => setOpen(true)}
        aria-label="Delete route"
        title="Delete route"
      >
        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete "${routeTitle}"?`}
        description="Removes this route and its stops. The underlying jobs are unchanged."
        confirmLabel="Delete route"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}
