-- Public storage bucket for company logos. Owners/dispatchers upload from
-- /dashboard/settings; logos are referenced by URL on PDFs, portal header, etc.
-- Public-read so PDFs (which fetch the URL anonymously during render) can load
-- the image without a signed URL.

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do update set public = true;

-- RLS: anyone authenticated can read; owners/dispatchers in the company can
-- write. Object keys must start with "<company_id>/" so writes are scoped per
-- tenant.

create policy "Anyone can read company logos"
  on storage.objects for select
  using (bucket_id = 'company-logos');

create policy "Owners/dispatchers can upload their company logo"
  on storage.objects for insert
  with check (
    bucket_id = 'company-logos'
    and auth.uid() in (
      select id from profiles
      where role in ('owner', 'dispatcher')
        and company_id::text = split_part(name, '/', 1)
    )
  );

create policy "Owners/dispatchers can update their company logo"
  on storage.objects for update
  using (
    bucket_id = 'company-logos'
    and auth.uid() in (
      select id from profiles
      where role in ('owner', 'dispatcher')
        and company_id::text = split_part(name, '/', 1)
    )
  );

create policy "Owners/dispatchers can delete their company logo"
  on storage.objects for delete
  using (
    bucket_id = 'company-logos'
    and auth.uid() in (
      select id from profiles
      where role in ('owner', 'dispatcher')
        and company_id::text = split_part(name, '/', 1)
    )
  );
