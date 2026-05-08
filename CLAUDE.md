@AGENTS.md

# TLC Management Platform

Operations platform for TLC Landscape Management — built by Watt Systems with Next.js 16, Supabase, and shadcn/ui. (Repo name `greenops` is preserved internally.)

## Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Backend:** Supabase (Postgres + Auth + RLS)
- **UI:** shadcn/ui + Tailwind CSS v4
- **Forms:** react-hook-form + zod
- **Tables:** @tanstack/react-table
- **State:** @tanstack/react-query (Phase 2+)
- **Drag/Drop:** @dnd-kit/core (Phase 4+)
- **Maps:** mapbox-gl + react-map-gl (Phase 3+)

## Conventions

### Directory layout (no `src/` prefix)
```
app/
  (auth)/         — unauthenticated pages
  (dashboard)/    — authenticated app shell
  api/            — API routes
components/
  ui/             — shadcn primitives only, never edit manually
  layout/         — sidebar, header, mobile-nav
  clients/        — client-specific components
  jobs/           — job-specific components
  shared/         — reusable across features
lib/
  supabase/       — client.ts (browser), server.ts (SSR), types.ts
  utils.ts        — cn(), formatCurrency(), formatDate(), debounce()
types/
  index.ts        — all TypeScript types derived from DB schema
supabase/
  migrations/     — SQL migration files
```

### Auth pattern
- `lib/supabase/server.ts` — for Server Components and Server Actions
- `lib/supabase/client.ts` — for Client Components (`'use client'`)
- `middleware.ts` — redirects unauthenticated users to `/login`

### Brand tokens
All colors must use CSS variables — never hardcode hex values in className.
- Primary green: `var(--color-brand-green-raw)` / `#3D6B2C`
- Gold CTA: `var(--color-brand-gold-raw)` / `#C9A84C`
- Dark sidebar: `var(--color-brand-dark-raw)` / `#1C2B1A`
- Page bg: `var(--color-brand-cream-raw)` / `#F5F5F0`

### Status colors
Defined in `components/shared/status-badge.tsx`. Always use `<StatusBadge>` — never inline status styles.

### Multi-tenancy
Every DB table has `company_id`. Always scope queries to the user's `company_id` from `profiles`.

## Environment variables
Copy `.env.local.example` to `.env.local` and fill in your Supabase and Mapbox credentials.

## Database
Run `supabase/migrations/001_initial_schema.sql` against your Supabase project to create all tables and RLS policies.

## Phase roadmap
- **Phase 1** (current): Auth, clients, jobs, services, crews
- **Phase 2**: Estimating engine
- **Phase 3**: Map/route views
- **Phase 4**: Route management + drag/drop scheduling
- **Phase 5**: Billing / Stripe
- **Phase 7**: Customer portal
