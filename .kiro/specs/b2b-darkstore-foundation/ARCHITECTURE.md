# Architecture — B2B Darkstore MVP

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER LAYER                         │
│                                                             │
│  ┌──────────────────────┐    ┌──────────────────────────┐  │
│  │   /app/manager        │    │   /app/picker             │  │
│  │   Manager Dashboard   │    │   Picker Execution App    │  │
│  │                       │    │                           │  │
│  │  10×10 Floor Grid     │    │  Task Card (1-at-a-time)  │  │
│  │  Realtime Markers     │    │  ITEM FOUND / MISSING     │  │
│  │  Agent Reasoning Log  │    │  Snake Path Mini-Map      │  │
│  └──────────┬───────────┘    └────────────┬──────────────┘  │
│             │ WebSocket (read)             │ HTTP POST        │
└─────────────┼──────────────────────────── ┼─────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────────┐   ┌─────────────────────────────┐
│  SUPABASE REALTIME      │   │  NEXT.JS API ROUTE           │
│  supabase.channel()     │   │  /app/api/agent/route.ts     │
│                         │   │                              │
│  Subscribes to:         │   │  POST action=assign          │
│  - bins (UPDATE/INSERT) │   │    → congestion check        │
│  - pickers (UPDATE)     │   │    → create task OR re-route │
│  - tasks (INSERT)       │   │                              │
│                         │   │  POST action=missing         │
│  Pushes diffs to        │   │    → flag bin ghosting       │
│  all subscribed clients │   │    → complete task           │
└────────────┬────────────┘   │    → set picker idle         │
             │                │                              │
             │                │  GET (ghost sweep)           │
             │                │    → find stale tasks        │
             │                │    → bulk flag bins          │
             │                └──────────────┬───────────────┘
             │                               │
             ▼                               ▼
┌──────────────────────────────────────────────────────────┐
│               SUPABASE POSTGRESQL (Free Tier)             │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │  bins    │    │ pickers  │    │  tasks           │   │
│  │          │    │          │    │                  │   │
│  │ id       │◄───│ id       │───►│ id               │   │
│  │ label    │    │ name     │    │ picker_id (FK)   │   │
│  │ aisle_id │    │ aisle    │    │ bin_id (FK)      │   │
│  │ x, y     │    │ status   │    │ sku_name         │   │
│  │ status   │    └──────────┘    │ assigned_at      │   │
│  │ last_aud │                    │ completed_at     │   │
│  └──────────┘                    └──────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Data Flow — "Item Missing" Full Cycle

This is the most important flow. It touches every layer.

```
Picker taps "ITEM MISSING"
         │
         ▼
/app/picker/page.tsx
  fetch POST /api/agent
  body: { action: "missing", picker_id, bin_id }
         │
         ▼
/app/api/agent/route.ts  (server, service role key)
  1. Fetch active task for picker+bin
  2. Compute elapsed time vs. 3× AVG_PICK_TIME_MS
  3. UPDATE bins SET status='ghosting_suspected', last_audit=now()
  4. UPDATE tasks SET completed_at=now()
  5. UPDATE pickers SET status='idle'
  6. Return { status: 'GHOSTING_FLAGGED', message }
         │
         ▼ (Supabase Realtime fires on UPDATE to bins)
         │
         ├──────────────────────────────────────────────►
         │                                               │
/app/picker/page.tsx                        /app/manager/page.tsx
  Receives AgentResponse                    postgres_changes event fires
  Shows success feedback                    setBins() updates local state
  Sets task → null                          BinCell re-renders with
  Shows "waiting for next task"             animate-pulse-red class
                                            LogRow appended to Agent Log
                                            "GHOST ALERT: Bin X flagged"
```

**Key insight:** The Picker and Manager never talk to each other. They both react independently to the same Supabase Realtime event. This is the "agentic" self-correction: a single DB write propagates to all surfaces simultaneously.

---

## 3. Data Flow — Congestion Re-Routing

```
System needs to assign a task to Picker P-02 in Aisle B
         │
         ▼
POST /api/agent { action: "assign", picker_id, aisle_id: "B" }
         │
         ▼
Agent queries:
  SELECT count(*) FROM pickers
  WHERE current_aisle = 'B' AND status = 'picking'
         │
    count = 2  (≥ CONGESTION_LIMIT)
         │
         ▼
Agent queries alternative:
  SELECT * FROM bins
  WHERE status = 'ok' AND aisle_id != 'B'
  LIMIT 5
         │
         ▼
Returns: { status: 'RE_ROUTE', alternative_bin: { label: 'C-012', aisle_id: 'C' } }
         │
         ▼
Picker App shows rerouted task card
Manager Log shows: "Aisle B congested. Routing to bin C-012."
```

---

## 4. File Structure

```
b2b-darkstore/
├── app/
│   ├── layout.tsx              # Root layout (fonts, global styles)
│   ├── page.tsx                # Landing → redirects to /manager
│   ├── manager/
│   │   └── page.tsx            # Manager Dashboard (CLIENT COMPONENT)
│   ├── picker/
│   │   └── page.tsx            # Picker App (CLIENT COMPONENT)
│   └── api/
│       └── agent/
│           └── route.ts        # Agent API (SERVER, service role)
├── lib/
│   ├── supabase.ts             # Supabase client (browser, anon key)
│   └── types.ts                # TypeScript interfaces
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── docs/
│   ├── PRD.md
│   ├── TECHSTACK.md
│   ├── ARCHITECTURE.md
│   ├── IMPLEMENTATION_FRONTEND.md
│   ├── IMPLEMENTATION_BACKEND.md
│   └── DESIGN.md               # Stitch export
├── tailwind.config.js
├── .env.example
├── .env.local                  # NEVER commit
└── SETUP.md
```

---

## 5. Database Schema (Entity-Relationship)

```
bins                          pickers
────────────────────          ────────────────────
id          UUID PK           id            UUID PK
label       TEXT NOT NULL     name          TEXT NOT NULL
aisle_id    TEXT NOT NULL     current_aisle TEXT
x           INT (1-10)        status        ENUM(idle|picking)
y           INT (1-10)
status      ENUM(ok|ghosting_suspected)
last_audit  TIMESTAMPTZ
                                        tasks
                              ────────────────────────────
                              id            UUID PK
                              picker_id     UUID FK → pickers.id
                              bin_id        UUID FK → bins.id
                              sku_name      TEXT NOT NULL
                              assigned_at   TIMESTAMPTZ NOT NULL
                              completed_at  TIMESTAMPTZ (nullable)
```

---

## 6. Realtime Subscription Map

| Page | Channel Name | Table | Events | Action |
|------|-------------|-------|--------|--------|
| Manager | `manager-realtime` | bins | UPDATE, INSERT | Re-render grid cell |
| Manager | `manager-realtime` | pickers | UPDATE | Re-render picker marker |
| Picker | `picker-{id}` | tasks | INSERT | Show new task card |

**Each browser tab opens exactly 2 WebSocket subscriptions.** Well within Supabase free tier limits (200 concurrent).

---

## 7. Agent Decision Logic (Pseudocode)

```typescript
// Congestion check threshold
const AISLE_CONGESTION_LIMIT = 2

// Ghost detection threshold  
const GHOST_MULTIPLIER = 3
const AVG_PICK_TIME_MS = 90_000  // 90 seconds

// Ghost detection logic
function isGhost(task: Task): boolean {
  const elapsed = Date.now() - new Date(task.assigned_at).getTime()
  return elapsed > GHOST_MULTIPLIER * AVG_PICK_TIME_MS  // > 270 seconds
}

// Congestion logic
function isCongested(pickerCountInAisle: number): boolean {
  return pickerCountInAisle >= AISLE_CONGESTION_LIMIT
}
```

Both thresholds are constants in `route.ts`. In a post-MVP iteration, these would be stored in a `config` table so managers can tune them without a deploy.

---

## 8. Security Model (MVP)

| Surface | Key Used | Trust Level |
|---------|----------|-------------|
| Browser Supabase client | `ANON_KEY` | Low — read-only realtime |
| API Route agent | `SERVICE_ROLE_KEY` | High — bypasses RLS, all writes |
| Vercel serverless | Environment variable | Secure — never in client bundle |

**Row Level Security (RLS):** Disabled in MVP for speed. Post-MVP: enable RLS with policies per picker_id.
