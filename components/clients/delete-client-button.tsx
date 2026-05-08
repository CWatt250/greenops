'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

interface Props {
  clientId: string;
  clientName: string;
  jobCount: number;
}

export function DeleteClientButton({ clientId, clientName, jobCount }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  async function handleDelete() {
    const { error } = await supabase.from('clients').delete().eq('id', clientId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${clientName} deleted.`);
    router.push('/dashboard/clients');
    router.refresh();
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
        onClick={() => setOpen(true)}
        aria-label="Delete client"
        title="Delete client"
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${clientName}?`}
        description={
          jobCount > 0
            ? `This will also delete all ${jobCount} job${jobCount === 1 ? '' : 's'}, line items, and any messaging history with this client. This cannot be undone — consider marking the client inactive instead.`
            : 'This permanently removes the client. This cannot be undone.'
        }
        confirmLabel="Delete client"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}
