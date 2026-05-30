-- Migration 044: performance indexes on FK / filter / scheduled-date columns.
--
-- Audit finding: migration 001 created the core tables (clients, jobs, invoices,
-- routes, route_stops, estimates, service_requests, ...) with NO indexes on
-- company_id or any foreign-key column. Every multi-tenant query filters on
-- company_id (per the multi-tenancy rule), and list/detail views join on
-- client_id / job_id / crew_id / route_id / etc. — all of which were doing
-- sequential scans in production.
--
-- This migration adds a single-column btree index to every FK and common
-- filter/sort column that was not already the leading column of an existing
-- index. All statements are `if not exists`, so the migration is idempotent
-- and safe to run against a database that already has some of these indexes.
--
-- Apply to prod manually (same as 043).

create index if not exists idx_activity_log_actor_id on public.activity_log (actor_id);
create index if not exists idx_activity_log_company_id on public.activity_log (company_id);
create index if not exists idx_activity_log_entity_id on public.activity_log (entity_id);
create index if not exists idx_applicator_licenses_expiration_date on public.applicator_licenses (expiration_date);
create index if not exists idx_applicator_licenses_issued_date on public.applicator_licenses (issued_date);
create index if not exists idx_applicator_licenses_profile_id on public.applicator_licenses (profile_id);
create index if not exists idx_billing_schedules_client_id on public.billing_schedules (client_id);
create index if not exists idx_billing_schedules_company_id on public.billing_schedules (company_id);
create index if not exists idx_billing_schedules_job_id on public.billing_schedules (job_id);
create index if not exists idx_billing_schedules_next_invoice_date on public.billing_schedules (next_invoice_date);
create index if not exists idx_chemical_applications_company_id on public.chemical_applications (company_id);
create index if not exists idx_chemical_applications_product_id on public.chemical_applications (product_id);
create index if not exists idx_chemical_products_company_id on public.chemical_products (company_id);
create index if not exists idx_clients_company_id on public.clients (company_id);
create index if not exists idx_clients_preferred_crew_id on public.clients (preferred_crew_id);
create index if not exists idx_clients_primary_measurement_id on public.clients (primary_measurement_id);
create index if not exists idx_clock_events_company_id on public.clock_events (company_id);
create index if not exists idx_clock_events_job_id on public.clock_events (job_id);
create index if not exists idx_complaints_client_id on public.complaints (client_id);
create index if not exists idx_complaints_company_id on public.complaints (company_id);
create index if not exists idx_complaints_job_id on public.complaints (job_id);
create index if not exists idx_complaints_portal_user_id on public.complaints (portal_user_id);
create index if not exists idx_crew_locations_crew_id on public.crew_locations (crew_id);
create index if not exists idx_crew_members_crew_id on public.crew_members (crew_id);
create index if not exists idx_crew_members_profile_id on public.crew_members (profile_id);
create index if not exists idx_crews_company_id on public.crews (company_id);
create index if not exists idx_daily_summaries_profile_id on public.daily_summaries (profile_id);
create index if not exists idx_estimate_line_items_estimate_id on public.estimate_line_items (estimate_id);
create index if not exists idx_estimate_line_items_service_id on public.estimate_line_items (service_id);
create index if not exists idx_estimates_client_id on public.estimates (client_id);
create index if not exists idx_estimates_company_id on public.estimates (company_id);
create index if not exists idx_form_submissions_company_id on public.form_submissions (company_id);
create index if not exists idx_form_submissions_template_id on public.form_submissions (template_id);
create index if not exists idx_form_templates_company_id on public.form_templates (company_id);
create index if not exists idx_invoice_line_items_invoice_id on public.invoice_line_items (invoice_id);
create index if not exists idx_invoice_line_items_service_id on public.invoice_line_items (service_id);
create index if not exists idx_invoice_number_counters_company_id on public.invoice_number_counters (company_id);
create index if not exists idx_invoices_client_id on public.invoices (client_id);
create index if not exists idx_invoices_company_id on public.invoices (company_id);
create index if not exists idx_invoices_due_date on public.invoices (due_date);
create index if not exists idx_invoices_estimate_id on public.invoices (estimate_id);
create index if not exists idx_invoices_issued_date on public.invoices (issued_date);
create index if not exists idx_invoices_job_id on public.invoices (job_id);
create index if not exists idx_job_cost_entries_company_id on public.job_cost_entries (company_id);
create index if not exists idx_job_line_items_job_id on public.job_line_items (job_id);
create index if not exists idx_job_line_items_service_id on public.job_line_items (service_id);
create index if not exists idx_job_photos_company_id on public.job_photos (company_id);
create index if not exists idx_job_photos_job_id on public.job_photos (job_id);
create index if not exists idx_job_series_client_id on public.job_series (client_id);
create index if not exists idx_job_series_company_id on public.job_series (company_id);
create index if not exists idx_job_series_crew_id on public.job_series (crew_id);
create index if not exists idx_job_series_end_date on public.job_series (end_date);
create index if not exists idx_job_series_start_date on public.job_series (start_date);
create index if not exists idx_job_services_service_id on public.job_services (service_id);
create index if not exists idx_job_templates_default_crew_id on public.job_templates (default_crew_id);
create index if not exists idx_job_templates_service_id on public.job_templates (service_id);
create index if not exists idx_jobs_client_id on public.jobs (client_id);
create index if not exists idx_jobs_crew_id on public.jobs (crew_id);
create index if not exists idx_jobs_estimate_id on public.jobs (estimate_id);
create index if not exists idx_jobs_scheduled_date on public.jobs (scheduled_date);
create index if not exists idx_jobs_series_id on public.jobs (series_id);
create index if not exists idx_messages_client_id on public.messages (client_id);
create index if not exists idx_messages_company_id on public.messages (company_id);
create index if not exists idx_messages_sender_id on public.messages (sender_id);
create index if not exists idx_messages_thread_id on public.messages (thread_id);
create index if not exists idx_note_templates_company_id on public.note_templates (company_id);
create index if not exists idx_notifications_company_id on public.notifications (company_id);
create index if not exists idx_notifications_entity_id on public.notifications (entity_id);
create index if not exists idx_notifications_profile_id on public.notifications (profile_id);
create index if not exists idx_payments_company_id on public.payments (company_id);
create index if not exists idx_payments_invoice_id on public.payments (invoice_id);
create index if not exists idx_payments_payment_date on public.payments (payment_date);
create index if not exists idx_portal_notifications_entity_id on public.portal_notifications (entity_id);
create index if not exists idx_portal_notifications_portal_user_id on public.portal_notifications (portal_user_id);
create index if not exists idx_portal_users_client_id on public.portal_users (client_id);
create index if not exists idx_portal_users_company_id on public.portal_users (company_id);
create index if not exists idx_profiles_company_id on public.profiles (company_id);
create index if not exists idx_property_measurements_client_id on public.property_measurements (client_id);
create index if not exists idx_property_measurements_submitted_by_profile_id on public.property_measurements (submitted_by_profile_id);
create index if not exists idx_route_stops_job_id on public.route_stops (job_id);
create index if not exists idx_route_stops_route_id on public.route_stops (route_id);
create index if not exists idx_routes_company_id on public.routes (company_id);
create index if not exists idx_routes_crew_id on public.routes (crew_id);
create index if not exists idx_routes_route_date on public.routes (route_date);
create index if not exists idx_service_presets_company_id on public.service_presets (company_id);
create index if not exists idx_service_requests_client_id on public.service_requests (client_id);
create index if not exists idx_service_requests_company_id on public.service_requests (company_id);
create index if not exists idx_service_requests_portal_user_id on public.service_requests (portal_user_id);
create index if not exists idx_service_requests_preferred_date on public.service_requests (preferred_date);
create index if not exists idx_service_requests_service_id on public.service_requests (service_id);
create index if not exists idx_services_company_id on public.services (company_id);
