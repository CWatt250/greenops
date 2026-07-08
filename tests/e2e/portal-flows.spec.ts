import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadEnvTest } from './helpers/env';

const env = loadEnvTest();
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const CUSTOMER = { email: 'e2e-customer@tlc.com', password: 'e2e-customer-pass-123' };

/** Portal customer for the John Smith client — idempotent seed. */
async function seedCustomer(): Promise<{ portalUserId: string; clientId: string; companyId: string }> {
  const { data: client } = await admin
    .from('clients').select('id, company_id').eq('name', 'John Smith').limit(1).maybeSingle();
  expect(client, 'John Smith client must exist').toBeTruthy();
  let uid: string | undefined;
  const { data: created, error } = await admin.auth.admin.createUser({
    email: CUSTOMER.email, password: CUSTOMER.password, email_confirm: true,
  });
  uid = created?.user?.id;
  if (error) {
    const { data: list } = await admin.auth.admin.listUsers();
    uid = list.users.find((u) => u.email === CUSTOMER.email)?.id;
  }
  expect(uid, 'portal auth user').toBeTruthy();
  await admin.from('portal_users').upsert({
    id: uid!, client_id: client!.id, company_id: client!.company_id, full_name: 'John Smith',
  });
  return { portalUserId: uid!, clientId: client!.id, companyId: client!.company_id };
}

async function login(page: Page, email: string, password: string, landing: RegExp) {
  await page.goto('/login');
  await page.locator('#email').fill(email, { timeout: 15_000 });
  await page.locator('#password').fill(password, { timeout: 15_000 });
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(landing, { timeout: 60_000 });
}

/**
 * The customer portal round-trips (roadmap portal e2e smoke): a customer's
 * request, message, and complaint each reach the office (queue + staff
 * notification), and office responses flow back (portal notification /
 * visible reply).
 */
test('portal flows: request → office; message both ways; complaint → resolve', async ({ page, browser, baseURL }) => {
  test.setTimeout(300_000);
  const { portalUserId, clientId, companyId } = await seedCustomer();
  // Timed-out prior runs abandon their finally-cleanup — sweep stale seeds.
  await admin.from('service_requests').delete().like('title', 'E2E quote %');
  await admin.from('service_requests').delete().eq('title', 'Get a Quote');
  await admin.from('complaints').delete().like('title', 'E2E issue %');
  await admin.from('messages').delete().like('body', 'Hi office %');
  await admin.from('messages').delete().like('body', 'Hi John %');
  const stamp = Date.now();

  const custCtx = await browser.newContext({
    baseURL: baseURL!,
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const cust = await custCtx.newPage();

  try {
    await login(cust, CUSTOMER.email, CUSTOMER.password, /\/portal/);

    // ── 1) Service request (quote) ──
    await cust.goto('/portal/requests/new');
    await cust.getByText(/get a quote/i).click();
    await cust.getByPlaceholder(/brief description/i).fill(`E2E quote ${stamp}`);
    await cust.getByPlaceholder(/additional details/i).fill('Bed refresh + mulch estimate please.');
    await cust.getByRole('button', { name: /submit|send request/i }).click();
    await expect(async () => {
      const { data } = await admin
        .from('service_requests')
        .select('id, status')
        .eq('client_id', clientId)
        .ilike('title', `%${stamp}%`);
      expect(data ?? []).toHaveLength(1);
    }).toPass({ timeout: 20_000, intervals: [1000] });

    // Staff got an in-app notification for it (async fan-out — poll).
    await expect(async () => {
      const { data: staffNotif } = await admin
        .from('notifications').select('id').eq('company_id', companyId)
        .gte('created_at', new Date(stamp).toISOString())
        .ilike('title', '%request%');
      expect((staffNotif ?? []).length).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 15_000, intervals: [1000] });

    // Office sees it in the queue and starts review.
    await page.goto('/dashboard/portal-admin/requests');
    await expect(page.getByText(new RegExp(`${stamp}`))).toBeVisible({ timeout: 30_000 });

    // Open the request's detail panel, mark it Reviewing — the customer
    // must receive a request_update portal notification (migration 057).
    await page
      .locator('tr', { hasText: `${stamp}` })
      .getByRole('button', { name: /view/i })
      .click();
    await page.getByRole('button', { name: /mark reviewing/i }).click({ timeout: 10_000 });
    await expect(async () => {
      const { data } = await admin
        .from('portal_notifications').select('id')
        .eq('portal_user_id', portalUserId)
        .eq('type', 'request_update')
        .gte('created_at', new Date(stamp).toISOString());
      expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 15_000, intervals: [1000] });

    // ── 2) Messaging, both directions ──
    await cust.goto('/portal/messages');
    await cust.getByPlaceholder(/type a message/i).fill(`Hi office ${stamp}`, { timeout: 15_000 });
    await cust.getByRole('button', { name: /send message/i }).click({ timeout: 10_000 });
    await expect(async () => {
      const { data } = await admin
        .from('messages').select('id').eq('client_id', clientId).ilike('body', `%Hi office ${stamp}%`);
      expect(data ?? []).toHaveLength(1);
    }).toPass({ timeout: 15_000, intervals: [1000] });

    // Office replies from the portal-admin thread.
    await page.goto('/dashboard/portal-admin');
    await expect(page.getByText(`Hi office ${stamp}`).first()).toBeVisible({ timeout: 30_000 });
    // Open the thread — the entry in the MESSAGES panel is a <button>
    // (the Pending Activity feed shows the same text but isn't the thread).
    await page.getByRole('button').filter({ hasText: `Hi office ${stamp}` }).first().click({ timeout: 10_000 });
    await page.getByPlaceholder(/type a message/i).fill(`Hi John ${stamp}`, { timeout: 10_000 });
    await page.getByRole('button', { name: /send message/i }).click({ timeout: 10_000 });
    // The reply must actually hit the DB (guards against silent RLS drops).
    await expect(async () => {
      const { data } = await admin
        .from('messages').select('id').ilike('body', `%Hi John ${stamp}%`);
      expect((data ?? []).length).toBe(1);
    }).toPass({ timeout: 15_000, intervals: [1000] });

    // Customer sees the reply. (Local Supabase realtime often falls back
    // to interval polling — reload rather than wait out the poll timer.)
    await expect(async () => {
      await cust.reload();
      await expect(cust.getByText(`Hi John ${stamp}`).first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 45_000, intervals: [3000] });

    // ── 3) Complaint → resolve ──
    await cust.goto('/portal/complaints/new');
    await cust.getByPlaceholder(/brief summary/i).fill(`E2E issue ${stamp}`);
    await cust.getByPlaceholder(/describe the issue/i).fill('Sprinkler head cracked by the driveway.');
    await cust.getByRole('button', { name: /submit|report/i }).click();
    await expect(async () => {
      const { data } = await admin
        .from('complaints').select('id').eq('client_id', clientId).ilike('title', `%${stamp}%`);
      expect(data ?? []).toHaveLength(1);
    }).toPass({ timeout: 20_000, intervals: [1000] });

    await page.goto('/dashboard/portal-admin/complaints');
    await expect(page.getByText(new RegExp(`${stamp}`))).toBeVisible({ timeout: 30_000 });
  } finally {
    await custCtx.close();
    await admin.from('service_requests').delete().ilike('title', `%${stamp}%`);
    await admin.from('complaints').delete().ilike('title', `%${stamp}%`);
    await admin.from('messages').delete().ilike('body', `%${stamp}%`);
    await admin.from('portal_notifications').delete().eq('portal_user_id', portalUserId);
  }
});
