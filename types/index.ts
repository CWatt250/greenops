export type UserRole = 'owner' | 'dispatcher' | 'crew' | 'customer';
export type PreferredContact = 'phone' | 'email' | 'sms';
export type PropertyType = 'residential' | 'commercial' | 'hoa';
export type ClientStatus = 'active' | 'inactive' | 'prospect' | 'lead';
export type ServiceCategory =
  | 'mowing' | 'edging' | 'fertilization' | 'aeration'
  | 'cleanup' | 'tree' | 'sprinkler' | 'snow' | 'holiday' | 'other';
export type ServiceUnit = 'per_visit' | 'per_sqft' | 'per_hour' | 'flat' | 'per_unit';
export type JobStatus =
  | 'unscheduled' | 'scheduled' | 'in_progress' | 'complete' | 'cancelled' | 'issue';
export type CrewMemberRole = 'lead' | 'member';

export interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  created_at: string;
}

export interface Profile {
  id: string;
  company_id?: string;
  full_name?: string;
  phone?: string;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
}

export interface Client {
  id: string;
  company_id: string;
  name: string;
  company_name?: string;
  phone?: string;
  email?: string;
  preferred_contact: PreferredContact;
  property_type: PropertyType;
  service_address: string;
  service_city?: string;
  service_state?: string;
  service_zip?: string;
  billing_same_as_service: boolean;
  billing_address?: string;
  lot_size_sqft?: number;
  access_notes?: string;
  gate_code?: string;
  preferred_crew_id?: string;
  status: ClientStatus;
  primary_measurement_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  category: ServiceCategory;
  unit: ServiceUnit;
  base_price: number;
  is_active: boolean;
  /** Per-square-foot pricing override (migration 010). Optional. */
  per_sqft_rate?: number | null;
  created_at: string;
}

export interface Crew {
  id: string;
  company_id: string;
  name: string;
  color: string;
  is_active: boolean;
  created_at: string;
  members?: CrewMember[];
}

export interface CrewMember {
  id: string;
  crew_id: string;
  profile_id: string;
  role: CrewMemberRole;
  created_at: string;
  profile?: Profile;
}

export interface Job {
  id: string;
  company_id: string;
  client_id?: string;
  crew_id?: string;
  title: string;
  status: JobStatus;
  scheduled_date?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  actual_start?: string;
  actual_end?: string;
  notes?: string;
  is_recurring: boolean;
  recurrence_rule?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  client?: Client;
  crew?: Crew;
}

export interface JobLineItem {
  id: string;
  job_id: string;
  service_id?: string;
  description?: string;
  quantity: number;
  unit_price: number;
  total: number;
  created_at: string;
  service?: Service;
}

export interface ActivityLog {
  id: string;
  company_id?: string;
  entity_type?: string;
  entity_id?: string;
  action?: string;
  actor_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  actor?: Profile;
}

export interface ClockEvent {
  id: string;
  company_id: string;
  job_id: string;
  profile_id: string;
  event_type: 'clock_in' | 'clock_out';
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  created_at: string;
  profile?: Profile;
}

export interface JobPhoto {
  id: string;
  company_id: string;
  job_id: string;
  uploaded_by?: string | null;
  storage_path: string;
  caption?: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  company_id: string;
  profile_id: string;
  title: string;
  body?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  is_read: boolean;
  created_at: string;
}

export type ServiceRequestType = 'new_service' | 'reschedule' | 'quote_request' | 'cancel' | 'seasonal' | 'other';
export type ServiceRequestStatus = 'pending' | 'reviewing' | 'scheduled' | 'completed' | 'declined';
export type ComplaintSeverity = 'low' | 'medium' | 'high';
export type ComplaintStatus = 'open' | 'reviewing' | 'resolved' | 'closed';
export type PortalNotificationType = 'job_scheduled' | 'crew_enroute' | 'job_complete' | 'invoice_ready' | 'request_update' | 'complaint_update' | 'message';

export interface PortalUser {
  id: string;
  client_id: string;
  company_id: string;
  full_name?: string | null;
  phone?: string | null;
  notification_prefs: {
    email_job_reminder: boolean;
    email_invoice: boolean;
    email_request_update: boolean;
    sms_crew_enroute: boolean;
  };
  last_seen_at?: string | null;
  created_at: string;
}

export interface ServiceRequest {
  id: string;
  company_id: string;
  client_id: string;
  portal_user_id?: string | null;
  type: ServiceRequestType;
  service_id?: string | null;
  title: string;
  description?: string | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  status: ServiceRequestStatus;
  admin_notes?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  created_at: string;
  updated_at: string;
  client?: Client;
  service?: Service;
}

export interface Message {
  id: string;
  company_id: string;
  client_id: string;
  thread_id: string;
  sender_type: 'portal_user' | 'admin';
  sender_id: string;
  body: string;
  read_at?: string | null;
  created_at: string;
}

export interface Complaint {
  id: string;
  company_id: string;
  client_id: string;
  portal_user_id?: string | null;
  job_id?: string | null;
  title: string;
  description: string;
  photo_urls?: string[] | null;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  created_at: string;
  updated_at: string;
  client?: Client;
  job?: Job;
}

export interface PortalNotification {
  id: string;
  portal_user_id: string;
  title: string;
  body?: string | null;
  type?: PortalNotificationType | null;
  entity_type?: string | null;
  entity_id?: string | null;
  read: boolean;
  created_at: string;
}

export type RouteStatus = 'draft' | 'active' | 'in_progress' | 'complete';
export type StopStatus = 'pending' | 'en_route' | 'arrived' | 'complete' | 'skipped';

export interface Route {
  id: string;
  company_id: string;
  crew_id?: string | null;
  route_date: string;
  title?: string | null;
  status: RouteStatus;
  total_drive_minutes?: number | null;
  total_job_minutes?: number | null;
  total_stops?: number | null;
  optimized_at?: string | null;
  weather_checked_at?: string | null;
  weather_summary?: string | null;
  weather_flag: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  crew?: Crew;
}

export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'partial' | 'paid' | 'overdue' | 'cancelled';
export type PaymentMethod = 'cash' | 'check' | 'card' | 'ach' | 'other';

export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
export type PropertyComplexity = 'simple' | 'moderate' | 'complex';
export type LineItemFrequency =
  | 'one_time' | 'weekly' | 'biweekly' | 'monthly' | 'seasonal' | 'annual';

export interface Estimate {
  id: string;
  company_id: string;
  client_id: string | null;
  title: string;
  status: EstimateStatus;
  valid_until?: string | null;
  notes?: string | null;
  tax_rate: number;
  // Phase 9 columns (migration 009)
  property_complexity?: PropertyComplexity | null;
  has_slopes?: boolean;
  has_dogs?: boolean;
  has_obstacles?: boolean;
  payment_terms?: string | null;
  annual_value?: number | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EstimateLineItem {
  id: string;
  estimate_id: string;
  service_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  markup_pct: number;
  discount_pct: number;
  total: number;
  sort_order: number;
  // Phase 9 columns (migration 009)
  frequency?: LineItemFrequency | null;
  frequency_discount_pct?: number | null;
  created_at: string;
}

export interface ServicePreset {
  id: string;
  company_id: string;
  name: string;
  description?: string | null;
  service_ids: string[];
  is_active: boolean;
  created_at: string;
}

export interface NoteTemplate {
  id: string;
  company_id: string;
  label: string;
  body: string;
  created_by?: string | null;
  created_at: string;
}

export interface PropertyMeasurement {
  id: string;
  company_id: string;
  client_id: string;
  measured_by?: string | null;
  total_turf_sqft: number;
  total_hardscape_sqft: number;
  total_bed_sqft: number;
  total_other_sqft: number;
  shapes: unknown; // jsonb — see lib/measurement.ts MeasuredShape[]
  notes?: string | null;
  imagery_source?: string | null;
  measured_at: string;
}

export interface Invoice {
  id: string;
  company_id: string;
  client_id: string;
  job_id?: string | null;
  estimate_id?: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  issued_date: string;
  due_date?: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  notes?: string | null;
  internal_notes?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  client?: Client;
  job?: Job;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  service_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
  created_at: string;
  service?: Service;
}

export interface Payment {
  id: string;
  company_id: string;
  invoice_id: string;
  amount: number;
  method: PaymentMethod;
  reference_number?: string | null;
  payment_date: string;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface BillingSchedule {
  id: string;
  company_id: string;
  client_id: string;
  job_id?: string | null;
  recurrence_rule: string;
  next_invoice_date?: string | null;
  auto_send: boolean;
  is_active: boolean;
  template_notes?: string | null;
  last_generated_at?: string | null;
  created_at: string;
  updated_at: string;
  client?: Client;
  job?: Job;
}

export interface RouteStop {
  id: string;
  route_id: string;
  job_id: string | null;
  // Ad-hoc stop fields (when job_id is null)
  label?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  stop_order: number;
  estimated_arrival?: string | null;
  estimated_duration_minutes?: number | null;
  drive_minutes_from_prev?: number | null;
  drive_distance_miles?: number | null;
  status: StopStatus;
  actual_arrival?: string | null;
  actual_departure?: string | null;
  created_at: string;
  job?: Job;
}
