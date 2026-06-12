import { NextResponse } from 'next/server';
import { localDateStr } from '@/lib/dates';
import { createClient as createAdminClient } from '@supabase/supabase-js';

/**
 * Vercel Cron — runs daily at 06:00 UTC (see vercel.json).
 *
 * Walks every active billing_schedules row whose next_invoice_date is
 * today or earlier and:
 *   1. Creates an invoice from the linked job's line items (or template
 *      notes when there's no job).
 *   2. Advances next_invoice_date by the schedule's RRULE (very simple
 *      cadence — weekly/biweekly/monthly/yearly).
 *   3. Stamps last_generated_at.
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}. We require
 * it (or "Run now" callers can pass the same header). The endpoint also
 * requires the SUPABASE_SERVICE_ROLE_KEY to insert across companies.
 */

interface Schedule {
  id: string;
  company_id: string;
  client_id: string;
  job_id: string | null;
  recurrence_rule: string;
  next_invoice_date: string | null;
  template_notes: string | null;
  last_generated_at: string | null;
  auto_send: boolean;
}

function dayMsUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).getTime();
}

function todayUTC() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Tiny RRULE → next-date advancer. Supports the common cadences the
 *  proposal builder produces; unknowns advance by 1 month as a safe
 *  default so we don't loop forever. */
function advance(date: Date, rrule: string): Date {
  const r = rrule.toUpperCase();
  const d = new Date(date);
  if (r.includes('FREQ=WEEKLY')) {
    const interval = matchInt(r, /INTERVAL=(\d+)/) ?? 1;
    d.setUTCDate(d.getUTCDate() + 7 * interval);
  } else if (r.includes('FREQ=DAILY')) {
    const interval = matchInt(r, /INTERVAL=(\d+)/) ?? 1;
    d.setUTCDate(d.getUTCDate() + interval);
  } else if (r.includes('FREQ=YEARLY')) {
    const interval = matchInt(r, /INTERVAL=(\d+)/) ?? 1;
    d.setUTCFullYear(d.getUTCFullYear() + interval);
  } else {
    // Default to monthly.
    const interval = matchInt(r, /INTERVAL=(\d+)/) ?? 1;
    d.setUTCMonth(d.getUTCMonth() + interval);
  }
  return d;
}

function matchInt(s: string, re: RegExp): number | null {
  const m = s.match(re);
  return m ? Number(m[1]) : null;
}

export async function POST(req: Request) {
  return run(req);
}
export async function GET(req: Request) {
  // Vercel Cron uses GET. Support both.
  return run(req);
}

async function run(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Server env missing' }, { status: 500 });
  }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const today = localDateStr();

  const { data: dueRaw, error: dueErr } = await admin
    .from('billing_schedules')
    .select('id, company_id, client_id, job_id, recurrence_rule, next_invoice_date, template_notes, last_generated_at, auto_send')
    .eq('is_active', true)
    .lte('next_invoice_date', today);
  if (dueErr) {
    return NextResponse.json({ error: dueErr.message }, { status: 500 });
  }
  const due = (dueRaw ?? []) as Schedule[];

  const results: Array<{
    schedule_id: string;
    invoice_id?: string;
    invoice_number?: string;
    error?: string;
  }> = [];

  for (const s of due) {
    try {
      // Resolve line items: prefer the linked job's services spine; otherwise
      // create a single placeholder line item using template_notes.
      type LineItemSeed = { description: string; quantity: number; unit_price: number; total: number };
      let seedItems: LineItemSeed[] = [];
      if (s.job_id) {
        const { data: jobServices } = await admin
          .from('job_services')
          .select('custom_name, quantity, price, service:services(name)')
          .eq('job_id', s.job_id)
          .order('sort_order');
        type SvcRow = {
          custom_name: string | null;
          quantity: number | null;
          price: number | null;
          service?: { name: string | null } | null;
        };
        seedItems = ((jobServices ?? []) as unknown as SvcRow[]).map((js) => {
          const quantity = Number(js.quantity ?? 1);
          const unit_price = Number(js.price ?? 0);
          return {
            description: js.custom_name || js.service?.name || 'Recurring service',
            quantity,
            unit_price,
            total: unit_price * quantity,
          };
        });
      }
      if (seedItems.length === 0) {
        seedItems = [{
          description: s.template_notes ?? 'Recurring service',
          quantity: 1,
          unit_price: 0,
          total: 0,
        }];
      }

      const subtotal = seedItems.reduce((acc, li) => acc + Number(li.total ?? 0), 0);
      const taxRate = 0; // schedules don't currently carry a tax rate
      const taxAmount = 0;
      const total = subtotal + taxAmount;

      // Issue the next invoice number atomically via the per-company counter.
      const { data: invNumRaw } = await admin
        .rpc('next_invoice_number', { p_company_id: s.company_id });
      const invoiceNumber = (invNumRaw as string) ?? `INV-${Date.now()}`;
      const issued = localDateStr();
      const due = new Date(); due.setDate(due.getDate() + 30);
      const dueDate = localDateStr(due);

      const { data: invoice, error: invErr } = await admin
        .from('invoices')
        .insert({
          company_id: s.company_id,
          client_id: s.client_id,
          job_id: s.job_id,
          invoice_number: invoiceNumber,
          status: s.auto_send ? 'sent' : 'draft',
          issued_date: issued,
          due_date: dueDate,
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total,
          amount_paid: 0,
          balance_due: total,
          notes: s.template_notes,
        })
        .select('id')
        .single();
      if (invErr || !invoice) throw new Error(invErr?.message ?? 'invoice insert failed');

      // Insert line items. `total` is a generated column — never write it.
      if (seedItems.length > 0) {
        await admin.from('invoice_line_items').insert(
          seedItems.map((li, idx) => ({
            invoice_id: invoice.id,
            description: li.description,
            quantity: li.quantity,
            unit_price: li.unit_price,
            sort_order: idx,
          })),
        );
      }

      // Advance the schedule.
      const baseDate = s.next_invoice_date
        ? new Date(`${s.next_invoice_date}T00:00:00Z`)
        : todayUTC();
      // If we're catching up on multiple missed periods, advance until
      // strictly after today so we don't fire again tomorrow morning.
      let nextDate = advance(baseDate, s.recurrence_rule);
      const todayMs = dayMsUTC(todayUTC());
      while (dayMsUTC(nextDate) <= todayMs) {
        nextDate = advance(nextDate, s.recurrence_rule);
      }
      await admin
        .from('billing_schedules')
        .update({
          // nextDate is UTC-anchored (advanceByRRule / addMonthsUTC build it
          // via Date.UTC), so the UTC slice recovers the exact date-only
          // value on any machine — do NOT convert to localDateStr().
          next_invoice_date: nextDate.toISOString().slice(0, 10),
          last_generated_at: new Date().toISOString(),
        })
        .eq('id', s.id);

      results.push({ schedule_id: s.id, invoice_id: invoice.id, invoice_number: invoiceNumber });
    } catch (err) {
      results.push({ schedule_id: s.id, error: (err as Error).message ?? 'failed' });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
