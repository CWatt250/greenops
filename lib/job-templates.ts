// Helpers for the job-template system (migration 042).
//
// A template captures the *configuration* of a recurring or repeated job at
// a single client property — service, duration, line items, time window,
// notes, default crew — without binding to a specific calendar date. From
// the client detail page, Trent picks a template and spawns a new draft
// job with everything pre-filled.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobTemplate, JobTemplateLineItem } from '@/types';

export interface SaveTemplateInput {
  company_id: string;
  client_id: string;
  name: string;
  service_id: string | null;
  title: string | null;
  notes: string | null;
  customer_notes: string | null;
  estimated_duration_minutes: number | null;
  time_window_start: string | null;
  time_window_end: string | null;
  default_crew_id: string | null;
  default_line_items: JobTemplateLineItem[];
  created_by: string | null;
}

export async function saveJobAsTemplate(
  supabase: SupabaseClient,
  input: SaveTemplateInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('job_templates')
    .insert(input)
    .select('id')
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Failed to save template' };
  }
  return { ok: true, id: data.id as string };
}

export async function incrementTemplateUsage(
  supabase: SupabaseClient,
  templateId: string,
): Promise<void> {
  // Atomic update via RPC — avoids the read-modify-write race when two
  // crews spawn the same template within the same second.
  await supabase.rpc('increment_template_usage', { p_template_id: templateId });
}

/** Build the initial form values for a new job from a template. The caller
 *  is responsible for adding the route-specific bits (date, crew override,
 *  status). */
export function templateToJobDraft(t: JobTemplate): {
  title: string;
  notes: string;
  customer_notes: string;
  estimated_duration_minutes: number | null;
  time_window_start: string | null;
  time_window_end: string | null;
  default_crew_id: string | null;
  line_items: JobTemplateLineItem[];
} {
  return {
    title: t.title?.trim() || t.name,
    notes: t.notes ?? '',
    customer_notes: t.customer_notes ?? '',
    estimated_duration_minutes: t.estimated_duration_minutes ?? null,
    time_window_start: t.time_window_start ?? null,
    time_window_end: t.time_window_end ?? null,
    default_crew_id: t.default_crew_id ?? null,
    line_items: Array.isArray(t.default_line_items) ? t.default_line_items : [],
  };
}
