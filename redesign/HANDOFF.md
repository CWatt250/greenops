# TLC Management Platform — Visual Design Handoff

**For:** Claude Code, integrating into `github.com/CWatt250/greenops` (Next.js + Supabase)
**From:** Visual design prototype (vanilla React + CSS, no build step)
**Goal:** Port the visual system + component patterns from this prototype into the existing Next.js app — keep the live backend, replace the UI layer.

---

## 1. What's in this prototype

A static HTML mockup of the full TLC Management Platform with mock data:

- **Office view** — Dashboard, Schedule, Routes, Crew Dispatch, Clients, Jobs, Crews, Services, Estimates, Invoices, Billing, Analytics, Portal Inbox, Settings
- **Customer portal** — light, single-property focused
- **Crew mobile** — phone-frame view of the field crew app

All views are real, clickable, and rendered with the final design system. Data is mocked in `src/data.jsx`. **No backend logic is in scope** — your Supabase models stay as-is.

---

## 2. Tech stack mapping

| Prototype | Production target |
|---|---|
| Vanilla React via `<script type="text/babel">` | Next.js App Router (`app/` dir) + React Server Components where possible |
| Plain CSS in `src/styles.css` with CSS custom properties | Either keep as `globals.css` (fastest) or port tokens to Tailwind config |
| `window.GREENOPS` global mock data | Supabase queries + Server Actions |
| `<script src="src/icons.jsx">` inline-defined `Icon.*` | `lucide-react` (the icons are 1:1 lucide outlines) |
| Phone frame component (`ios-frame.jsx`) | Keep for design preview, or scope crew-mobile to its own responsive route `/crew` |

---

## 3. Design tokens — drop straight into your CSS

The full token system is in `src/styles.css` under `:root`. Key tokens:

```css
/* Brand */
--orange: #F15A24;        /* TLC primary — buttons, active states, accents */
--orange-deep: #D14816;   /* Hover */
--orange-soft: #FFE3CF;   /* Tinted backgrounds */

/* Surfaces */
--bg: #FAF7F2;            /* App background (warm off-white) */
--surface: #FFFFFF;       /* Card / panel */
--surface-2: #FFFFFF;
--border: #E0DCCD;
--ink-900: #0B0B0B;       /* Primary text + black sidebar */

/* Type */
--font-display: 'Archivo Black', Impact, sans-serif;   /* Page titles, stat values */
--font-sans: 'Poppins', system-ui, sans-serif;          /* Body, UI */
--font-hand: 'Caveat', cursive;                         /* Eyebrow accents */
--font-mono: 'JetBrains Mono', ui-monospace, monospace; /* Numbers, IDs */
```

Load fonts via `next/font/google` for best LCP:

```tsx
// app/layout.tsx
import { Poppins, Archivo_Black, Caveat, JetBrains_Mono } from 'next/font/google';

const poppins = Poppins({ subsets: ['latin'], weight: ['400','500','600','700','800','900'], variable: '--font-sans' });
const archivo = Archivo_Black({ subsets: ['latin'], weight: '400', variable: '--font-display' });
const caveat = Caveat({ subsets: ['latin'], weight: ['600','700'], variable: '--font-hand' });
const jetMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400','500'], variable: '--font-mono' });
```

---

## 4. Brand chrome — must-haves

These are the non-negotiable brand signatures from TLC's existing site (tlclandscapemanagement.com):

1. **Black sidebar with the actual TLC cloud-and-flame logo** (file: `src/tlc-logo.png` — copy into `public/tlc-logo.png`).
2. **Orange (`#F15A24`) for every primary action and active state** — never green, never blue.
3. **Uppercase chunky display headers** in Archivo Black, slightly tracked.
4. **Handwritten orange "eyebrow"** above page titles using Caveat (e.g. `— Serving the Tri-City Area`). The `::before { content: '— '; }` is part of the recipe.
5. **Square-ish 8px-radius buttons** with uppercase 12px tracked-caps labels.

---

## 5. Component → file map

Port these files in roughly this order. Each is self-contained and small.

| Prototype file | Becomes |
|---|---|
| `src/styles.css` | `app/globals.css` (port whole file, 1:1) |
| `src/icons.jsx` | Delete — replace usages with `import { Icon } from 'lucide-react'` |
| `src/ui.jsx` | `components/ui/*` — split into `Logo`, `StatusBadge`, `PropertyTag`, `StatCard`, `Sparkline`, `PageHeader`, `Tabs`, `Chips`, `Avatar`, `Toggle`, `MoneyFmt`, `PhotoPlaceholder` |
| `src/shell.jsx` | `components/layout/Sidebar.tsx` + `Topbar.tsx` |
| `src/admin.jsx` | `app/(office)/dashboard/page.tsx`, `app/(office)/clients/`, `app/(office)/jobs/`, `app/(office)/schedule/` |
| `src/routes-view.jsx` | `app/(office)/routes/` + `app/(office)/dispatch/` |
| `src/finance.jsx` | `app/(office)/estimates/`, `app/(office)/invoices/`, `app/(office)/billing/` |
| `src/ops.jsx` | `app/(office)/crews/`, `app/(office)/services/`, `app/(office)/settings/` |
| `src/analytics.jsx` | `app/(office)/analytics/` + `app/(office)/portal-inbox/` |
| `src/portal.jsx` | `app/(portal)/` route group with its own layout |
| `src/crew-mobile.jsx` | `app/(crew)/` route group with its own layout (mobile-first) |
| `src/data.jsx` | **Delete** — all data comes from Supabase |
| `src/ios-frame.jsx` | Skip — production crew app is a real responsive route, not a phone-frame |

---

## 6. Data model touch points

The mock `window.GREENOPS` defines the shape components expect. Map these to your existing Supabase tables:

- `CLIENTS` → `clients` (`id, name, address, type: residential|commercial|hoa, phone, email, primary_contact, billing, status, lifetime_value`)
- `CREWS` → `crews` (`id, name, members[], lead_id, vehicle, status`)
- `SERVICES` → `services` (`id, name, category, default_duration_min, default_price`)
- `JOBS` → `jobs` (`id, client_id, service_id, crew_id, scheduled_at, status: scheduled|in_progress|complete|issue, address, notes, photos[]`)
- `INVOICES` → `invoices` (`id, client_id, job_ids[], amount, status: draft|sent|viewed|paid|overdue, due_date, sent_at`)
- `ESTIMATES` → `estimates` (`id, client_id, line_items[], total, status: draft|sent|viewed|accepted|declined`)
- `PORTAL_ACTIVITY` → `portal_messages` / `portal_events` (whatever you have)

If your existing table names differ, the simplest path is a thin `lib/queries.ts` adapter that maps your real schema to these prop shapes.

---

## 7. Maps integration

The `mapbox-fake` CSS class in styles.css is a placeholder gradient grid. Replace with **Mapbox GL JS**:

- Routes view (`src/routes-view.jsx` → `app/(office)/routes/[id]/page.tsx`) needs:
  - Basemap (use `streets-v12` or `outdoors-v12` style)
  - Numbered markers — keep the `.pin` styling, mount as `Marker` elements
  - **Real driving polyline** via [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/) — request `geometries: 'geojson'`, render as a `LineString` source with the `.pin` orange color
  - Live truck position (Supabase Realtime → marker re-render)

Token via `NEXT_PUBLIC_MAPBOX_TOKEN`.

---

## 8. Status colors — wired to enums

Badge classes in `styles.css` map 1:1 to job/invoice statuses. Match your enum names exactly:

```
job.status:     scheduled | in_progress | complete | issue | unscheduled
invoice.status: draft | sent | viewed | paid | overdue
estimate.status: draft | sent | viewed | accepted | declined
```

Use `<StatusBadge status={job.status} />` — the component picks the class.

---

## 9. Things explicitly NOT designed yet

Flag these to the product owner before building:

- **Authentication screens** (login/signup/password reset) — only a `.login-bg` gradient exists
- **Onboarding flow** for new clients/crews
- **Notification center** (the bell icon is decorative)
- **Email/SMS templates** for portal invitations and invoice sends
- **Bulk import** (CSV upload of clients)
- **Print views** for invoices/estimates
- **Permissions model** (owner vs. office vs. crew lead vs. crew member)

---

## 10. Quick-start for Claude Code

```bash
# In the greenops repo
cp /path/to/handoff/src/styles.css ./app/globals.css
cp /path/to/handoff/src/tlc-logo.png ./public/tlc-logo.png

# Install fonts + icons
pnpm add lucide-react

# Add to app/layout.tsx — see §3
```

Then port screens in this order (highest UX value first):
1. **Sidebar + Topbar** (visible on every page)
2. **Dashboard** (the demo screen)
3. **Schedule + Routes** (operational core)
4. **Clients + Jobs** (CRUD-heavy)
5. **Estimates + Invoices** (revenue path)
6. **Customer portal** (separate route group, lighter chrome)
7. **Crew mobile** (separate route group, mobile-first)

Each prototype file is small (~200–400 lines) — port one screen at a time, ship to staging, review, repeat.

---

## 11. Files in this handoff package

```
GreenOps Prototype.html        ← entry; rename to index.html if desired
src/
  styles.css                   ← design tokens + all component styles
  tlc-logo.png                 ← TLC brand mark (drop in /public)
  icons.jsx                    ← (replace with lucide-react)
  ui.jsx                       ← shared primitives
  shell.jsx                    ← Sidebar + Topbar
  data.jsx                     ← mock data (delete in prod)
  ios-frame.jsx                ← phone-frame for mobile preview only
  admin.jsx, routes-view.jsx, finance.jsx, ops.jsx,
  analytics.jsx, portal.jsx, crew-mobile.jsx
  main.jsx                     ← root view router
HANDOFF.md                     ← this document
```

Open `GreenOps Prototype.html` in any browser to see the full system running with mock data — no build step required.
