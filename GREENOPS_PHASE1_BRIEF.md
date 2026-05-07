# 🌿 GreenOps — Phase 1 Build Brief

## Objective
Scaffold the full Next.js 16 / Supabase / shadcn app with TLC branding, auth, client base, and service catalog.

---

## 📋 Before Any Code
Read the UI/UX skill at: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
Follow its principles for every page you build.

---

## 🏗️ Stack
- **Framework:** Next.js 16, App Router, TypeScript
- **Backend:** Supabase (Postgres + Auth + RLS + Realtime)
- **UI:** shadcn/ui + Tailwind CSS v4
- **Forms:** react-hook-form + zod
- **Tables:** @tanstack/react-table + @tanstack/react-query
- **Drag/Drop:** @dnd-kit/core (install now, use later)
- **Maps:** mapbox-gl + react-map-gl (install now, use later)
- **Deployment:** Vercel

---

## 🎨 Brand Tokens — TLC Landscape Management
Inject into `app/globals.css` as CSS variables. Shadcn tokens must also be overridden.

```css
:root {
  /* TLC Brand */
  --color-brand-dark:        #1C2B1A;
  --color-brand-green:       #3D6B2C;
  --color-brand-green-light: #5A9040;
  --color-brand-gold:        #C9A84C;
  --color-brand-cream:       #F5F5F0;

  /* Semantic */
  --color-primary:       var(--color-brand-green);
  --color-primary-hover: var(--color-brand-green-light);
  --color-cta:           var(--color-brand-gold);
  --color-sidebar-bg:    var(--color-brand-dark);
  --color-page-bg:       var(--color-brand-cream);

  /* Status */
  --color-scheduled:   #3B82F6;
  --color-in-progress: #F59E0B;
  --color-complete:    #22C55E;
  --color-issue:       #EF4444;

  /* shadcn overrides */
  --background: 245 245 240;
  --foreground: 26 26 26;
  --primary: 61 107 44;
  --primary-foreground: 255 255 255;
  --secondary: 201 168 76;
  --secondary-foreground: 255 255 255;
  --sidebar-background: 28 43 26;
  --sidebar-foreground: 255 255 255;
  --sidebar-primary: 90 144 64;
  --sidebar-accent: 40 60 38;
  --sidebar-border: 45 75 40;
}
```

**Fonts:** Add to `layout.tsx` via `next/font/google`
- `Playfair_Display` — headings, display text
- `Inter` — all UI body/labels

---

## 🗄️ Supabase Schema — Migration 001
File: `supabase/migrations/001_initial_schema.sql`

```sql
-- Enable UUID
create extension if not exists "uuid-ossp";

-- COMPANIES (multi-tenant root)
create table companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  logo_url text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip text,
  created_at timestamptz default now()
);

-- USER PROFILES
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  company_id uuid references companies(id),
  full_name text,
  phone text,
  role text check (role in ('owner','dispatcher','crew','customer')) default 'crew',
  avatar_url text,
  created_at timestamptz default now()
);

-- CLIENTS
create table clients (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  name text not null,
  company_name text,
  phone text,
  email text,
  preferred_contact text check (preferred_contact in ('phone','email','sms')) default 'phone',
  property_type text check (property_type in ('residential','commercial','hoa')) default 'residential',
  service_address text not null,
  service_city text,
  service_state text,
  service_zip text,
  billing_same_as_service boolean default true,
  billing_address text,
  lot_size_sqft numeric,
  access_notes text,
  gate_code text,
  preferred_crew_id uuid,
  status text check (status in ('active','inactive','prospect','lead')) default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- SERVICES CATALOG
create table services (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  name text not null,
  description text,
  category text check (category in (
    'mowing','edging','fertilization','aeration',
    'cleanup','tree','sprinkler','snow','holiday','other'
  )) default 'other',
  unit text check (unit in ('per_visit','per_sqft','per_hour','flat','per_unit')) default 'per_visit',
  base_price numeric(10,2) not null default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- CREWS
create table crews (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  name text not null,
  color text default '#3D6B2C',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- CREW MEMBERS (junction)
create table crew_members (
  id uuid primary key default uuid_generate_v4(),
  crew_id uuid references crews(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  role text check (role in ('lead','member')) default 'member',
  created_at timestamptz default now()
);

-- JOBS
create table jobs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade not null,
  client_id uuid references clients(id) on delete set null,
  crew_id uuid references crews(id) on delete set null,
  title text not null,
  status text check (status in (
    'unscheduled','scheduled','in_progress','complete','cancelled','issue'
  )) default 'unscheduled',
  scheduled_date date,
  scheduled_start time,
  scheduled_end time,
  actual_start timestamptz,
  actual_end timestamptz,
  notes text,
  is_recurring boolean default false,
  recurrence_rule text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- JOB LINE ITEMS
create table job_line_items (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references jobs(id) on delete cascade not null,
  service_id uuid references services(id) on delete set null,
  description text,
  quantity numeric(10,2) default 1,
  unit_price numeric(10,2) not null,
  total numeric(10,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz default now()
);

-- ACTIVITY LOG
create table activity_log (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id),
  entity_type text,
  entity_id uuid,
  action text,
  actor_id uuid references profiles(id),
  metadata jsonb,
  created_at timestamptz default now()
);

-- RLS
alter table companies enable row level security;
alter table profiles enable row level security;
alter table clients enable row level security;
alter table services enable row level security;
alter table crews enable row level security;
alter table crew_members enable row level security;
alter table jobs enable row level security;
alter table job_line_items enable row level security;
alter table activity_log enable row level security;

-- Profiles policy
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Company-scoped policies
create policy "Company members can view clients"
  on clients for select
  using (company_id in (select company_id from profiles where id = auth.uid()));
create policy "Company members can insert clients"
  on clients for insert
  with check (company_id in (select company_id from profiles where id = auth.uid()));
create policy "Company members can update clients"
  on clients for update
  using (company_id in (select company_id from profiles where id = auth.uid()));

-- Apply same company_id RLS pattern to: services, crews, crew_members, jobs, job_line_items, activity_log
-- (write out full policies for each table following the same pattern)
```

---

## 📁 Folder Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx           ← sidebar + header shell
│   │   ├── page.tsx             ← dashboard home
│   │   ├── clients/
│   │   │   ├── page.tsx         ← client list
│   │   │   ├── new/page.tsx     ← new client form
│   │   │   └── [id]/page.tsx    ← client detail
│   │   ├── jobs/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── services/
│   │   │   └── page.tsx         ← service catalog
│   │   ├── crews/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   └── api/
│       └── supabase/route.ts
├── components/
│   ├── ui/                      ← shadcn primitives only
│   ├── layout/
│   │   ├── sidebar.tsx          ← TLC dark sidebar
│   │   ├── header.tsx
│   │   └── mobile-nav.tsx
│   ├── clients/
│   │   ├── client-table.tsx
│   │   ├── client-form.tsx
│   │   └── client-combobox.tsx  ← universal search picker
│   ├── jobs/
│   │   ├── job-card.tsx
│   │   └── job-form.tsx
│   └── shared/
│       ├── status-badge.tsx
│       ├── empty-state.tsx
│       └── page-header.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── types.ts             ← generated from schema
│   └── utils.ts
└── types/
    └── index.ts
```

---

## 📄 Pages to Build in Phase 1

### 1. Login Page — `/login`
- TLC dark background (#1C2B1A), centered card
- TLC logo top-center: https://tlclandscapemanagement.com/wp-content/uploads/2022/07/TLC-Logo-1.png
- Email + password fields, Supabase auth
- "Sign in" button in brand green
- No sign-up link — admin creates accounts only

### 2. Dashboard Home — `/`
- 4 stat cards: Today's Jobs / Active Clients / Open Issues / Crews Out
- Recent jobs table (last 10, with status badges)
- Quick actions bar: + New Job, + New Client, View Today's Routes
- All using TLC colors

### 3. Client List — `/clients`
- TanStack Table: Name, Property Type, Address, Status, Assigned Crew, Actions
- Search bar (filters name + address + phone live)
- Filter chips: All / Active / Inactive / Prospect
- "+ New Client" button (brand gold #C9A84C)
- Empty state with icon + "Add your first client" CTA
- Row click → client detail page

### 4. New Client Form — `/clients/new`
- Two-column layout desktop, single column mobile
- Google Maps address autocomplete on service_address
- "Billing same as service address" toggle — hides billing fields when on
- Property type selector (icon buttons: 🏠 Residential / 🏢 Commercial / 🏘️ HOA)
- Access notes + gate code fields
- Save → redirects to client detail

### 5. Client Detail — `/clients/[id]`
- Top: name, contact info, status badge, edit button
- Tab layout: Overview / Jobs / Notes / Activity
- Overview tab: service address on mini-map (Mapbox static), lot size, access notes
- Jobs tab: list of all jobs for this client with status
- Empty states on all tabs

### 6. Service Catalog — `/services`
- Card grid — each card: service name, category icon, unit, price
- "+ Add Service" slides in a shadcn Sheet
- Category filter tabs across top
- Toggle active/inactive inline on each card

### 7. Crews — `/crews`
- Crew cards with color dot, crew name, member count, active jobs today
- Expandable to show member list
- "+ New Crew" button

---

## 🧩 ClientCombobox Component
**Most important reusable component.** Every form that needs a client uses this.

Behavior:
- On focus: show 5 most recently active clients
- On type: debounced search (300ms) against name + phone + address
- Each result shows: name, property type badge, address
- "No results" state with "+ Add New Client" inline button → opens mini new-client sheet
- On select: stores client_id, displays client name in field
- Keyboard navigable (↑↓ + Enter)

Files:
- `components/clients/client-combobox.tsx`
- Use shadcn Popover + Command components as base

---

## ✅ Definition of Done — Phase 1
- [ ] Supabase migration 001 SQL file committed (ready to run)
- [ ] Auth working — login/logout, session persists
- [ ] Sidebar renders with TLC dark theme, all nav links functional
- [ ] Client list loads from Supabase with search + filter
- [ ] New client form saves to DB, address autocomplete works
- [ ] Client detail page renders with tabs
- [ ] Service catalog renders, add/edit/toggle works
- [ ] Crews page renders
- [ ] ClientCombobox works everywhere it's used
- [ ] All status badges use correct colors
- [ ] Mobile responsive — no broken layouts below 375px
- [ ] No hardcoded colors — everything uses CSS variables
- [ ] CLAUDE.md committed to repo root documenting stack + conventions

---

## ❌ Do NOT Touch in Phase 1
- Route management (Phase 4)
- Estimating engine (Phase 2)
- Customer portal (Phase 7)
- Billing / Stripe (Phase 5)
- Anything requiring Mapbox beyond static client address pin
