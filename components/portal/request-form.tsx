'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServiceRequestType, Service } from '@/types';

const REQUEST_TYPES: Array<{ type: ServiceRequestType; icon: string; label: string }> = [
  { type: 'new_service', icon: '🌿', label: 'New Service' },
  { type: 'reschedule', icon: '📅', label: 'Reschedule' },
  { type: 'quote_request', icon: '💰', label: 'Get a Quote' },
  { type: 'cancel', icon: '❌', label: 'Cancel Service' },
  { type: 'seasonal', icon: '🍂', label: 'Seasonal' },
  { type: 'other', icon: '💬', label: 'Other' },
];

interface Props {
  clientId: string;
  companyId: string;
  portalUserId: string;
  services: Service[];
}

export function RequestForm({ clientId, companyId, portalUserId, services }: Props) {
  const supabase = createClient();
  const router = useRouter();

  const [type, setType] = useState<ServiceRequestType | null>(null);
  const [serviceId, setServiceId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type) { toast.error('Please select a request type.'); return; }
    if (!title.trim()) { toast.error('Please enter a title.'); return; }

    setSubmitting(true);

    const { data: req, error } = await supabase
      .from('service_requests')
      .insert({
        company_id: companyId,
        client_id: clientId,
        portal_user_id: portalUserId,
        type,
        service_id: serviceId || null,
        title: title.trim(),
        description: description.trim() || null,
        preferred_date: preferredDate || null,
        preferred_time: preferredTime || null,
      })
      .select('id')
      .single();

    if (error) { toast.error(error.message); setSubmitting(false); return; }

    // Notify admins
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('company_id', companyId)
      .in('role', ['owner', 'dispatcher']);

    if (admins?.length) {
      await supabase.from('notifications').insert(
        admins.map((a: { id: string }) => ({
          company_id: companyId,
          profile_id: a.id,
          title: `New service request: ${title}`,
          body: `From portal — ${REQUEST_TYPES.find((t) => t.type === type)?.label}`,
          entity_type: 'service_request',
          entity_id: req?.id,
        }))
      );
    }

    toast.success('Request submitted!');
    router.push('/portal/requests');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Type picker */}
      <div>
        <Label className="text-sm font-semibold block mb-3">What do you need?</Label>
        <div className="grid grid-cols-3 gap-2">
          {REQUEST_TYPES.map((rt) => (
            <button
              key={rt.type}
              type="button"
              onClick={() => { setType(rt.type); if (!title) setTitle(rt.label); }}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-xs font-medium transition-all',
                type === rt.type
                  ? 'border-transparent text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              )}
              style={type === rt.type ? { backgroundColor: 'var(--color-brand-green-raw)' } : {}}
            >
              <span className="text-xl">{rt.icon}</span>
              {rt.label}
            </button>
          ))}
        </div>
      </div>

      {type && (
        <>
          <div>
            <Label className="text-xs mb-1 block text-gray-600">Request Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of your request"
              className="rounded-xl bg-white border-gray-200"
              required
            />
          </div>

          {(type === 'new_service' || type === 'quote_request' || type === 'seasonal') && services.length > 0 && (
            <div>
              <Label className="text-xs mb-1 block text-gray-600">Service Type (optional)</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setServiceId('')}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                    !serviceId ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600'
                  )}
                  style={!serviceId ? { backgroundColor: 'var(--color-brand-green-raw)' } : {}}
                >
                  Any
                </button>
                {services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setServiceId(s.id)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                      serviceId === s.id ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600'
                    )}
                    style={serviceId === s.id ? { backgroundColor: 'var(--color-brand-green-raw)' } : {}}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs mb-1 block text-gray-600">Details (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any additional details or special instructions…"
              rows={3}
              className="rounded-xl bg-white border-gray-200 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block text-gray-600">Preferred Date</Label>
              <Input
                type="date"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                className="rounded-xl bg-white border-gray-200"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block text-gray-600">Preferred Time</Label>
              <Input
                type="time"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
                className="rounded-xl bg-white border-gray-200"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-xl text-white font-semibold gap-2"
            style={{ backgroundColor: 'var(--color-brand-gold-raw)' }}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit Request
          </Button>
        </>
      )}
    </form>
  );
}
