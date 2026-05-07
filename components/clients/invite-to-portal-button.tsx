'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, UserPlus, CheckCircle2 } from 'lucide-react';

interface Props {
  clientId: string;
  clientName: string;
  email: string;
  hasPortalUser: boolean;
}

export function InviteToPortalButton({ clientId, clientName, email, hasPortalUser }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(hasPortalUser);

  if (done) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 border border-green-200">
        <CheckCircle2 className="h-4 w-4" />
        Portal Active
      </div>
    );
  }

  async function invite() {
    if (!email) {
      toast.error('This client has no email address on file.');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/portal/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, clientId, clientName }),
    });
    const json = await res.json() as { error?: string };
    if (!res.ok) {
      toast.error(json.error ?? 'Failed to send invite.');
    } else {
      toast.success(`Invite sent to ${email}`);
      setDone(true);
    }
    setLoading(false);
  }

  return (
    <Button variant="outline" onClick={invite} disabled={loading} className="gap-1.5">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
      Invite to Portal
    </Button>
  );
}
