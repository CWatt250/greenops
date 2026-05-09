-- Welcome tour + per-banner dismissal tracking on profiles.

alter table profiles add column if not exists welcome_tour_completed boolean default false;
alter table profiles add column if not exists dismissed_help_banners text[] default '{}';
