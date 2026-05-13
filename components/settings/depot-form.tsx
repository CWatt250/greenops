'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { geocodeAddress } from '@/lib/mapbox';

interface Props {
  companyId: string;
  initial: {
    depot_address: string | null;
    depot_latitude: number | null;
    depot_longitude: number | null;
  };
}

export function DepotForm({ companyId, initial }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [address, setAddress] = useState(initial.depot_address ?? '');
  const [lat, setLat] = useState<number | null>(initial.depot_latitude);
  const [lng, setLng] = useState<number | null>(initial.depot_longitude);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!address.trim()) {
      toast.error('Enter an address first.');
      return;
    }
    setSaving(true);
    try {
      const coords = await geocodeAddress(address.trim());
      if (!coords) {
        toast.error('Could not geocode that address. Double-check spelling.');
        setSaving(false);
        return;
      }
      const [lngVal, latVal] = coords;
      setLat(latVal);
      setLng(lngVal);

      const { error } = await supabase
        .from('companies')
        .update({
          depot_address: address.trim(),
          depot_latitude: latVal,
          depot_longitude: lngVal,
        })
        .eq('id', companyId);

      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }

      toast.success('Depot saved. Routes will now start and end here.');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? 'Unexpected error');
    } finally {
      setSaving(false);
    }
  }

  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Pin your shop/HQ. The route optimizer uses this as the start and end
        of every day, and the crew app shows the drive time from here to the
        first stop.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="depot-address">Depot address</Label>
        <Input
          id="depot-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="1053 S Highland Dr, Kennewick, WA 99337"
        />
      </div>
      {hasCoords && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          Pinned to {lat?.toFixed(5)}, {lng?.toFixed(5)}
        </p>
      )}
      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
        {saving ? 'Saving…' : 'Save depot'}
      </Button>
    </div>
  );
}
