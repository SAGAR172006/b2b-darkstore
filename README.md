# B2B Darkstore - How to Use Guide

## 🚀 Quick Start

### 1. Setup Database (First Time Only)

1. Go to [supabase.com](https://supabase.com) and sign in
2. Open your project: `kktllxvnlfqcmgettznf`
3. Go to **SQL Editor** (left sidebar)
4. Click **"New query"**
5. Copy the entire contents of `supabase-schema.sql` and paste it
6. Click **"Run"** (or press Ctrl+Enter)
7. You should see: `Done: 100 bins seeded.`

This creates:
- 100 bins in a 10×10 grid across 5 aisles (A, B, C, D, E)
- 3 pickers (Arjun Kumar, Priya Sharma, Rohan Mehta)
- Empty tasks table (tasks are created by the agent)

### 2. Start the Development Server

```bash
cd b2b-darkstore
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📱 Using the Application

### Manager Dashboard (`/manager`)

**What you see:**
- **Left Sidebar**: Zone status, navigation, stats (Active Pickers, Ghost Alerts, Bin Health)
- **Center Grid**: 10×10 warehouse floor map showing all bins in real-time
- **Right Sidebar**: Live throughput metrics and Agent Reasoning Log

**How bins appear:**
- **White with cyan border**: Normal bin (status: `ok`)
- **Red with pulsing animation**: Ghost bin (status: `ghosting_suspected`)
- **Cyan badge "P-01"**: Active picker working in that bin's aisle

**Real-time updates:**
- Grid updates automatically when bins change status
- Log shows all agent decisions in real-time
- Connection status shows "LIVE" with green pulsing dot when connected

---

### Picker App (`/picker`)

**What you see:**
- **Header**: App branding + operator info + connection status
- **Task Card**: Shows current bin to pick from with massive bin label
- **Action Buttons**: "ITEM FOUND" (cyan) and "ITEM MISSING" (red border)
- **Snake Path Map**: Visual warehouse navigation guide
- **Bottom Nav**: Quick access to Inventory, Orders, Routes, Admin

**Workflow:**
1. Select a picker (Arjun, Priya, or Rohan)
2. Wait for task assignment (or manually create one - see below)
3. When task appears:
   - Click **"ITEM FOUND"** → Task completes, picker goes idle
   - Click **"ITEM MISSING"** → Triggers AI agent (see below)

---

## 🤖 How the AI Agent Works

The agent is at `/api/agent` and handles two main actions:

### Action 1: ASSIGN (Congestion-Aware Task Creation)

**What it does:**
- Checks if target aisle has too many pickers (congestion limit: 2)
- If congested, finds alternative bin in different aisle
- Creates task and updates picker status

**How to trigger:**
```bash
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{
    "action": "assign",
    "picker_id": "PICKER_UUID_HERE",
    "aisle_id": "A"
  }'
```

**Response:**
```json
{
  "status": "ASSIGNED",
  "message": "Task created for bin A-042 in aisle A.",
  "task": { "id": "...", "bin_id": "...", "sku_name": "SKU-A-042" }
}
```

Or if congested:
```json
{
  "status": "RE_ROUTE",
  "message": "Aisle A congested (2 pickers). Routing to bin B-023 in aisle B.",
  "alternative_bin": { "id": "...", "label": "B-023", "aisle_id": "B" }
}
```

---

### Action 2: MISSING (Ghost Detection)

**What it does:**
- Marks bin as `ghosting_suspected` (inventory discrepancy)
- Completes current task
- Sets picker back to idle
- Logs alert in Agent Reasoning Log

**How to trigger:**
1. **Via Picker App**: Click "ITEM MISSING" button on active task
2. **Via API**:
```bash
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{
    "action": "missing",
    "picker_id": "PICKER_UUID_HERE",
    "bin_id": "BIN_UUID_HERE"
  }'
```

**Response:**
```json
{
  "status": "GHOSTING_FLAGGED",
  "message": "Bin flagged as ghosting_suspected. Reason: Picker reported item missing."
}
```

**What happens:**
- Bin turns RED with pulsing animation on manager dashboard
- Ghost Alerts counter increments
- Agent log shows: `GHOST ALERT: Bin A-042 (Aisle A) flagged for inventory audit.`

---

### Action 3: Ghost Sweep (Automatic Detection)

**What it does:**
- Finds tasks that have been open too long (>4.5 minutes)
- Auto-flags those bins as `ghosting_suspected`

**How to trigger:**
```bash
curl http://localhost:3000/api/agent
```

**Response:**
```json
{
  "swept": 3,
  "flagged": ["bin-uuid-1", "bin-uuid-2", "bin-uuid-3"],
  "message": "Auto-flagged 3 ghost bins from sweep."
}
```

---

## 🧪 Testing the Agent

### Test Scenario 1: Normal Task Assignment

```bash
# Get a picker ID
curl http://localhost:3000/api/agent

# Assign task to Aisle A
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{
    "action": "assign",
    "picker_id": "YOUR_PICKER_UUID",
    "aisle_id": "A"
  }'
```

**Expected:**
- Task created
- Picker status → `picking`
- Picker appears on manager grid with cyan "P-01" badge
- Agent log shows: `Picker Arjun Kumar → picking (Aisle A).`

---

### Test Scenario 2: Congestion Re-routing

```bash
# Assign 2 pickers to Aisle A (fills congestion limit)
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"action": "assign", "picker_id": "PICKER_1_UUID", "aisle_id": "A"}'

curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"action": "assign", "picker_id": "PICKER_2_UUID", "aisle_id": "A"}'

# Try to assign 3rd picker to Aisle A (should re-route)
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"action": "assign", "picker_id": "PICKER_3_UUID", "aisle_id": "A"}'
```

**Expected:**
- First 2 assignments succeed
- 3rd assignment returns `RE_ROUTE` status
- 3rd picker assigned to different aisle (B, C, D, or E)
- Agent log shows: `Aisle A congested (2 pickers). Routing to bin B-023 in aisle B.`

---

### Test Scenario 3: Ghost Detection

```bash
# 1. Assign a task
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{
    "action": "assign",
    "picker_id": "YOUR_PICKER_UUID",
    "aisle_id": "A"
  }'

# 2. Report item missing (triggers ghost detection)
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{
    "action": "missing",
    "picker_id": "YOUR_PICKER_UUID",
    "bin_id": "BIN_UUID_FROM_TASK"
  }'
```

**Expected:**
- Bin turns RED on manager dashboard
- Ghost Alerts counter increments
- Picker goes back to idle
- Agent log shows: `GHOST ALERT: Bin A-042 (Aisle A) flagged for inventory audit.`

---

## 🔧 Getting UUIDs for Testing

### Get Picker IDs

**Option 1: Via Supabase Dashboard**
1. Go to Supabase → Table Editor → `pickers`
2. Copy the `id` column value

**Option 2: Via SQL**
```sql
SELECT id, name FROM pickers;
```

**Option 3: Via API (if you add a GET endpoint)**
```bash
# Add this to app/api/pickers/route.ts:
export async function GET() {
  const { data } = await supabase.from('pickers').select('*')
  return NextResponse.json(data)
}

# Then:
curl http://localhost:3000/api/pickers
```

### Get Bin IDs

```sql
SELECT id, label, aisle_id FROM bins WHERE aisle_id = 'A' LIMIT 5;
```

---

## 🎯 Agent Configuration

Edit these constants in `app/api/agent/route.ts`:

```typescript
const AISLE_CONGESTION_LIMIT = 2      // Max pickers per aisle
const GHOST_MULTIPLIER = 3            // 3x average pick time
const AVG_PICK_TIME_MS = 90_000       // 90 seconds average
```

**Ghost Detection Logic:**
- If task takes longer than `GHOST_MULTIPLIER × AVG_PICK_TIME_MS` (4.5 minutes), it's flagged
- Or if picker reports "ITEM MISSING", it's flagged immediately

---

## 🐛 Troubleshooting

### "Missing Supabase env vars" error
- Check `.env` file has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Restart dev server after adding env vars

### Manager dashboard shows empty grid
- Run the SQL schema to seed 100 bins
- Check Supabase → Table Editor → `bins` has data
- Check browser console for errors

### Picker app shows "No active task"
- This is normal! Tasks are created by the agent
- Use the `/api/agent` endpoint with `action: "assign"` to create a task
- Or wait for automatic assignment (if you implement that)

### Real-time not working
- Check connection status shows "LIVE" (green dot)
- Verify Supabase Realtime is enabled: Project Settings → API → Realtime
- Check browser console for WebSocket errors

### Agent returns 500 error
- Check `SUPABASE_SERVICE_ROLE_KEY` is set in `.env`
- This is different from `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Get it from: Supabase → Project Settings → API → `service_role` key

---

## 📊 Monitoring Agent Activity

Watch the Agent Reasoning Log in real-time on the Manager Dashboard:

- **Blue border (info)**: Normal operations (task assignments, status updates)
- **Amber border (warn)**: Warnings (picker went idle, congestion detected)
- **Red border (alert)**: Critical alerts (ghost bins flagged)

Example log entries:
```
[14:02:11] AGENT_CORE — System initialized. 100 bins, 3 pickers online.
[14:02:45] AGENT_CORE — Picker Arjun Kumar → picking (Aisle A).
[14:03:12] AGENT_CORE — GHOST ALERT: Bin A-042 (Aisle A) flagged for inventory audit.
```

---

## 🚀 Next Steps

1. **Add automatic task assignment**: Create a cron job or webhook that calls `/api/agent` with `action: "assign"` periodically
2. **Add task queue**: Show pending tasks in manager dashboard
3. **Add picker selection in manager**: Button to manually assign tasks to specific pickers
4. **Add bin reset**: Button to reset ghost bins back to `ok` status after audit
5. **Add analytics**: Track ghost detection rate, average pick time, congestion patterns

---

## 📝 Environment Variables Reference

```bash
# .env file
NEXT_PUBLIC_SUPABASE_URL=https://kktllxvnlfqcmgettznf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # For agent API
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Get the `SUPABASE_SERVICE_ROLE_KEY` from:
Supabase Dashboard → Project Settings → API → `service_role` key (secret)

---

## 🎨 Design System

The app uses a brutalist industrial design:
- **Background**: `#eff8ff` (pale cyan-blue)
- **Primary**: `#02cbfc` (bright saturated cyan)
- **Error**: `#b31b25` (red)
- **Text**: `#003347` (dark navy)
- **Borders**: `#88b3cd`
- **Sharp corners everywhere** (border-radius: 0)
- **Space Grotesk** for headlines (bold, uppercase, tracked)
- **Inter** for body text

---

Need help? Check the code comments in:
- `app/api/agent/route.ts` - Agent logic
- `app/manager/page.tsx` - Manager dashboard
- `app/picker/page.tsx` - Picker app
- `lib/types.ts` - TypeScript interfaces
