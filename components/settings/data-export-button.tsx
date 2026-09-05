'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/** Settings → Your data: owner-only full export as a ZIP of CSVs. */
export function DataExportButton() {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const res = await fetch('/api/export');
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? 'Export failed.'); return; }
      const blob = await res.blob();
      const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'data-export.zip';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success('Export downloaded.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" size="sm" variant="outline" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
      {busy ? 'Building your export…' : 'Download all my data (.zip)'}
    </Button>
  );
}
