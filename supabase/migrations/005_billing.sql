-- Stub estimates table (referenced by invoices FK)
create table if not exists estimates (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  created_at timestamptz default now()
);

-- Invoice number sequence per company
create sequence if not exists invoice_number_seq start 1000;

create table invoices (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  client_id uuid references clients(id) on delete restrict not null,
  job_id uuid references jobs(id) on delete set null,
  estimate_id uuid references estimates(id) on delete set null,
  invoice_number text not null,
  status text check (status in ('draft','sent','viewed','partial','paid','overdue','cancelled')) default 'draft',
  issued_date date not null default current_date,
  due_date date,
  subtotal numeric(10,2) not null default 0,
  tax_rate numeric(5,4) not null default 0,
  tax_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  amount_paid numeric(10,2) not null default 0,
  balance_due numeric(10,2) not null default 0,
  notes text,
  internal_notes text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table invoice_line_items (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid references invoices(id) on delete cascade not null,
  service_id uuid references services(id) on delete set null,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(10,2) not null default 0,
  total numeric(10,2) generated always as (quantity * unit_price) stored,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create table payments (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  invoice_id uuid references invoices(id) on delete cascade not null,
  amount numeric(10,2) not null,
  method text check (method in ('cash','check','card','ach','other')) not null default 'check',
  reference_number text,
  payment_date date not null default current_date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table billing_schedules (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  job_id uuid references jobs(id) on delete set null,
  recurrence_rule text not null,
  next_invoice_date date,
  auto_send boolean not null default false,
  is_active boolean not null default true,
  template_notes text,
  last_generated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;
alter table payments enable row level security;
alter table billing_schedules enable row level security;
alter table estimates enable row level security;

create policy "company_isolation" on invoices
  using (company_id = (select company_id from profiles where id = auth.uid()));
create policy "company_isolation" on invoice_line_items
  using (invoice_id in (select id from invoices where company_id = (select company_id from profiles where id = auth.uid())));
create policy "company_isolation" on payments
  using (company_id = (select company_id from profiles where id = auth.uid()));
create policy "company_isolation" on billing_schedules
  using (company_id = (select company_id from profiles where id = auth.uid()));
create policy "company_isolation" on estimates
  using (company_id = (select company_id from profiles where id = auth.uid()));

-- Helper: next invoice number for company
create or replace function next_invoice_number(p_company_id uuid)
returns text language plpgsql as $$
declare
  v_count int;
begin
  select coalesce(count(*), 0) + 1001
  into v_count
  from invoices
  where company_id = p_company_id;
  return 'INV-' || lpad(v_count::text, 4, '0');
end;
$$;
