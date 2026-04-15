# CLAUDE CODE — Full Diagnostic & Repair Prompt
# 
# HOW TO USE THIS FILE:
# If the project is not working after all 8 Kiro prompts are done,
# open your terminal in the b2b-darkstore/ folder and run:
#
#   claude
#
# Then paste everything between the START and END markers below.
# Claude Code will read every file, find every broken thing, fix
# it, and tell you what it changed.
# ================================================================

# ======================== START PASTE HERE =======================

You are a senior full-stack engineer doing a complete diagnostic
and repair of a Next.js 14 project called b2b-darkstore.

Your job is to go through every file in this project one by one,
find anything that is broken, fix it, and then move to the next
file. Do not stop until everything works.

---

WHAT THIS PROJECT IS:

A B2B autonomous warehouse logistics system with:
- Manager Dashboard at /app/manager/page.tsx
  A 10x10 CSS grid floor map with realtime bin status updates
- Picker App at /app/picker/page.tsx
  A mobile-first task execution UI with Item Found / Item Missing buttons
- Autonomous Agent at /app/api/agent/route.ts
  A serverless API that handles ghost detection and congestion re-routing
- Supabase PostgreSQL + Realtime as the database

---

TECH STACK:
- Next.js 14 App Router
- TypeScript (strict)
- Tailwind CSS with custom design tokens
- Supabase JS v2 (@supabase/supabase-js)
- Lucide React for icons

---

STEP 1 — READ THE PROJECT STRUCTURE

Run this command first and read the output carefully:
  find . -type f -not -path './node_modules/*' -not -path './.next/*' | sort

---

STEP 2 — CHECK ENVIRONMENT VARIABLES

Verify .env.local exists and contains all three of these:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY

If any are missing, stop and tell the user which ones to add.
Do not proceed until all three exist.

---

STEP 3 — CHECK TYPESCRIPT

Run: npx tsc --noEmit

Read every error carefully. Fix each one in the relevant file.
After fixing, run npx tsc --noEmit again to confirm zero errors.

Common errors you will likely find and how to fix them:
- 'data' is possibly null → add null check: if (!data) return ...
- 'count' is possibly null → replace with: (count ?? 0)
- Type 'X' is not assignable to type 'Y' → check the types.ts
  interfaces match the actual Supabase table columns exactly
- Cannot find module '@/lib/supabase' → check the file exists
  at lib/supabase.ts and exports: export const supabase = ...
- Cannot find module '@/lib/types' → check lib/types.ts exists
  and exports all interfaces

---

STEP 4 — CHECK EACH FILE ONE BY ONE

Go through these files in this exact order. For each file:
  a) Read the entire file
  b) Identify any bugs, missing logic, or incomplete code
  c) Fix it
  d) Move to the next file

FILES TO CHECK IN ORDER:

1. lib/types.ts
   Must export: Bin, Picker, Task, AgentResponse, LogEntry, Database
   BinStatus must be: 'ok' | 'ghosting_suspected'
   PickerStatus must be: 'idle' | 'picking'

2. lib/supabase.ts
   Must use NEXT_PUBLIC_SUPABASE_ANON_KEY (not service role)
   Must export: export const supabase = createClient<Database>(...)
   Must be a named export, not default export

3. tailwind.config.js
   Must have content paths for ./app and ./components and ./lib
   Must have these color tokens: primary-fixed, primary-container,
   error, background, surface-container, on-surface, outline
   Must have borderRadius DEFAULT set to '0px'
   Must have pulse-red keyframe animation

4. app/layout.tsx
   Must import Space_Grotesk and Inter from next/font/google
   Must apply font CSS variables to body
   Must NOT have dark mode classes

5. app/globals.css
   Must have @tailwind base, components, utilities
   Must NOT have --background: #0a0a0a (this causes black screen)

6. app/page.tsx
   Must simply redirect to /manager
   Must use: import { redirect } from 'next/navigation'

7. app/api/agent/route.ts
   CRITICAL CHECKS:
   - Must use SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix)
   - Must export POST and GET functions
   - POST must handle action='assign' and action='missing'
   - assign: must check pickers count in aisle before assigning
     if count >= 2 → return RE_ROUTE with alternative bin
     if count < 2 → create task, update picker status to 'picking'
   - missing: must update bins.status to 'ghosting_suspected'
     must update tasks.completed_at to now()
     must update pickers.status to 'idle'
   - GET: must find tasks where completed_at IS NULL and
     assigned_at < (now - 270 seconds), then bulk update those bins
   - Must have OPTIONS handler for CORS

8. app/manager/page.tsx
   Must be 'use client'
   CRITICAL CHECKS:
   - Must load bins and pickers from Supabase on mount
   - Must subscribe to supabase.channel('manager-realtime')
     with postgres_changes on bins AND pickers tables
   - Must clean up channel on unmount:
     return () => { supabase.removeChannel(channel) }
   - Ghost bins (status = 'ghosting_suspected') must have
     className that includes 'animate-pulse-red'
   - Active pickers must show a cyan marker on the grid
   - LogEntry array must auto-scroll to newest entry
   - Must NOT use any polling (setInterval) — only Realtime

9. app/picker/page.tsx
   Must be 'use client'
   CRITICAL CHECKS:
   - Must show picker selection screen first
   - Task card must show bin label, sku_name, aisle_id
   - Item Found button must: update tasks.completed_at,
     update pickers.status to 'idle'
   - Item Missing button must: POST to /api/agent with
     action='missing', picker_id, bin_id
   - Must subscribe to supabase.channel('picker-{id}')
     for tasks INSERT events filtered by picker_id
   - Must clean up channel on unmount
   - Bottom nav must be fixed to bottom of screen
   - Must have h-16 spacer above bottom nav

10. app/manager/layout.tsx
    Must have: className="h-screen overflow-hidden" on wrapper div

11. app/picker/layout.tsx
    Must have: className="min-h-screen bg-background" on wrapper div

---

STEP 5 — CHECK REALTIME IS WIRED CORRECTLY

In app/manager/page.tsx, confirm the Realtime subscription
looks exactly like this pattern:

  const channel = supabase
    .channel('manager-realtime')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'bins' },
      (payload) => { ... handle bin update ... }
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'pickers' },
      (payload) => { ... handle picker update ... }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') setConnected(true)
    })

  return () => { supabase.removeChannel(channel) }

If it uses setInterval or fetch polling instead, rewrite it
to use supabase.channel().

---

STEP 6 — BUILD TEST

Run: npm run build

Fix any build errors. Common ones:
- "useEffect is not defined" → add 'use client' at top of file
- "Cannot read properties of undefined" → add null checks
- "Module not found" → check import paths use @/ alias correctly

---

STEP 7 — RUNTIME TEST

Run: npm run dev

Then test each endpoint:

Test 1 — Ghost sweep (should return swept:0 if no stale tasks):
  curl http://localhost:3000/api/agent

Test 2 — Get a picker_id from Supabase Table Editor (pickers table)
         Get a bin_id from Supabase Table Editor (bins table)
         Then run:
  curl -X POST http://localhost:3000/api/agent \
    -H "Content-Type: application/json" \
    -d '{"action":"missing","picker_id":"REAL_UUID","bin_id":"REAL_UUID"}'

Expected response: { "status": "GHOSTING_FLAGGED", "message": "..." }

Test 3 — Open http://localhost:3000/manager in browser
  Should show: 3-column layout with 10x10 grid in center
  Should show: "LIVE" green indicator when Realtime connects

Test 4 — Open http://localhost:3000/picker in browser
  Should show: picker selection screen with 3 pickers listed

---

STEP 8 — REPORT

After completing all checks and fixes, give me a summary:

1. List every file you modified and what you changed
2. List every error you found and how you fixed it
3. Confirm: npx tsc --noEmit passes with zero errors
4. Confirm: npm run build completes successfully
5. Confirm: all 4 runtime tests pass
6. If anything still does not work, tell me exactly what
   is broken and what information you need to fix it

# ========================= END PASTE HERE ========================
