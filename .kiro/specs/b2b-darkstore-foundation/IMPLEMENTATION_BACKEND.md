# Implementation Guide — Backend
## B2B Darkstore MVP

**Stack:** Next.js 14 Route Handlers · Supabase PostgreSQL · TypeScript  
**Agent Logic:** Serverless, stateless, self-correcting

---

## How to Use This Document

Each section below is a **self-contained build prompt**. Feed them to your AI code editor (Kiro, Cursor, Copilot) one at a time, in order.

**Prerequisites:**
- Supabase project created (free tier)
- SQL migration run (`supabase/migrations/001_initial_schema.sql`)
- `.env.local` filled in with all three keys

---

## PROMPT B-01: Database Schema & Seed

**Goal:** Create the Supabase PostgreSQL schema with all tables, indexes, realtime replication, and seed data.

---

**Prompt:**

```
Create a SQL migration file at supabase/migrations/001_initial_schema.sql.

This file will be run in the Supabase SQL Editor. It must:

1. Create table public.bins:
   - id: uuid primary key default gen_random_uuid()
   - label: text NOT NULL
   - aisle_id: text NOT NULL  
   - x: integer NOT NULL CHECK (x BETWEEN 1 AND 10)
   - y: integer NOT NULL CHECK (y BETWEEN 1 AND 10)
   - status: text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'ghosting_suspected'))
   - last_audit: timestamptz (nullable)

2. Create table public.pickers:
   - id: uuid primary key default gen_random_uuid()
   - name: text NOT NULL
   - current_aisle: text (nullable)
   - status: text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'picking'))

3. Create table public.tasks:
   - id: uuid primary key default gen_random_uuid()
   - picker_id: uuid NOT NULL REFERENCES public.pickers(id) ON DELETE CASCADE
   - bin_id: uuid NOT NULL REFERENCES public.bins(id) ON DELETE CASCADE
   - sku_name: text NOT NULL
   - assigned_at: timestamptz NOT NULL DEFAULT now()
   - completed_at: timestamptz (nullable)

4. Create performance indexes:
   - idx_tasks_picker_id on tasks(picker_id)
   - idx_tasks_bin_id on tasks(bin_id)
   - idx_bins_aisle_id on bins(aisle_id)
   - idx_pickers_current_aisle on pickers(current_aisle)
   - idx_tasks_open on tasks(completed_at) WHERE completed_at IS NULL (partial index for ghost sweep)

5. Enable realtime:
   ALTER PUBLICATION supabase_realtime ADD TABLE public.bins;
   ALTER PUBLICATION supabase_realtime ADD TABLE public.pickers;
   ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

6. Seed 100 bins across a 10×10 grid in 5 aisles (A–E):
   - Use a PL/pgSQL DO block
   - Aisles rotate every 20 bins (bins 0-19 = Aisle A, 20-39 = B, etc.)
   - Label format: '{AISLE}-{3-digit-number}' e.g. 'A-000', 'A-001'
   - x = col (1-10), y = row (1-10)
   - status = 'ok', last_audit = now()

7. Seed 3 pickers:
   ('Arjun Kumar', null, 'idle'),
   ('Priya Sharma', null, 'idle'),
   ('Rohan Mehta', null, 'idle')

8. End with: SELECT 'Schema created and seeded.' AS result;

Use IF NOT EXISTS on all CREATE TABLE statements so the script is idempotent (safe to re-run).
```

**Checkpoint:** After running in Supabase SQL Editor, go to Table Editor. You should see 100 rows in `bins` and 3 rows in `pickers`. The `tasks` table should be empty.

---

## PROMPT B-02: Agent Route — Core Structure

**Goal:** Create the Next.js Route Handler at `/app/api/agent/route.ts` with the server-side Supabase client and input validation.

---

**Prompt:**

```
Create app/api/agent/route.ts as a Next.js 14 Route Handler.

This is the autonomous warehouse agent. It handles all state mutations — no writes happen from the browser.

Step 1 — Server-side Supabase client:
Create a getServerSupabase() function (not exported) that:
- Reads process.env.NEXT_PUBLIC_SUPABASE_URL and process.env.SUPABASE_SERVICE_ROLE_KEY
- Throws an Error if either is missing, with a clear message
- Returns createClient<Database>(url, serviceKey) from '@supabase/supabase-js'
- NOTE: This uses the SERVICE_ROLE_KEY, not the anon key. This bypasses Row Level Security for server-side agent operations.

Step 2 — Constants at top of file:
const AISLE_CONGESTION_LIMIT = 2       // pickers before re-route triggers
const GHOST_MULTIPLIER = 3             // multiplier on avg pick time
const AVG_PICK_TIME_MS = 90_000        // 90 second baseline

Step 3 — POST handler signature:
export async function POST(req: NextRequest): Promise<NextResponse<AgentResponse>>

Step 4 — Input parsing:
- Parse JSON body
- If JSON.parse fails: return 400 { status: 'ERROR', message: 'Invalid JSON body.' }
- Destructure: { action, picker_id, bin_id, aisle_id } from body
- If action or picker_id is missing: return 400 { status: 'ERROR', message: 'Missing required fields.' }

Step 5 — Route to action handlers (two branches):
- if action === 'assign' → call handleAssign(supabase, picker_id, aisle_id)
- if action === 'missing' → call handleMissing(supabase, picker_id, bin_id)
- else → return 400 { status: 'ERROR', message: 'Unknown action.' }

Step 6 — GET handler signature:
export async function GET(): Promise<NextResponse>
(Ghost sweep — implemented in B-04)

Import types: NextRequest, NextResponse from 'next/server'; Bin, Task, AgentResponse, Database from '@/lib/types'
```

**Checkpoint:** `npx tsc --noEmit` passes. File exists at the correct path. Route is registered (verify with `curl -X POST http://localhost:3000/api/agent` — should return 400 "Missing required fields").

---

## PROMPT B-03: Agent Route — Congestion Logic (assign action)

**Goal:** Implement the `handleAssign` function that checks aisle congestion before assigning a task.

---

**Prompt:**

```
Add the handleAssign function to app/api/agent/route.ts.

async function handleAssign(
  supabase: ReturnType<typeof getServerSupabase>,
  picker_id: string,
  aisle_id: string | undefined
): Promise<NextResponse<AgentResponse>>

Logic (implement exactly in this order):

1. Validate: if !aisle_id, return 400 { status: 'ERROR', message: 'assign requires aisle_id' }

2. CONGESTION CHECK:
   Query: SELECT count(*) FROM pickers WHERE current_aisle = {aisle_id} AND status = 'picking'
   Use: supabase.from('pickers').select('id', { count: 'exact', head: true }).eq('current_aisle', aisle_id).eq('status', 'picking')
   
   If count >= AISLE_CONGESTION_LIMIT:
     a. Find alternative bins: 
        SELECT * FROM bins WHERE status = 'ok' AND aisle_id != {aisle_id} LIMIT 5
     b. If no alternatives found:
        Return 200 { status: 'RE_ROUTE', message: 'Aisle {X} congested. No alternative bins available.' }
     c. If alternatives found, pick alternatives[0]:
        Return 200 { 
          status: 'RE_ROUTE', 
          message: 'Aisle {X} congested ({count} pickers). Routing to bin {label} in aisle {aisle_id}.',
          alternative_bin: alternatives[0]
        }

3. AISLE CLEAR — find a bin and create a task:
   a. Find available bin: SELECT * FROM bins WHERE aisle_id = {aisle_id} AND status = 'ok' LIMIT 1
   b. If none: return 404 { status: 'ERROR', message: 'No available bins in aisle {X}' }
   c. INSERT into tasks: { picker_id, bin_id: bin.id, sku_name: 'SKU-{bin.label}', assigned_at: new Date().toISOString(), completed_at: null }
   d. UPDATE pickers: SET status='picking', current_aisle={aisle_id} WHERE id={picker_id}
   e. Return 200 { status: 'ASSIGNED', message: 'Task created for bin {label} in aisle {aisle_id}.', task }

Handle all Supabase errors: if error object is returned, log it and return 500 { status: 'ERROR', message: error.message }
```

**Checkpoint:**
```bash
# Test congestion (with 0 pickers active — should assign)
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"action":"assign","picker_id":"PASTE_PICKER_UUID","aisle_id":"A"}'
# Expected: { "status": "ASSIGNED", ... }
```

---

## PROMPT B-04: Agent Route — Ghost Detection Logic (missing action + GET sweep)

**Goal:** Implement ghost detection — both the explicit picker report and the automated time-based sweep.

---

**Prompt:**

```
Add the handleMissing function and GET handler to app/api/agent/route.ts.

PART 1 — handleMissing:

async function handleMissing(
  supabase: ReturnType<typeof getServerSupabase>,
  picker_id: string,
  bin_id: string | undefined
): Promise<NextResponse<AgentResponse>>

Logic:
1. Validate: if !bin_id, return 400 { status: 'ERROR', message: 'missing requires bin_id' }

2. Fetch active task (for elapsed time calculation):
   SELECT * FROM tasks 
   WHERE picker_id = {picker_id} AND bin_id = {bin_id} AND completed_at IS NULL
   ORDER BY assigned_at DESC LIMIT 1
   
   If not found: log a console.warn but continue (still flag the bin)

3. Calculate ghost reason:
   - Default message: "Picker reported item missing"
   - If task found: 
       const elapsed = Date.now() - new Date(task.assigned_at).getTime()
       const threshold = GHOST_MULTIPLIER * AVG_PICK_TIME_MS
       if (elapsed > threshold):
         ghostReason = "Pick time exceeded {GHOST_MULTIPLIER}x average ({Math.round(elapsed/1000)}s elapsed)"

4. FLAG THE BIN — UPDATE bins:
   SET status='ghosting_suspected', last_audit=new Date().toISOString()
   WHERE id = {bin_id}
   If error: return 500

5. CLOSE THE TASK — if task found:
   UPDATE tasks SET completed_at=new Date().toISOString() WHERE id=task.id

6. FREE THE PICKER:
   UPDATE pickers SET status='idle', current_aisle=null WHERE id=picker_id

7. Return 200 {
     status: 'GHOSTING_FLAGGED',
     message: 'Bin {bin_id} flagged as ghosting_suspected. Reason: {ghostReason}.'
   }

---

PART 2 — GET handler (automated ghost sweep):

export async function GET(): Promise<NextResponse>

Logic:
1. Calculate cutoff timestamp:
   const threshold = GHOST_MULTIPLIER * AVG_PICK_TIME_MS
   const cutoff = new Date(Date.now() - threshold).toISOString()

2. Find stale open tasks:
   SELECT * FROM tasks WHERE completed_at IS NULL AND assigned_at < {cutoff}
   (This uses the partial index idx_tasks_open for efficiency)

3. If no stale tasks: return 200 { swept: 0, flagged: [], message: 'No ghost bins found.' }

4. Extract bin IDs: const staleBinIds = staleTasks.map(t => t.bin_id)

5. Bulk update bins:
   UPDATE bins SET status='ghosting_suspected', last_audit=now()
   WHERE id IN (staleBinIds)
   Use: supabase.from('bins').update({...}).in('id', staleBinIds)

6. Return 200 {
     swept: staleTasks.length,
     flagged: staleBinIds,
     message: 'Auto-flagged {n} ghost bins from sweep.'
   }

Handle errors at each step. If the bulk update fails, return 500 with error message.
```

**Checkpoint:**
```bash
# Test ghost flag
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"action":"missing","picker_id":"PASTE_PICKER_UUID","bin_id":"PASTE_BIN_UUID"}'
# Expected: { "status": "GHOSTING_FLAGGED", ... }
# Then check Manager Dashboard — bin should pulse red immediately

# Test ghost sweep
curl http://localhost:3000/api/agent
# Expected: { "swept": N, "flagged": [...] }
```

---

## PROMPT B-05: Error Handling & Edge Cases

**Goal:** Harden the agent against bad input and Supabase failures.

---

**Prompt:**

```
Review app/api/agent/route.ts and add these safety improvements:

1. RACE CONDITION GUARD on assign:
   After creating a task, immediately re-check that the picker's status is still 'idle'.
   If the picker is already 'picking' (assigned by another concurrent request), 
   rollback by deleting the just-created task and return 409:
   { status: 'ERROR', message: 'Picker already has an active task. Concurrent assignment prevented.' }

2. DOUBLE-GHOST GUARD on missing:
   Before flagging a bin, check if bin.status is already 'ghosting_suspected'.
   If so, skip the UPDATE and return 200:
   { status: 'GHOSTING_FLAGGED', message: 'Bin already flagged — no duplicate update.' }

3. UNKNOWN PICKER GUARD:
   In both handleAssign and handleMissing, verify the picker exists before proceeding:
   SELECT id FROM pickers WHERE id = {picker_id}
   If not found: return 404 { status: 'ERROR', message: 'Picker {picker_id} not found.' }

4. CORS HEADERS:
   Add these response headers to all responses from the POST handler:
   'Access-Control-Allow-Origin': '*'
   'Content-Type': 'application/json'
   
   Also add an OPTIONS handler:
   export async function OPTIONS() {
     return new NextResponse(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } })
   }

5. STRUCTURED CONSOLE LOGGING:
   Add console.log calls at the start of each action handler:
   console.log('[AGENT]', action, { picker_id, bin_id, aisle_id })
   And at the end:
   console.log('[AGENT RESULT]', responseStatus, message)
   This makes Vercel function logs readable during debugging.
```

**Checkpoint:** In Vercel/local terminal, agent logs should appear in the format `[AGENT] assign { picker_id: '...', aisle_id: 'A' }`.

---

## PROMPT B-06: Environment & Deployment Config

**Goal:** Create all configuration files needed for a zero-cost Vercel deployment.

---

**Prompt:**

```
Create these configuration files:

1. .env.example (copy template for team):
   # Copy to .env.local and fill in values. NEVER commit .env.local.
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

2. .gitignore — ensure these lines exist:
   .env.local
   .env*.local
   node_modules/
   .next/
   *.tsbuildinfo

3. vercel.json — configure function timeouts (free tier max is 10s):
   {
     "functions": {
       "app/api/agent/route.ts": {
         "maxDuration": 10
       }
     }
   }

4. next.config.js — standard config:
   /** @type {import('next').NextConfig} */
   const nextConfig = {
     experimental: {
       typedRoutes: true
     }
   }
   module.exports = nextConfig

5. README.md at project root — quick start in 5 commands:
   git clone <repo>
   cp .env.example .env.local  # then fill in values
   npm install
   npm run dev
   # Open http://localhost:3000

   Include a section: "Running the Ghost Sweep"
   curl http://localhost:3000/api/agent
   
   Include a section: "Triggering a Test Ghost"
   curl -X POST http://localhost:3000/api/agent \
     -H "Content-Type: application/json" \
     -d '{"action":"missing","picker_id":"UUID","bin_id":"UUID"}'
```

---

## Backend Checklist (verify before handoff)

- [ ] B-01: SQL migration runs clean, 100 bins + 3 pickers seeded
- [ ] B-01: Realtime replication enabled on all 3 tables (check Supabase Dashboard > Database > Replication)
- [ ] B-02: Route file exists, TypeScript compiles, 400 returned on bad input
- [ ] B-03: `assign` action creates a task and updates picker status
- [ ] B-03: `assign` returns RE_ROUTE when aisle has ≥ 2 pickers
- [ ] B-04: `missing` action flags bin, closes task, frees picker
- [ ] B-04: `GET` sweep finds stale tasks and bulk-flags bins
- [ ] B-04: Manager Dashboard updates within 1 second of ghost flag
- [ ] B-05: Double-ghost guard prevents duplicate DB writes
- [ ] B-05: Agent logs appear in Vercel function logs
- [ ] B-06: `.env.local` is NOT committed to Git

---

## Testing Sequence (Full Integration Test)

Run these commands in order to verify the complete system:

```bash
# 1. Get picker IDs from Supabase
# Go to Table Editor > pickers, copy a picker UUID

# 2. Assign a task (expect ASSIGNED)
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"action":"assign","picker_id":"<PICKER_UUID>","aisle_id":"A"}'

# 3. Assign another picker to same aisle (expect RE_ROUTE)
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"action":"assign","picker_id":"<PICKER2_UUID>","aisle_id":"A"}'
# (First update the first picker manually: current_aisle='A', status='picking')

# 4. Report item missing (expect GHOSTING_FLAGGED)
# Get the bin_id from the task created in step 2
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"action":"missing","picker_id":"<PICKER_UUID>","bin_id":"<BIN_UUID>"}'

# 5. Watch Manager Dashboard — bin should turn red within 1 second

# 6. Run ghost sweep
curl http://localhost:3000/api/agent
```

---

## Common Backend Mistakes to Avoid

1. **Using `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`** — Never. This exposes your admin key to every browser. Always just `SUPABASE_SERVICE_ROLE_KEY`.

2. **Forgetting Realtime is READ-ONLY from the browser** — Supabase Realtime just listens for changes. All writes must go through the API route. Never `supabase.from('bins').update()` from a client component.

3. **Not handling `.single()` errors** — If `.single()` finds 0 or 2+ rows it throws. Always check for `error` before using `data`.

4. **Forgetting the partial index on tasks** — The ghost sweep queries `WHERE completed_at IS NULL`. Without the partial index `idx_tasks_open`, this is a full table scan. The SQL migration creates it.

5. **Vercel cold starts on free tier** — The first request after inactivity takes 1–3 seconds. This is normal. For demo, hit the endpoint once before showing to stakeholders.
