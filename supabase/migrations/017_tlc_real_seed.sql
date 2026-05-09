-- TLC Landscape Management — real business info seed.
-- Apply via Supabase SQL editor. THIS IS DESTRUCTIVE for the target company:
-- it wipes services / jobs / clients / crews and replaces them with the real
-- TLC catalogue. Pricing on services is intentionally $0 — Trent fills in.

-- ---------------------------------------------------------------------------
-- 1) New columns on companies
-- ---------------------------------------------------------------------------

alter table companies add column if not exists website text;
alter table companies add column if not exists tagline text;
alter table companies add column if not exists service_area text;
alter table companies add column if not exists business_hours jsonb;
-- logo_url + overhead_pct already exist from earlier migrations.

-- ---------------------------------------------------------------------------
-- 2) Extend services category + unit check constraints
--    The seed below uses 'overseeding', 'mulch' (new categories) and
--    'per_yard' (new unit). Drop the originals (auto-named) and rebuild
--    them with the expanded value sets.
-- ---------------------------------------------------------------------------

alter table services drop constraint if exists services_category_check;
alter table services add constraint services_category_check
  check (category in (
    'mowing','edging','fertilization','aeration','overseeding','mulch',
    'cleanup','tree','sprinkler','snow','holiday','other'
  ));

alter table services drop constraint if exists services_unit_check;
alter table services add constraint services_unit_check
  check (unit in ('per_visit','per_sqft','per_hour','flat','per_unit','per_yard'));

-- ---------------------------------------------------------------------------
-- 3) Update the TLC company record with real business info
-- ---------------------------------------------------------------------------

update companies set
  name = 'TLC Landscape Management',
  address = '1053 S Highland Dr',
  city = 'Kennewick',
  state = 'WA',
  zip = '99337',
  phone = '509-627-9384',
  email = 'office@tlclandscapemanagement.com',
  website = 'https://tlclandscapemanagement.com',
  logo_url = 'https://tlclandscapemanagement.com/wp-content/uploads/2022/07/TLC-Logo-1.png',
  tagline = 'Reliable Landscape Management for a Yard You''ll Love',
  service_area = 'Tri-Cities, WA (Kennewick, Pasco, Richland)',
  business_hours = jsonb_build_object(
    'monday',    '8:00 AM – 4:30 PM',
    'tuesday',   '8:00 AM – 4:30 PM',
    'wednesday', '8:00 AM – 4:30 PM',
    'thursday',  '8:00 AM – 4:30 PM',
    'friday',    '8:00 AM – 1:00 PM',
    'saturday',  'By appointment only',
    'sunday',    'Closed'
  )
where id = 'b2ddca19-8f06-4884-a1ca-9b3be5df8ecb';

-- ---------------------------------------------------------------------------
-- 4) Wipe placeholder services + insert real TLC services
--    Prices intentionally 0 — Trent fills in real numbers in the UI.
-- ---------------------------------------------------------------------------

delete from services where company_id = 'b2ddca19-8f06-4884-a1ca-9b3be5df8ecb';

insert into services (company_id, name, category, unit, base_price, description, is_active) values
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Weekly Mowing',                'mowing',        'per_visit', 0, 'Standard weekly mowing service for residential lawns', true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Bi-Weekly Mowing',             'mowing',        'per_visit', 0, 'Mowing every two weeks',                               true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Edging',                       'edging',        'per_visit', 0, 'Edging along driveways, walkways, and beds',           true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Spring Cleanup',               'cleanup',       'flat',      0, 'Comprehensive spring yard cleanup',                    true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Fall Cleanup',                 'cleanup',       'flat',      0, 'Leaf removal and fall property cleanup',               true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Fertilization',                'fertilization', 'per_visit', 0, 'Lawn fertilization treatment',                         true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Aeration',                     'aeration',      'flat',      0, 'Core aeration for healthy turf',                       true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Overseeding',                  'overseeding',   'flat',      0, 'Lawn overseeding service',                             true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Mulch Installation',           'mulch',         'per_yard',  0, 'Mulch delivery and installation',                      true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Tree Trimming',                'tree',          'per_hour',  0, 'Tree pruning and trimming',                            true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Tree Removal',                 'tree',          'flat',      0, 'Tree removal service',                                 true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Shrub Trimming',               'tree',          'per_hour',  0, 'Shrub and bush trimming',                              true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Sprinkler Turn-On',            'sprinkler',     'flat',      0, 'Spring sprinkler system activation',                   true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Sprinkler Blow-Out',           'sprinkler',     'flat',      0, 'Winter sprinkler system winterization',                true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Sprinkler Repair',             'sprinkler',     'per_hour',  0, 'Sprinkler system diagnosis and repair',                true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Snow Removal — Residential',   'snow',          'per_visit', 0, 'Residential snow removal',                             true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Snow Removal — Commercial',    'snow',          'per_visit', 0, 'Commercial property snow removal',                     true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Holiday Lighting Install',     'holiday',       'flat',      0, 'Christmas and holiday light installation',             true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Holiday Lighting Removal',     'holiday',       'flat',      0, 'Holiday light takedown and storage',                   true);

-- ---------------------------------------------------------------------------
-- 5) Wipe placeholder jobs + clients (jobs first to satisfy FK)
-- ---------------------------------------------------------------------------

delete from jobs where company_id = 'b2ddca19-8f06-4884-a1ca-9b3be5df8ecb';
delete from clients where company_id = 'b2ddca19-8f06-4884-a1ca-9b3be5df8ecb';

-- ---------------------------------------------------------------------------
-- 6) Wipe placeholder crews + create one starter crew
-- ---------------------------------------------------------------------------

delete from crews where company_id = 'b2ddca19-8f06-4884-a1ca-9b3be5df8ecb';

insert into crews (company_id, name, color, is_active) values
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'TLC Crew', '#F15A24', true);

-- ---------------------------------------------------------------------------
-- 7) Customer-portal welcome banner + job-costing default overhead
-- ---------------------------------------------------------------------------

update companies set
  portal_banner_message = 'Welcome to TLC Landscape Management! Reach out anytime — call us at 509-627-9384 or use the messaging feature below.',
  portal_banner_enabled = true,
  overhead_pct = 15
where id = 'b2ddca19-8f06-4884-a1ca-9b3be5df8ecb';
