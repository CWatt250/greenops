# TLC Management Platform

**Field Service Management Platform for TLC Landscape Management — built by Watt Systems**

A full-stack, production-grade crew management, estimating, route optimization, billing, and customer portal platform — built specifically for TLC Landscape Management in the Tri-Cities, WA.

🔗 **Live App:** [greenops-rho.vercel.app](https://greenops-rho.vercel.app)

---

## What It Does

TLC Management Platform replaces clipboards, group texts, spreadsheets, and disconnected tools with one unified platform for every role:

| Role | What They Get |
|---|---|
| **Owner** | Analytics dashboard, revenue tracking, crew performance |
| **Dispatcher** | Schedule board, route builder, crew overview, client management |
| **Crew** | Mobile job list, GPS clock-in/out, photo upload, signature capture |
| **Customer** | Self-service portal — job history, invoices, requests, messaging |

---

## ✨ Features

### 🗂️ Client Base
- Full CRM — name, address, property type, access notes, gate codes
- Search-as-you-type ClientCombobox used across every form
- Residential / Commercial / HOA support
- CSV import, duplicate detection
- Invite clients to self-service portal via magic link

### 📋 Job Management
- Create one-time or recurring jobs (iCal RRULE)
- Line items editor — services, qty, unit price, running total
- Status workflow: Unscheduled → Scheduled → In Progress → Complete
- Before/after photo upload, customer signature capture
- Activity log per job

### 📅 Schedule
- Drag-and-drop weekly calendar grid
- Crew swim lanes — color coded per crew
- Unscheduled jobs panel — drag onto calendar to assign
- Supabase Realtime — changes reflect live across all users

### 💰 Estimating
- Build estimates from service catalog
- Markup %, discount %, tax rate
- Live summary panel with grand total
- Convert accepted estimate → job in one click
- PDF generation with TLC branding

### 🗺️ Route Management
- Split-pane route builder — stop list + Mapbox map
- Numbered pins, polyline connecting all stops
- **Multi-crew VROOM optimization** — 36 jobs across 8 crews solved in seconds
- AI resequencing with "time saved" toast notification
- Weather forecast integration — flags rain/snow days
- Dispatch to crew → fires Realtime notification to all crew members
- Live route tracking — crew GPS pins update in real time

### 📱 Crew Mobile
- Separate mobile-first interface for crew (no admin sidebar)
- Today's jobs in optimized stop order
- GPS clock-in/out with coordinate capture
- Before/after photo upload
- Customer signature pad
- "Get Directions" → deep links to Google Maps
- Role-based redirect on login

### 🧾 Billing
- Auto-generate invoice from completed job
- Invoice number sequence (TLC-1001, TLC-1002...)
- Status lifecycle: Draft → Sent → Viewed → Paid → Overdue
- Record manual payments (cash, check, card, bank transfer)
- Recurring billing schedules with RRULE
- PDF invoices with TLC branding

### 📊 Analytics
- Revenue MTD, outstanding balance, avg invoice value — with trend vs last period
- Monthly revenue chart (invoiced vs collected)
- Job status donut chart
- Crew performance — completion rate, avg duration, issues flagged
- Client profitability table — lifetime revenue, low-engagement flags
- Route efficiency — avg drive time, stops per route
- CSV export on all tables
- Materialized views for fast queries

### 👤 Customer Portal
- Magic link auth — no password needed
- Dashboard — next scheduled service, outstanding invoice alert
- Job history with before/after photos
- Invoice viewing + PDF download
- Service request submission (6 types)
- iMessage-style threaded messaging with TLC office
- Complaint reporting with severity levels + photo upload
- Notification preferences
- All portal activity routed to admin queue with Realtime updates

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16, App Router, TypeScript |
| Database | Supabase (PostgreSQL + RLS + Realtime) |
| Auth | Supabase Auth (magic link + email/password) |
| UI | shadcn/ui + Tailwind CSS v4 |
| Forms | react-hook-form + Zod |
| Tables | TanStack Table + TanStack Query |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Maps | Mapbox GL + react-map-gl |
| Route Optimization | VROOM (Vehicle Routing Open-source Optimization Machine) |
| Charts | Recharts |
| PDF | @react-pdf/renderer |
| Recurring Jobs | rrule |
| Signatures | react-signature-canvas |
| Weather | OpenWeatherMap API |
| Deployment | Vercel |

---

## 🗄️ Database Schema

7 migrations, 20+ tables:

```
001_initial_schema     — companies, profiles, clients, services, crews, jobs, job_line_items
002_estimates          — estimates, estimate_line_items, job_series
003_crew_control       — clock_events, job_photos, notifications
004_routes             — routes, route_stops
005_billing            — invoices, invoice_line_items, payments, billing_schedules
006_analytics          — mv_revenue_by_month, mv_crew_performance, mv_client_revenue, mv_route_efficiency
007_customer_portal    — portal_users, service_requests, messages, complaints, portal_notifications
```

---

## 🏃 Local Development

### Prerequisites
- Node.js 18+
- Docker (for local Supabase)
- Supabase CLI

### Setup

```bash
# Clone the repo
git clone https://github.com/CWatt250/greenops.git
cd greenops

# Install dependencies
npm install

# Start local Supabase
supabase start

# Copy env vars
cp .env.example .env.local
# Fill in your keys (see Environment Variables below)

# Run migrations
supabase db reset

# Start dev server
npm run dev
```

App runs at: `http://localhost:3000`
Supabase Studio: `http://127.0.0.1:54323`

### Dev Server Restart (if needed)
```bash
pkill -f node
cd ~/greenops
git pull origin main
rm -rf .next
npm run dev
```

---

## 🔑 Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_MAPBOX_TOKEN=
NEXT_PUBLIC_OWM_KEY=
RESEND_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
```

---

## 👥 User Roles

| Role | Login Redirect | Access |
|---|---|---|
| `owner` | `/dashboard` | Full access |
| `dispatcher` | `/dashboard` | Full access except settings |
| `crew` | `/today` | Mobile crew view only |
| `customer` | `/portal` | Customer portal only |

Default admin: `admin@tlc.com`

---

## 🚀 Deployment

Deployed on Vercel. Every push to `main` triggers an auto-deploy.

Add all environment variables in:
**Vercel Dashboard → Project → Settings → Environment Variables**

---

## 📍 About TLC Landscape Management

TLC Landscape Management is the leading landscape management provider in the Tri-Cities, WA (Kennewick, Richland, Pasco) — serving residential, commercial, and HOA clients since 2017.

🌐 [tlclandscapemanagement.com](https://tlclandscapemanagement.com)
📞 (509) 627-9384
📍 1053 S Highland Dr, Kennewick, WA 99337

---

## 📄 License

Private — built exclusively for TLC Landscape Management.

