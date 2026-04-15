# B2B Darkstore

B2B Darkstore is a warehouse operations MVP focused on autonomous decision support for micro-fulfillment.

It is designed around three core outcomes:
- detect **bin ghosting** quickly,
- avoid **aisle congestion** by re-routing assignments,
- give managers a **live floor view** with real-time events.

## Product Surfaces

- **Manager Dashboard** (`/manager`) — live 10×10 floor map, picker activity, ghost-bin alerts, and agent reasoning log.
- **Picker Execution App** (`/picker`) — one-task-at-a-time mobile workflow with large action controls.
- **Agent API** (`/api/agent`) — server-side route for assignment and missing-item workflows.

## Architecture (MVP)

- **Frontend:** Next.js App Router + React + Tailwind CSS
- **Backend:** Next.js Route Handlers
- **Data + Realtime:** Supabase PostgreSQL + Supabase Realtime
- **Deployment target:** Vercel free tier

High-level flow:
1. Picker action is submitted.
2. Agent API evaluates assignment/ghosting logic.
3. Database is updated.
4. Manager + picker UIs react via realtime subscriptions.

## Design System

The UI follows the **Cyan Tech** design language:
- light mode only,
- hard 90° geometry,
- Space Grotesk + Inter typography,
- cyan primary accents and red alert states.

## Tech Stack

- Next.js `16.2.3`
- React `19.2.4`
- TypeScript
- Tailwind CSS `4`
- Supabase JS `2.x`
- Lucide React

## Repository Structure

```text
b2b-darkstore/
├── app/
│   ├── manager/
│   ├── picker/
│   └── api/agent/
├── components/
├── lib/
├── docs/
├── supabase-schema.sql
└── README.md
```

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `/home/runner/work/b2b-darkstore/b2b-darkstore/b2b-darkstore/.env.local` with:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
3. Run the app:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000`.

## Available Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Spec Sources

This README is derived from:
- `/home/runner/work/b2b-darkstore/b2b-darkstore/.kiro/specs/b2b-darkstore-foundation/PRD.md`
- `/home/runner/work/b2b-darkstore/b2b-darkstore/.kiro/specs/b2b-darkstore-foundation/ARCHITECTURE.md`
- `/home/runner/work/b2b-darkstore/b2b-darkstore/.kiro/specs/b2b-darkstore-foundation/DESIGN_SYSTEM.md`
- `/home/runner/work/b2b-darkstore/b2b-darkstore/.kiro/specs/b2b-darkstore-foundation/TECHSTACK.md`
- `/home/runner/work/b2b-darkstore/b2b-darkstore/.kiro/specs/b2b-darkstore-foundation/IMPLEMENTATION_FRONTEND.md`
- `/home/runner/work/b2b-darkstore/b2b-darkstore/.kiro/specs/b2b-darkstore-foundation/IMPLEMENTATION_BACKEND.md`
