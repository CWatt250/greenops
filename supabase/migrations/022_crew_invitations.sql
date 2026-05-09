-- Crew invitation tracking. Owners/dispatchers create a worker via the
-- "Send App to Worker" flow; we record when the invite was sent, when the
-- worker first signed in, and (temporarily) the auto-generated password we
-- texted them so it can still be reshown if they lose the SMS before
-- logging in.

alter table profiles add column if not exists invited_at timestamptz;
alter table profiles add column if not exists last_signin_at timestamptz;
-- Cleared on first successful login. Safe-but-not-great: storing a temp
-- password lets the dispatcher resend it without resetting auth, but it
-- *is* readable by anyone with read access to the profile row. RLS limits
-- that to the user themselves and their company's owner/dispatcher.
alter table profiles add column if not exists temp_password text;

-- Mirror auth.users.last_sign_in_at into profiles so we can read it under
-- RLS without touching the auth schema directly.
create or replace function public.sync_profile_signin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set last_signin_at = new.last_sign_in_at,
         temp_password  = null
   where id = new.id
     and (new.last_sign_in_at is distinct from
          (select last_signin_at from public.profiles where id = new.id));
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_signin on auth.users;
create trigger trg_sync_profile_signin
after update of last_sign_in_at on auth.users
for each row
execute function public.sync_profile_signin();
