-- Team management: staff accounts can be deactivated without deleting
-- history. Login is blocked at the auth layer (ban) and the app layouts
-- refuse to render for is_active = false. Idempotent.

alter table profiles add column if not exists is_active boolean not null default true;
alter table profiles add column if not exists deactivated_at timestamptz;
