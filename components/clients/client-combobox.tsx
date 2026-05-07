'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Plus, Home, Building2, Building } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { buttonVariants } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { cn, debounce } from '@/lib/utils';
import type { Client } from '@/types';

const propertyTypeIcon = {
  residential: Home,
  commercial: Building2,
  hoa: Building,
};

interface ClientComboboxProps {
  value?: string;
  onChange: (clientId: string, client: Client) => void;
  placeholder?: string;
}

export function ClientCombobox({ value, onChange, placeholder = 'Search clients…' }: ClientComboboxProps) {
  const supabase = createClient();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!value) return;
    supabase
      .from('clients')
      .select('*')
      .eq('id', value)
      .single()
      .then(({ data }) => {
        if (data) setSelectedClient(data as Client);
      });
  }, [value]);

  useEffect(() => {
    if (!open || query) return;
    setLoading(true);
    supabase
      .from('clients')
      .select('*')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setClients((data ?? []) as Client[]);
        setLoading(false);
      });
  }, [open, query]);

  const searchClients = useCallback(
    debounce(async (q: string) => {
      if (!q) return;
      setLoading(true);
      const { data } = await supabase
        .from('clients')
        .select('*')
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,service_address.ilike.%${q}%`)
        .limit(8);
      setClients((data ?? []) as Client[]);
      setLoading(false);
    }, 300),
    []
  );

  useEffect(() => {
    if (query) searchClients(query);
  }, [query, searchClients]);

  function handleSelect(client: Client) {
    setSelectedClient(client);
    onChange(client.id, client);
    setOpen(false);
    setQuery('');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'w-full justify-between font-normal'
        )}
        aria-expanded={open}
      >
        {selectedClient ? (
          <span className="truncate">{selectedClient.name}</span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name, phone, address…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
            ) : (
              <>
                <CommandEmpty className="py-4">
                  <p className="text-sm text-muted-foreground text-center mb-3">No clients found.</p>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        router.push('/clients/new');
                      }}
                      className={cn(buttonVariants({ size: 'sm' }))}
                      style={{ backgroundColor: 'var(--color-brand-gold-raw)', color: '#fff' }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add New Client
                    </button>
                  </div>
                </CommandEmpty>

                {clients.length > 0 && (
                  <CommandGroup heading={query ? 'Results' : 'Recent clients'}>
                    {clients.map((client) => {
                      const Icon = propertyTypeIcon[client.property_type] ?? Home;
                      return (
                        <CommandItem
                          key={client.id}
                          value={client.id}
                          onSelect={() => handleSelect(client)}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Check
                            className={cn(
                              'h-4 w-4 shrink-0',
                              selectedClient?.id === client.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{client.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{client.service_address}</p>
                          </div>
                          <span className="text-xs text-muted-foreground capitalize shrink-0">
                            {client.property_type}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
