import { describe, it, expect } from 'vitest';
import { notifyStaff, notifyCustomer } from './notify';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Minimal stub of the two query chains notify() uses. */
function stubClient(opts: {
  staff?: Array<{ id: string }>;
  portalUsers?: Array<{ id: string }>;
  insertError?: boolean;
  onInsert?: (table: string, rows: unknown[]) => void;
}): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ in: async () => ({ data: opts.staff ?? [] }) }),
          }),
        };
      }
      if (table === 'portal_users') {
        return {
          select: () => ({ eq: async () => ({ data: opts.portalUsers ?? [] }) }),
        };
      }
      return {
        insert: async (rows: unknown[]) => {
          opts.onInsert?.(table, rows);
          return { error: opts.insertError ? { message: 'boom' } : null };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe('notifyStaff', () => {
  it('fans out to resolved staff, excluding the actor', async () => {
    let inserted: unknown[] = [];
    const client = stubClient({
      staff: [{ id: 'owner1' }, { id: 'disp1' }, { id: 'me' }],
      onInsert: (_t, rows) => { inserted = rows; },
    });
    const r = await notifyStaff(client, {
      companyId: 'c1', title: 'T', excludeProfileId: 'me',
    });
    expect(r.delivered).toBe(2);
    expect(inserted).toHaveLength(2);
    expect((inserted[0] as { profile_id: string }).profile_id).toBe('owner1');
  });

  it('never throws; returns 0 on insert failure or empty staff', async () => {
    expect((await notifyStaff(stubClient({ staff: [] }), { companyId: 'c', title: 'T' })).delivered).toBe(0);
    expect((await notifyStaff(stubClient({ staff: [{ id: 'a' }], insertError: true }), { companyId: 'c', title: 'T' })).delivered).toBe(0);
  });
});

describe('notifyCustomer', () => {
  it('resolves portal users from clientId', async () => {
    let table = '';
    const client = stubClient({
      portalUsers: [{ id: 'pu1' }, { id: 'pu2' }],
      onInsert: (t) => { table = t; },
    });
    const r = await notifyCustomer(client, { clientId: 'cl1', type: 'message', title: 'Hi' });
    expect(r.delivered).toBe(2);
    expect(table).toBe('portal_notifications');
  });

  it('direct portalUserId skips resolution', async () => {
    let rows: unknown[] = [];
    const client = stubClient({ onInsert: (_t, r) => { rows = r; } });
    const r = await notifyCustomer(client, { portalUserId: 'pu9', type: 'complaint_update', title: 'x' });
    expect(r.delivered).toBe(1);
    expect((rows[0] as { portal_user_id: string }).portal_user_id).toBe('pu9');
  });

  it('no target = 0 delivered, no throw', async () => {
    const r = await notifyCustomer(stubClient({}), { type: 'message', title: 'x' });
    expect(r.delivered).toBe(0);
  });
});
