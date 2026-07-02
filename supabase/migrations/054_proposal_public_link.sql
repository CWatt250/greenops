-- 054: customer-facing proposals — public share link + e-sign acceptance.
--
-- Until now "Send" only flipped status and the office clicked Accept on the
-- customer's behalf. This adds a revocable 128-bit share token (the public
-- page at /p/[token] renders without login via the service role — no RLS
-- changes needed), view tracking, and the acceptance record: drawn
-- signature (PNG data URL), printed name, timestamp, and IP.
--
-- Status machine is unchanged (draft/sent/accepted/declined/expired/
-- converted); "viewed" is derived from viewed_at rather than a new enum
-- value so existing filters and badges keep working.
--
-- Idempotent. Apply with `supabase db push`.

alter table estimates
  add column if not exists public_token text unique,
  add column if not exists public_token_created_at timestamptz,
  add column if not exists viewed_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists decline_reason text,
  add column if not exists acceptance_name text,
  add column if not exists acceptance_signature text,
  add column if not exists acceptance_ip text;

comment on column estimates.public_token is
  'Random 128-bit hex token for the no-login proposal page (/p/<token>). Null = link revoked/never shared.';
comment on column estimates.acceptance_signature is
  'Customer signature as a PNG data URL, captured on the public acceptance page.';
