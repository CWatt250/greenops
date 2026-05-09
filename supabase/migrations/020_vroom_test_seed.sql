-- VROOM/ORS optimization test seed.
-- Adds latitude/longitude to clients (required for ORS optimization), then
-- wipes and re-seeds TLC's clients/crews/jobs with verified Tri-Cities,
-- WA coordinates so the route builder can optimize without depending on
-- live geocoding (some of the previous addresses fell back to Portland OR).

alter table clients add column if not exists latitude numeric(10,7);
alter table clients add column if not exists longitude numeric(10,7);

-- Wipe TLC's demo data. Order matters: jobs reference clients and crews.
-- Estimates and invoices block this on FK, so clear them first if they
-- happen to exist for the demo set.
delete from job_line_items
  where job_id in (
    select id from jobs where company_id = 'b2ddca19-8f06-4884-a1ca-9b3be5df8ecb'
  );
delete from jobs where company_id = 'b2ddca19-8f06-4884-a1ca-9b3be5df8ecb';
delete from clients where company_id = 'b2ddca19-8f06-4884-a1ca-9b3be5df8ecb';
delete from crews where company_id = 'b2ddca19-8f06-4884-a1ca-9b3be5df8ecb';

insert into crews (company_id, name, color, is_active) values
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Crew 1', '#F15A24', true),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Crew 2', '#3D6B2C', true);

insert into clients (
  company_id, name, phone, email, property_type,
  service_address, service_city, service_state, service_zip,
  status, latitude, longitude
) values
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'John Smith',          '509-555-0101', 'jsmith@example.com',    'residential', '8524 W Clearwater Ave',       'Kennewick', 'WA', '99336', 'active', 46.2087, -119.2178),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Sarah Johnson',        '509-555-0102', 'sjohnson@example.com',  'residential', '4309 W 27th Ave',             'Kennewick', 'WA', '99337', 'active', 46.1893, -119.1925),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Robert Lee',           '509-555-0103', 'rlee@example.com',      'residential', '6803 W Hood Pl',              'Kennewick', 'WA', '99336', 'active', 46.2100, -119.2456),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Columbia Center HOA',  '509-555-0104', 'mgr@cchoa.com',         'hoa',         '1321 N Columbia Center Blvd', 'Kennewick', 'WA', '99336', 'active', 46.2231, -119.2238),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Mike Anderson',        '509-555-0105', 'manderson@example.com', 'residential', '2105 Geo Washington Way',     'Richland',  'WA', '99354', 'active', 46.2799, -119.2752),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Jennifer Martinez',    '509-555-0106', 'jmartinez@example.com', 'residential', '1308 Aaron Dr',               'Richland',  'WA', '99352', 'active', 46.2756, -119.2867),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Three Rivers HOA',     '509-555-0107', 'admin@3rivers.com',     'hoa',         '215 N Edison St',             'Kennewick', 'WA', '99336', 'active', 46.2186, -119.1638),
  ('b2ddca19-8f06-4884-a1ca-9b3be5df8ecb', 'Pasco Industrial',     '509-555-0108', 'fac@pascoind.com',      'commercial',  '1015 W Lewis St',             'Pasco',     'WA', '99301', 'active', 46.2306, -119.0995);

-- 8 unassigned jobs scheduled for tomorrow.
do $$
declare
  tlc_id uuid := 'b2ddca19-8f06-4884-a1ca-9b3be5df8ecb';
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid; c7 uuid; c8 uuid;
  tomorrow date := current_date + 1;
begin
  select id into c1 from clients where company_id = tlc_id and name = 'John Smith';
  select id into c2 from clients where company_id = tlc_id and name = 'Sarah Johnson';
  select id into c3 from clients where company_id = tlc_id and name = 'Robert Lee';
  select id into c4 from clients where company_id = tlc_id and name = 'Columbia Center HOA';
  select id into c5 from clients where company_id = tlc_id and name = 'Mike Anderson';
  select id into c6 from clients where company_id = tlc_id and name = 'Jennifer Martinez';
  select id into c7 from clients where company_id = tlc_id and name = 'Three Rivers HOA';
  select id into c8 from clients where company_id = tlc_id and name = 'Pasco Industrial';

  insert into jobs (company_id, client_id, crew_id, title, status, scheduled_date, scheduled_start, scheduled_end) values
    (tlc_id, c1, null, 'Mowing — Smith residence',            'scheduled', tomorrow, '08:00', '08:45'),
    (tlc_id, c2, null, 'Mowing — Johnson residence',          'scheduled', tomorrow, '09:00', '09:45'),
    (tlc_id, c3, null, 'Spring cleanup — Lee residence',      'scheduled', tomorrow, '10:00', '12:00'),
    (tlc_id, c4, null, 'Mowing — Columbia Center HOA',        'scheduled', tomorrow, '08:00', '10:00'),
    (tlc_id, c5, null, 'Mowing — Anderson residence',         'scheduled', tomorrow, '10:30', '11:15'),
    (tlc_id, c6, null, 'Edging — Martinez residence',         'scheduled', tomorrow, '11:30', '13:00'),
    (tlc_id, c7, null, 'Tree trimming — Three Rivers HOA',    'scheduled', tomorrow, '08:00', '11:00'),
    (tlc_id, c8, null, 'Sprinkler repair — Pasco Industrial', 'scheduled', tomorrow, '11:30', '14:00');
end $$;
