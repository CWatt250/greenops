-- Allow standalone measurements (no client_id) so dispatchers can measure
-- prospect properties from a phone call without first creating a client
-- record. Apply via Supabase SQL editor.

alter table property_measurements
  alter column client_id drop not null;
