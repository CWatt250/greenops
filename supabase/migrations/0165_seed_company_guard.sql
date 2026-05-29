-- Guard migration so the full chain applies on a fresh `supabase db reset`.
--
-- The TLC seed migrations 017_tlc_real_seed.sql and 020_vroom_test_seed.sql were
-- authored to be applied manually against the *production* project ("Apply via
-- Supabase SQL editor"), where company b2ddca19-… already exists. On a clean
-- local database that company is absent, so 017's `insert into services …`
-- fails the company_id foreign key and the reset aborts before the remaining
-- ~25 migrations apply.
--
-- Creating the company here (idempotently) lets the seeds run locally and in CI.
-- Production already has this row, so `on conflict (id) do nothing` makes this a
-- no-op there.
insert into companies (id, name, slug)
values ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'TLC Landscape Management', 'tlc')
on conflict (id) do nothing;
