# PRD — B2B Darkstore: Autonomous Micro-Fulfillment Agent
**Version:** 1.0 — MVP  
**Sprint Duration:** 1 day (3-hour build blocks)  
**Status:** In Development

---

## 1. Problem Statement

B2B micro-fulfillment operations suffer from three compounding failures that human supervisors cannot catch in real time:

1. **Bin Ghosting** — A picker arrives at a bin that physically exists in the system but has zero or incorrect stock. No one is notified. The picker waits, backtracks, or silently skips.
2. **Aisle Congestion** — Multiple pickers are routed to the same aisle simultaneously, creating bottlenecks that reduce throughput by up to 30%.
3. **Supervisor Blindness** — Floor managers have no live, spatial view of picker positions, task states, or anomalies. Decisions are made on stale data.

**Goal:** Build a self-correcting, autonomous agent that monitors warehouse state in real time, re-routes pickers when aisles congest, flags ghost bins without human intervention, and surfaces all reasoning to a manager dashboard — all on a zero-cost infrastructure stack.

---

## 2. Users & Roles

| Role | Device | Primary Need |
|------|--------|-------------|
| **Warehouse Picker** | Mobile (Android/iOS, 5–6") | One task at a time. Large tap targets. No cognitive load. |
| **Floor Manager** | Desktop/Tablet (1280px+) | Spatial floor overview, real-time alerts, agent log. |
| **Autonomous Agent** | Serverless (no UI) | Monitor DB state, re-route, flag ghosts, correct itself. |

---

## 3. MVP Scope (What We Are Building)

### 3.1 Included in MVP

#### Manager Dashboard (`/app/manager`)
- [ ] 10×10 CSS Grid representing the physical store floor
- [ ] Each cell = one `Bin` node (label, status, aisle)
- [ ] Real-time "Pulse" cyan marker when a picker is active in an aisle
- [ ] Real-time "Red Alert" animation when a bin is `ghosting_suspected`
- [ ] Live throughput stats: active pickers, ghost count, bin health %
- [ ] Scrolling "Agent Reasoning Log" — all agent decisions streamed live
- [ ] WebSocket connection status indicator

#### Picker Execution App (`/app/picker`)
- [ ] Picker identity selection screen (list of pickers from DB)
- [ ] One-task-at-a-time card showing: Bin label, SKU name, location image placeholder, SKU ID, target quantity
- [ ] "ITEM FOUND" button → marks task complete, picker goes idle
- [ ] "ITEM MISSING" button → triggers Ghost Agent via POST `/api/agent`
- [ ] Warehouse Snake Path mini-map (static SVG for MVP)
- [ ] Mobile-first layout (max-width 480px, large tap targets ≥ 56px height)
- [ ] Bottom navigation bar: Inventory, Orders, Routes, Admin
- [ ] Realtime task update via Supabase channel (new task auto-appears)

#### Autonomous Agent (`/app/api/agent`)
- [ ] `POST` — Two actions:
  - `assign`: Check aisle congestion before assigning. If ≥ 2 pickers in aisle → return `RE_ROUTE` with alternative bin
  - `missing`: Flip bin to `ghosting_suspected`, complete task, set picker idle
- [ ] `GET` — Ghost sweep: scan all open tasks > 3× avg pick time (90s baseline), bulk-flag bins
- [ ] All decisions logged to Agent Reasoning Log via DB insert or Realtime broadcast

#### Database (Supabase PostgreSQL)
- [ ] `bins` table with 100 seeded rows (10×10 grid)
- [ ] `pickers` table with 3 seeded pickers
- [ ] `tasks` table
- [ ] Realtime replication enabled on all three tables

### 3.2 Explicitly Out of Scope (Post-MVP)
- AGV/robot integration
- Barcode scanner hardware integration
- Auth / login system (MVP uses picker selection screen)
- Batch generation optimizer
- Analytics history / reporting
- Cold storage zone logic
- Fleet/route planning

---

## 4. Functional Requirements

### FR-01: Realtime Floor Grid
- The grid MUST update within 500ms of a DB change (Supabase Realtime guarantee on free tier)
- Ghost bins MUST show a pulsing red ring animation
- Active picker positions MUST show a cyan pulse marker

### FR-02: Ghost Detection — Two Triggers
- **Explicit:** Picker taps "Item Missing" → immediate flag
- **Automatic:** Any task with `assigned_at` older than `3 × AVG_PICK_TIME_MS` (270s default) → bulk flag on `GET /api/agent`

### FR-03: Congestion Re-Routing
- Before every task assignment, agent MUST query `pickers` count by `aisle_id` WHERE `status = 'picking'`
- If count ≥ 2: return `RE_ROUTE` + alternative bin from a different, uncongested aisle
- Alternative bin MUST have `status = 'ok'`

### FR-04: Agent Reasoning Log
- Every agent decision MUST emit a log entry with: timestamp, decision type, message
- Log MUST be visible in the Manager Dashboard, auto-scrolling, newest at bottom
- Log entries MUST be color-coded: info (cyan), warn (amber), alert (red)

### FR-05: Mobile Tap Targets
- All interactive buttons on the Picker App MUST be ≥ 56px tall
- "Item Missing" MUST be visually distinct from "Item Found" (red border, no fill)

---

## 5. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| WebSocket connect time | < 2s on 4G |
| DB query response | < 300ms (Supabase free tier) |
| Bundle size | < 200KB JS (no heavy chart libs) |
| Mobile performance | 60fps scroll on mid-range Android |
| Cost | $0/month (Supabase free + Vercel free) |
| Uptime | Best-effort (free tier) |

---

## 6. Design Constraints (from Stitch Design System)

- **Color System:** Cyan-centric light mode. Primary `#00cbfc`, Error `#b31b25`
- **Typography:** Space Grotesk (headlines/labels) + Inter (body)
- **Geometry:** Zero border-radius on all components (brutalist 90° corners)
- **Spacing:** Comfortable density — not cramped, not airy
- **No dark mode in MVP** (light mode only per design spec)

---

## 7. Success Metrics (Sprint Demo)

- [ ] Manager Grid updates live when a bin is flagged via the Picker App
- [ ] "Item Missing" tap on Picker → bin turns red on Manager within 1 second
- [ ] Agent log shows the ghosting decision with timestamp
- [ ] Congestion re-route returns an alternative bin when aisle has ≥ 2 pickers
- [ ] Ghost sweep (`GET /api/agent`) flags stale tasks correctly
- [ ] Zero cloud costs incurred during demo

---

## 8. Open Questions (Resolve Before Sprint)

1. Should the ghost sweep be triggered manually (curl) or auto-scheduled (Vercel cron)? → **MVP: manual `GET` call**
2. Should alternative bins in re-routing come from the same SKU family? → **MVP: any `status='ok'` bin**
3. Should the Agent Reasoning Log persist across page refreshes? → **MVP: in-memory only (lost on reload)**
