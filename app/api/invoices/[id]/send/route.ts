import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { sendEmail, brandedEmail, emailConfigured } from '@/lib/email';
import { notifyCustomer } from '@/lib/notify';

/**
 * "Send invoice": emails the customer a branded message with a portal link,
 * marks the invoice sent, and drops an in-app portal notification. Returns
 * { emailed: false, reason: 'no-provider' | 'no-email' } when it could not
 * email, so the dashboard can fall back to the mailto flow.
 */
function money(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('company_id, role').eq('id', user.id).single();
  if (!profile || !['owner', 'dispatcher'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, company_id, invoice_number, status, balance_due, total, due_date, client:clients(name, email)')
    .eq('id', id)
    .single();
  if (!invoice || invoice.company_id !== profile.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const client = invoice.client as { name?: string; email?: string | null } | null;
  const { data: company } = await supabase
    .from('companies').select('name, email, phone').eq('id', profile.company_id).single();
  const companyName = company?.name ?? 'Our team';

  const origin = new URL(req.url).origin;
  const portalUrl = `${origin}/portal/invoices/${invoice.id}`;
  const now = new Date().toISOString();

  let emailed = false;
  let reason: 'no-provider' | 'no-email' | 'send-failed' | null = null;
  if (!emailConfigured()) reason = 'no-provider';
  else if (!client?.email) reason = 'no-email';
  else {
    const firstName = client.name?.split(' ')[0] ?? 'there';
    const { html, text } = brandedEmail({
      companyName,
      heading: `Invoice ${invoice.invoice_number} from ${companyName}`,
      lines: [
        `Hi ${firstName},`,
        `Your invoice ${invoice.invoice_number} is ready: ${money(Number(invoice.balance_due))} due${invoice.due_date ? ` by ${invoice.due_date}` : ''}.`,
        'You can review the details and your service history any time in your customer portal.',
      ],
      cta: { label: 'View invoice', url: portalUrl },
      note: [company?.phone, company?.email].filter(Boolean).length
        ? `Questions? Reach us at ${[company?.phone, company?.email].filter(Boolean).join(' · ')}.`
        : null,
    });
    const result = await sendEmail({
      to: client.email,
      subject: `Invoice ${invoice.invoice_number} from ${companyName}`,
      html,
      text,
      replyTo: company?.email ?? null,
    });
    emailed = result.ok;
    if (!result.ok) reason = 'send-failed';
  }

  // Mark sent regardless: the dashboard falls back to mailto when we
  // couldn't email, and the staff member is still "sending" it.
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'sent', sent_at: now, updated_at: now })
    .eq('id', id)
    .eq('status', 'draft');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: clientRow } = await supabase.from('invoices').select('client_id').eq('id', id).single();
    if (clientRow?.client_id) {
      await notifyCustomer(admin, {
        clientId: clientRow.client_id,
        type: 'invoice_ready',
        title: `Invoice ${invoice.invoice_number} is ready`,
        body: `${money(Number(invoice.balance_due))} due${invoice.due_date ? ` by ${invoice.due_date}` : ''}.`,
        entityType: 'invoice',
        entityId: invoice.id,
      });
    }
  }

  return NextResponse.json({ ok: true, emailed, reason, portalUrl });
}
