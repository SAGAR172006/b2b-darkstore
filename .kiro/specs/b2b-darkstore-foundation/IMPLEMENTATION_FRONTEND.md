# Implementation Guide — Frontend
## B2B Darkstore MVP

**Stack:** Next.js 14 App Router · Tailwind CSS · Lucide React · Supabase JS (Realtime)  
**Design System:** Cyan Tech (light mode, 0px radius, Space Grotesk + Inter)

---

## How to Use This Document

Each section below is a **self-contained build prompt**. Feed them to your AI code editor (Kiro, Cursor, Copilot) one at a time, in order. Do not skip steps — each one depends on the last.

**Before you start:** Run `SETUP.md` Steps 1–4 (scaffold, install, Supabase schema, env vars).

---

## PROMPT F-01: Root Layout & Global Styles

**Goal:** Set up `app/layout.tsx` with the correct fonts, Tailwind config, and design tokens from the Cyan Tech design system.

---

**Prompt to paste into your AI editor:**

```
Create app/layout.tsx for a Next.js 14 App Router project called "B2B Darkstore".

Requirements:
- Import Space Grotesk (weights 400,500,600,700,900) and Inter (weights 300,400,500,600,700) from next/font/google
- Apply Inter as the default body font via a CSS variable --font-body
- Apply Space Grotesk via CSS variable --font-headline
- Set <html> to light mode class: className="light"
- Set <body> bg to #eff8ff (matches Tailwind bg-background token) and text to #003347
- Title: "B2B Darkstore"
- The layout should be a full-height flex column (min-h-screen)

In tailwind.config.js, extend the theme with these exact color tokens (copy verbatim):
  primary: '#00647d'
  primary-fixed: '#02cbfc'  (the bright cyan — used for borders, accents, CTAs)
  primary-container: '#02cbfc'
  on-primary: '#e3f6ff'
  on-primary-container: '#003e4f'
  secondary: '#006287'
  secondary-container: '#9cd9ff'
  background: '#eff8ff'
  surface: '#eff8ff'
  surface-container: '#d1ecff'
  surface-container-low: '#e3f3ff'
  surface-container-high: '#c4e7ff'
  surface-container-highest: '#b7e3ff'
  surface-container-lowest: '#ffffff'
  on-surface: '#003347'
  on-surface-variant: '#356078'
  outline: '#527c95'
  outline-variant: '#88b3cd'
  error: '#b31b25'
  error-container: '#fb5151'
  on-error: '#ffefee'
  on-background: '#003347'
  tertiary: '#3754b7'
  tertiary-container: '#99acff'

Also set:
  borderRadius: { DEFAULT: '0px', lg: '0px', xl: '0px', full: '9999px' }
  fontFamily: { headline: ['Space Grotesk'], body: ['Inter'], label: ['Space Grotesk'] }

Ensure tailwind.config.js has content paths for: ./app/**/*.{ts,tsx} and ./lib/**/*.{ts,tsx}
```

**Checkpoint:** Run `npm run dev`. Open http://localhost:3000. Background should be a pale cyan-blue (#eff8ff). No errors in console.

---

## PROMPT F-02: `lib/supabase.ts` and `lib/types.ts`

**Goal:** Set up the typed Supabase browser client and all TypeScript interfaces.

---

**Prompt:**

```
Create two files: lib/supabase.ts and lib/types.ts for a Next.js 14 + Supabase project.

lib/types.ts must export:
- BinStatus = 'ok' | 'ghosting_suspected'
- PickerStatus = 'idle' | 'picking'
- Bin interface: { id: string, label: string, aisle_id: string, x: number, y: number, status: BinStatus, last_audit: string | null }
- Picker interface: { id: string, name: string, current_aisle: string | null, status: PickerStatus }
- Task interface: { id: string, picker_id: string, bin_id: string, sku_name: string, assigned_at: string, completed_at: string | null }
- AgentResponse interface: { status: 'ASSIGNED' | 'RE_ROUTE' | 'GHOSTING_FLAGGED' | 'ERROR', message: string, task?: Task, alternative_bin?: Bin }
- Database interface (for typed createClient): public.Tables for bins, pickers, tasks — each with Row, Insert, Update shapes

lib/supabase.ts must:
- Use createClient from '@supabase/supabase-js'
- Read NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from process.env
- Throw a clear error message if either variable is missing
- Export a single 'supabase' client typed with Database
- Configure realtime: { params: { eventsPerSecond: 10 } }
```

**Checkpoint:** `npx tsc --noEmit` should pass with zero errors.

---

## PROMPT F-03: Manager Dashboard — Shell & Stats Sidebar

**Goal:** Build the static shell of the Manager Dashboard at `/app/manager/page.tsx`. No realtime yet — just layout and mock data.

---

**Prompt:**

```
Build the shell of app/manager/page.tsx as a 'use client' Next.js component.

Design reference (Cyan Tech system):
- Background: bg-background (#eff8ff), full dark-dashboard look NOT used — this is light mode
- Font: Space Grotesk for headings/labels, Inter for body
- All borders: 90-degree corners (border-radius: 0)
- Primary accent: #02cbfc (cyan)
- Error accent: #b31b25

Layout (3-column):
1. LEFT SIDEBAR (w-48): 
   - App name "B2B DARKSTORE" in Space Grotesk bold italic cyan, with grid_view icon
   - Nav links: Dashboard (active with cyan underline), Inventory, Orders, Analytics, Fleet
   - Stat cards at bottom: Active Pickers (number/total), Ghost Alerts (red if >0), Bin Health %
   - "CREATE BATCH" button (full-width, cyan fill)
   
2. CENTER (flex-1):
   - Top bar: "LIVE FLOOR MAP | GRID UNIT 1.2M" label, zoom buttons (use Lucide ZoomIn/ZoomOut/Layers icons)
   - Zone label "ZONE ALPHA-7 — OPERATIONAL" 
   - 10×10 grid area (placeholder div with bg-surface-container-highest for now)
   - Grid legend at bottom: Active Picker (cyan square), Congestion Point (red square), Storage Rack (gray square)
   
3. RIGHT SIDEBAR (w-80):
   - "LIVE THROUGHPUT" section: two large metric cards "412 UNITS/HOUR" and "98.4% ACCURACY" (use mock data)
   - Progress bars: ZONE LOAD 78%, QUEUE DEPTH 142 Orders
   - "AGENT REASONING LOG" section header with "STREAMING" badge
   - Empty log area (scrollable, h-96) with placeholder text "Awaiting events..."
   - Query input at bottom: text field + send button

Use Tailwind only. No chart libraries. Match the screenshot layout from the Stitch prototype: left nav + center grid + right panel.
```

**Checkpoint:** Page renders with correct 3-column layout. Sidebar visible. No TypeScript errors.

---

## PROMPT F-04: Manager Dashboard — 10×10 Realtime Grid

**Goal:** Replace the placeholder grid area with a live 10×10 grid that subscribes to Supabase Realtime.

---

**Prompt:**

```
Upgrade app/manager/page.tsx to implement the live 10×10 floor grid.

Replace the placeholder grid div with this implementation:

1. On mount, fetch all bins from Supabase: supabase.from('bins').select('*')
   Store in useState<Bin[]>

2. On mount, fetch all pickers from Supabase: supabase.from('pickers').select('*')
   Store in useState<Picker[]>

3. Subscribe to Supabase Realtime channel 'manager-realtime':
   - postgres_changes on bins table (event: '*') → update bins state by id
   - postgres_changes on pickers table (event: '*') → update pickers state by id
   - On SUBSCRIBED: set connected=true, push log entry "WebSocket SUBSCRIBED"
   - On CLOSED/ERROR: set connected=false, push log entry "WebSocket disconnected"
   - Return cleanup: supabase.removeChannel(channel)

4. Build a BinCell component that accepts { bin: Bin | undefined, picker: Picker | undefined }:
   - If no bin: render a dim placeholder cell
   - If bin.status === 'ghosting_suspected': 
     - border-2 border-error (#b31b25)
     - bg-error/10
     - pulsing red ring animation (keyframes pulse-red in tailwind.config.js)
     - AlertTriangle Lucide icon top-right corner, red
   - If bin status === 'ok':
     - border border-primary-fixed/30
     - bg-surface-container
   - If picker active in this bin's aisle:
     - Show a small cyan circle with User icon (Lucide) overlaid, animate-pulse
   - Show bin.label in 9px monospace text

5. Render the grid:
   - CSS Grid, 10 columns, gap-1, width min(60vw, 520px), centered
   - Loop rows 1-10, cols 1-10
   - Look up bin by matching x=col, y=row from bins array
   - Look up picker by matching current_aisle === bin.aisle_id
   - Render BinCell for each cell

6. Connection status indicator in top bar:
   - Green pulsing dot + "LIVE" when connected
   - Red dot + "OFFLINE" when not

7. Inject CSS keyframe for pulse-red:
   @keyframes pulse-red {
     0%, 100% { box-shadow: 0 0 0 0 rgba(179, 27, 37, 0.5); }
     50% { box-shadow: 0 0 0 8px rgba(179, 27, 37, 0); }
   }
```

**Checkpoint:** Grid renders 100 cells. Open Supabase Table Editor, change one bin's status to 'ghosting_suspected' — it should pulse red on the dashboard within 1 second.

---

## PROMPT F-05: Manager Dashboard — Agent Reasoning Log

**Goal:** Wire the scrolling Agent Reasoning Log to the Realtime subscription events.

---

**Prompt:**

```
Add the Agent Reasoning Log to the right sidebar of app/manager/page.tsx.

Requirements:

1. LogEntry type: { id: string, timestamp: string, message: string, level: 'info' | 'warn' | 'alert' }

2. useState<LogEntry[]> initialized to []

3. pushLog(message, level) helper:
   - Creates a LogEntry with id=crypto.randomUUID(), timestamp=new Date().toLocaleTimeString()
   - Appends to log array (cap at 100 entries with .slice(-99))

4. Call pushLog from the Realtime handler already wired in F-04:
   - bins UPDATE where new.status === 'ghosting_suspected' → level: 'alert', message: "GHOST ALERT: Bin {label} (Aisle {aisle_id}) flagged by agent."
   - bins UPDATE where status changed back to 'ok' → level: 'info', message: "Bin {label} cleared."
   - pickers UPDATE → level: 'info', message: "Picker {name} → {status} (Aisle {aisle_id})"
   - WebSocket SUBSCRIBED → level: 'info', message: "Realtime channel active."
   - Initial data load complete → level: 'info', message: "Initial state loaded. {n} bins, {m} pickers."

5. LogRow component:
   - Flex row: icon | timestamp | message
   - level 'info': cyan-colored icon (Activity from Lucide), muted text
   - level 'warn': amber icon (Zap), amber message text
   - level 'alert': red icon (AlertTriangle), red bold message text
   - 10px font, monospace for timestamp, Inter for message
   - Border-bottom between rows

6. Render in right sidebar scrollable div:
   - Use useRef + scrollIntoView to auto-scroll to newest entry
   - Show oldest at top, newest at bottom
   - Empty state: "Awaiting events..." centered muted text

7. The "STREAMING" badge next to "AGENT REASONING LOG" title:
   - Shows as a solid cyan pill when connected
   - Shows as gray pill when disconnected
   
Also add the query input at the bottom of the log panel:
   - Text input placeholder "QUERY AGENT REASONING..."
   - Send button (Lucide Send icon, cyan)
   - For MVP: on submit, just append a log entry: "QUERY: {input text}" at info level
```

**Checkpoint:** Trigger a ghost flag via curl (`POST /api/agent`). Log should show a red "GHOST ALERT" entry and auto-scroll.

---

## PROMPT F-06: Picker App — Full Implementation

**Goal:** Build the complete mobile-first Picker Execution App at `/app/picker/page.tsx`. This is the most critical mobile screen.

---

**Prompt:**

```
Build app/picker/page.tsx as a 'use client' component. This is a mobile-first warehouse picker app. Max-width 480px, centered.

Design reference (matches Stitch HTML prototype exactly):
- Light mode, bg-background (#eff8ff)
- All corners: 0px border-radius
- Fonts: Space Grotesk for headings/labels, Inter for body
- Primary cyan: #02cbfc
- Error red: #b31b25

HEADER (sticky top):
  - bg-white or bg-slate-50, border-bottom-2 border-slate-200
  - Left: grid icon + "B2B DARKSTORE" in Space Grotesk black italic cyan uppercase
  - Right: "OPERATOR" label (10px uppercase) + picker ID (e.g. "P-8829") + avatar square with person icon

SCREEN 1 — Picker Selection (uiState === 'selecting_picker'):
  - List of Picker items fetched from Supabase
  - Each: white card, border-2 border-primary-fixed/30, picker name + status badge
  - Tap → sets activePicker, fetches their current task, transitions to SCREEN 2 or SCREEN 3

SCREEN 2 — Active Task Card (uiState === 'task_active'):
  SECTION A — Task Card (border-2 border-primary-fixed):
    - Corner badge: "ACTIVE TASK" in bg-primary-fixed text-on-primary-container, Space Grotesk black
    - Label: "LOCATION BIN" in 10px uppercase tracking-widest text-outline
    - Bin label: 6xl–7xl font-black Space Grotesk in text-primary-container (e.g. "A-402-B")
    - SKU name: 18px with inventory_2 icon, text-on-surface-variant
    - Product image: 192×192 grayscale bordered square (use a gray placeholder div with Package icon if no image)
    - Bottom strip (border-top-2): SKU ID (left) | TARGET QTY in 2xl Space Grotesk (right, cyan)

  SECTION B — Action Buttons (grid-cols-2, h-48 each):
    LEFT: "ITEM FOUND" button
      - bg-primary-container (#02cbfc), border-2 border-on-primary-container
      - CheckCircle filled icon, 5xl
      - Space Grotesk black uppercase "ITEM FOUND"
      - On tap: POST /api/agent {action:'missing' is NOT this one}
      - On tap: supabase UPDATE tasks SET completed_at=now(), UPDATE pickers SET status='idle'
      - Show success state then return to idle screen
      
    RIGHT: "ITEM MISSING" button
      - bg-white, border-2 border-error, text-error
      - AlertTriangle icon, 5xl
      - Space Grotesk black uppercase "ITEM MISSING"
      - On tap: fetch POST /api/agent with { action: 'missing', picker_id, bin_id }
      - Show loading spinner during request
      - On GHOSTING_FLAGGED: show confirmation, return to idle
      - On RE_ROUTE: show reroute screen with new bin info
      - On ERROR: show error state with retry button

  SECTION C — Warehouse Snake Path Mini-Map:
    - Section header: "WAREHOUSE SNAKE PATH" + route icon (Space Grotesk bold uppercase 12px)
    - Right badge: "NEXT: AISLE B" in cyan pill
    - Map container: h-32, bg-surface-container-highest, border-2 border-outline-variant
    - SVG snake path (static for MVP):
      path d="M 20 80 L 100 80 L 100 20 L 180 20 L 180 80 L 260 80 L 260 20 L 340 20"
      stroke="#02cbfc" strokeWidth=4 strokeLinecap="square" fill="none"
    - Current position dot: filled cyan circle
    - "YOU ARE HERE: A-4" animated pulse label (white/90 backdrop, border-2 border-primary, 10px)
    - Corner labels: "AISLE A" top-left, "AISLE C" top-right

SCREEN 3 — Idle (no task, uiState === 'idle'):
  - Centered: Package icon + "No active task." + "Waiting for assignment..."
  - Supabase Realtime channel 'picker-{id}' listens for tasks INSERT → auto-transitions to task_active

SCREEN 4 — Submitting (uiState === 'submitting'):
  - Centered Loader2 spin icon + "Contacting agent…"

BOTTOM NAV BAR (fixed bottom):
  - bg-slate-50, border-top-2 border-slate-200, h-16
  - 4 items: Inventory (active, cyan), Orders, Routes, Admin
  - Space Grotesk 10px uppercase labels + Lucide icons
  - Active item: cyan color + cyan top-border underline indicator

All interactive buttons: min-height 56px (large tap targets)
Add spacer div h-16 before closing body to prevent content hidden under fixed nav.
```

**Checkpoint:** On mobile viewport (375px width), both buttons should be clearly tappable. Tap "ITEM MISSING" while watching the Manager Dashboard — the grid cell should pulse red within 1 second.

---

## PROMPT F-07: Landing Page Redirect

**Goal:** The root `/` should redirect to `/manager` so there's no blank page.

---

**Prompt:**

```
In app/page.tsx, add a redirect to /manager using Next.js redirect() from 'next/navigation'.
It should be a server component (no 'use client') that immediately calls redirect('/manager').
```

---

## Frontend Checklist (verify before handoff)

- [ ] F-01: Fonts load correctly, design tokens in tailwind.config.js
- [ ] F-02: TypeScript compiles with zero errors (`npx tsc --noEmit`)
- [ ] F-03: Manager shell renders 3-column layout
- [ ] F-04: 10×10 grid renders all 100 bins from DB
- [ ] F-04: Ghosting bin pulses red in real time
- [ ] F-04: Picker marker appears as cyan dot on grid
- [ ] F-05: Agent log auto-scrolls and color-codes events
- [ ] F-06: Picker app renders at 375px width correctly
- [ ] F-06: "Item Missing" triggers agent and manager updates live
- [ ] F-06: Bottom nav is fixed and doesn't cover content
- [ ] F-07: `/` redirects to `/manager`

---

## Common Mistakes to Avoid

1. **Using `NEXT_PUBLIC_` on the service role key** — This exposes your admin key to the browser. Only the anon key gets `NEXT_PUBLIC_`.

2. **Forgetting `'use client'`** — Any component using `useState`, `useEffect`, or Supabase Realtime MUST have `'use client'` at the top.

3. **Not cleaning up Realtime channels** — Always return `() => supabase.removeChannel(channel)` from `useEffect` or you'll leak WebSocket connections.

4. **Border-radius creeping in** — The design system uses 0px radius everywhere except `border-radius: 9999px` for full pills. No `rounded-lg` or `rounded-md`.

5. **Using dark mode classes** — This design is light-mode only. Don't add `dark:` variants.
