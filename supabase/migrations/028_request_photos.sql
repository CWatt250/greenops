-- Photo upload on portal service requests. The complaints table already
-- has a `photo_urls text[]` column; this gives service_requests the same
-- shape so customers can attach a "here's what's wrong" photo.

alter table service_requests
  add column if not exists photo_urls text[] default '{}';
