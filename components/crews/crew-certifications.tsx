'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Loader2, ShieldCheck } from 'lucide-react';

type RestrictedService = { id: string; name: string };

/**
 * Crew certification checklist (migration 045). Lists only the RESTRICTED
 * services so the list stays short, and writes each toggle straight to
 * crew_skills — which restricted services this crew is certified for. Those
 * certifications become the crew's VROOM skills in the route optimizer.
 */
export function CrewCertifications({ crewId }: { crewId: string }) {
  const supabase = createClient();
  const [services, setServices] = useState<RestrictedService[]>([]);
  const [certified, setCertified] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [svcRes, certRes] = await Promise.all([
        supabase.from('services').select('id, name').eq('restricted', true).eq('is_active', true).order('name'),
        supabase.from('crew_skills').select('service_id').eq('crew_id', crewId),
      ]);
      if (cancelled) return;
      setServices((svcRes.data ?? []) as RestrictedService[]);
      setCertified(new Set(((certRes.data ?? []) as Array<{ service_id: string }>).map((r) => r.service_id)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [crewId, supabase]);

  async function toggle(serviceId: string, on: boolean) {
    setBusy(serviceId);
    if (on) {
      const { error } = await supabase.from('crew_skills').insert({ crew_id: crewId, service_id: serviceId });
      if (error) { toast.error(error.message); setBusy(null); return; }
      setCertified((p) => new Set(p).add(serviceId));
    } else {
      const { error } = await supabase.from('crew_skills').delete().eq('crew_id', crewId).eq('service_id', serviceId);
      if (error) { toast.error(error.message); setBusy(null); return; }
      setCertified((p) => { const n = new Set(p); n.delete(serviceId); return n; });
    }
    setBusy(null);
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden mt-6" data-testid="crew-certifications">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Certifications</p>
      </div>
      {loading ? (
        <div className="px-4 py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : services.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-4 py-6">
          No restricted services yet. Turn on “Restrict to certified crews” for a service to gate it.
        </p>
      ) : (
        <ul className="divide-y">
          {services.map((s) => (
            <li key={s.id} className="px-4 py-2.5 flex items-center justify-between">
              <label htmlFor={`cert-${s.id}`} className="text-sm cursor-pointer">{s.name}</label>
              <input
                id={`cert-${s.id}`}
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-[var(--orange)] cursor-pointer"
                checked={certified.has(s.id)}
                disabled={busy === s.id}
                onChange={(e) => toggle(s.id, e.target.checked)}
                aria-label={`Certify for ${s.name}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
