# Tech Stack — B2B Darkstore MVP

**Philosophy:** Zero cost. Zero ops. Maximum autonomy. Every tool chosen runs on a permanent free tier.

---

## 1. Frontend

| Layer | Tool | Version | Why |
|-------|------|---------|-----|
| Framework | **Next.js** | 14 (App Router) | File-based routing, API Routes in same repo, React Server Components |
| Styling | **Tailwind CSS** | 3.4 | Utility classes, JIT compiler, zero runtime CSS |
| Icons | **Lucide React** | latest | Tree-shakeable, consistent 24px SVG set |
| Fonts | **Google Fonts** | — | Space Grotesk + Inter (matches Stitch design spec) |
| State | **React `useState` / `useEffect`** | — | No external state lib needed for MVP scale |
| Realtime | **Supabase JS Client** | 2.x | `supabase.channel()` WebSocket — no polling |

**No chart library.** The floor grid is pure CSS Grid. The mini-map is an inline SVG. This keeps the bundle under 150KB.

---

## 2. Backend / API

| Layer | Tool | Why |
|-------|------|-----|
| API Routes | **Next.js Route Handlers** | Co-located with frontend, serverless by default on Vercel |
| Database client | **Supabase JS (server-side)** | Service role key for bypassing RLS in agent routes |
| Business logic | **Plain TypeScript** | No ORM — raw Supabase query builder is sufficient |

The "Agent" is stateless serverless functions. No background workers, no queues — just HTTP endpoints that read/write Postgres.

---

## 3. Database

| Layer | Tool | Free Tier Limit |
|-------|------|----------------|
| Database | **Supabase PostgreSQL** | 500 MB storage |
| Realtime | **Supabase Realtime** | 200 concurrent connections |
| Auth | Not used in MVP | — |
| Storage | Not used in MVP | — |

**Realtime transport:** Supabase wraps Phoenix Channels (Elixir) over WebSocket. The client uses `postgres_changes` to subscribe to row-level INSERT/UPDATE events.

---

## 4. Infrastructure & Deployment

| Layer | Tool | Free Tier Limit |
|-------|------|----------------|
| Hosting | **Vercel** | 100 GB bandwidth, unlimited deployments |
| Serverless functions | **Vercel Edge / Node runtime** | 100K function invocations/month |
| CI/CD | **Vercel GitHub integration** | Auto-deploy on push to `main` |
| Domain | `vercel.app` subdomain | Free |

---

## 5. Development Tools

| Tool | Purpose |
|------|---------|
| **Node.js 18+** | Runtime for local dev |
| **npm** | Package manager |
| **VS Code** | Editor (recommended) |
| `.env.local` | Secret management — never committed to Git |

---

## 6. Key Architectural Decisions (ADRs)

### ADR-01: App Router over Pages Router
Next.js 14 App Router is used. This gives us React Server Components for the initial data load (no client-side waterfall for first render) and a cleaner file structure. Route Handlers replace `pages/api/`.

### ADR-02: Supabase Realtime over Polling
`supabase.channel()` opens a single persistent WebSocket per page. This is more efficient than `setInterval` polling and gives sub-500ms latency on the free tier. The downside is connection limits (200 concurrent) — acceptable for MVP scale.

### ADR-03: Service Role Key in API Routes only
The `SUPABASE_SERVICE_ROLE_KEY` is **only** used server-side in `/app/api/agent/route.ts`. It is never prefixed with `NEXT_PUBLIC_`. The browser uses the `anon` key with Realtime subscriptions only (read-heavy, no writes from browser).

### ADR-04: No ORM
The Supabase JS query builder (`supabase.from('bins').select(...)`) is expressive enough for MVP queries. Adding Prisma or Drizzle would add complexity and a generation step — unnecessary at this scale.

### ADR-05: TypeScript strict mode
All files use TypeScript. The `Database` generic type on `createClient<Database>()` gives compile-time safety on all table queries. Typos in column names become build errors, not runtime bugs.

---

## 7. Environment Variables Reference

```
# .env.local — NEVER commit this file

# Browser-safe (prefixed with NEXT_PUBLIC_)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# Server-only (no NEXT_PUBLIC_ prefix)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

---

## 8. Dependency Install Command

```bash
npm install @supabase/supabase-js lucide-react
```

That's the entire dependency delta on top of a standard `create-next-app@14` scaffold.
