-- Per-company weather preferences for the dashboard Weather Watch widget.
-- The widget previously hard-coded 3 days at the company's mailing address;
-- these columns let owners pick a different location, longer forecast, and
-- metric units, or hide the widget entirely.

alter table companies
  add column if not exists weather_location_label text;
alter table companies
  add column if not exists weather_latitude numeric(10,7);
alter table companies
  add column if not exists weather_longitude numeric(10,7);
alter table companies
  add column if not exists weather_forecast_days integer default 3;
alter table companies
  add column if not exists weather_units text default 'imperial';
alter table companies
  add column if not exists weather_show_on_dashboard boolean default true;

-- Constrain to the values the UI offers. Drop+add so re-runs are safe.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'companies_weather_forecast_days_check'
  ) then
    alter table companies drop constraint companies_weather_forecast_days_check;
  end if;
  if exists (
    select 1 from pg_constraint where conname = 'companies_weather_units_check'
  ) then
    alter table companies drop constraint companies_weather_units_check;
  end if;
end $$;

alter table companies
  add constraint companies_weather_forecast_days_check
  check (weather_forecast_days in (3, 5, 7));

alter table companies
  add constraint companies_weather_units_check
  check (weather_units in ('imperial', 'metric'));
