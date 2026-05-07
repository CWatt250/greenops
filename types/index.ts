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

export interface RouteStop {
  id: string;
  route_id: string;
  job_id: string;
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
