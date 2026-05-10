'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tiny offline mutation queue for crew mobile flows. iOS Safari doesn't
 * support the Background Sync API, so we use localStorage + the window
 * online event instead. Drains every queued item on reconnect; failures
 * stay queued for the next try.
 *
 * Limited to mutations that don't depend on a successful Storage upload
 * (clock-in, issue-flag). Job completion can't be queued — photos need
 * to land in Storage first, which requires a connection.
 */

const KEY = 'tlc.offline.queue.v1';

export type QueueAction =
  | { kind: 'clock_in'; payload: ClockInPayload }
  | { kind: 'flag_issue'; payload: FlagIssuePayload };

export interface ClockInPayload {
  job_id: string;
  company_id: string;
  profile_id: string;
  latitude: number | null;
  longitude: number | null;
  /** Whether the in-memory job state was already 'in_progress' or
   *  needs to be promoted on replay. */
  promote_to_in_progress: boolean;
}

export interface FlagIssuePayload {
  job_id: string;
  notes: string;
  flagged_by: string;
}

interface QueuedItem {
  id: string;
  queued_at: number;
  action: QueueAction;
}

function readQueue(): QueuedItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage full — silently drop. Beats throwing in the click handler.
  }
}

export function queueLength(): number {
  return readQueue().length;
}

/** Push a mutation onto the local queue. Returns immediately; the caller
 *  should already have surfaced an "offline — will sync" toast. */
export function enqueue(action: QueueAction) {
  const items = readQueue();
  items.push({
    id: crypto.randomUUID(),
    queued_at: Date.now(),
    action,
  });
  writeQueue(items);
}

/** Drain the queue against Supabase. Called on `window.online` and on
 *  initial mount when navigator.onLine is true. Items that fail are kept
 *  for the next attempt. Returns the count successfully replayed. */
export async function drainQueue(supabase: SupabaseClient): Promise<number> {
  const items = readQueue();
  if (items.length === 0) return 0;

  const remaining: QueuedItem[] = [];
  let replayed = 0;

  for (const item of items) {
    const ok = await replayOne(item, supabase);
    if (ok) {
      replayed += 1;
    } else {
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  return replayed;
}

async function replayOne(item: QueuedItem, supabase: SupabaseClient): Promise<boolean> {
  try {
    if (item.action.kind === 'clock_in') {
      const p = item.action.payload;
      const { error } = await supabase.from('clock_events').insert({
        company_id: p.company_id,
        job_id: p.job_id,
        profile_id: p.profile_id,
        event_type: 'clock_in',
        latitude: p.latitude,
        longitude: p.longitude,
      });
      if (error) return false;
      if (p.promote_to_in_progress) {
        await supabase
          .from('jobs')
          .update({
            status: 'in_progress',
            actual_start: new Date(item.queued_at).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', p.job_id);
      }
      return true;
    }
    if (item.action.kind === 'flag_issue') {
      const p = item.action.payload;
      const { error } = await supabase
        .from('jobs')
        .update({
          status: 'issue',
          issue_notes: p.notes,
          issue_flagged_at: new Date(item.queued_at).toISOString(),
          issue_flagged_by: p.flagged_by,
          updated_at: new Date().toISOString(),
        })
        .eq('id', p.job_id);
      return !error;
    }
    return true;
  } catch {
    return false;
  }
}
