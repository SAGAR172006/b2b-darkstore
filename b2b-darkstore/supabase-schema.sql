-- Supabase schema backup
-- ================================================================
-- B2B DARKSTORE — Complete Schema + Seed Data
-- 
-- HOW TO USE THIS FILE:
-- 1. Go to supabase.com → your project → SQL Editor
-- 2. Click "New query"
-- 3. Copy everything in this file and paste it there
-- 4. Click "Run"
-- 5. You should see: Done: 100 bins seeded.
-- ================================================================

-- ── TABLES ──────────────────────────────────────────────────────

create table if not exists public.bins (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  aisle_id    text not null,
  x           integer not null check (x between 1 and 10),
  y           integer not null check (y between 1 and 10),
  status      text not null default 'ok'
                check (status in ('ok', 'ghosting_suspected')),
  last_audit  timestamptz
);

create table if not exists public.pickers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  current_aisle text,
  status        text not null default 'idle'
                  check (status in ('idle', 'picking'))
);

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  picker_id    uuid not null references public.pickers(id) on delete cascade,
  bin_id       uuid not null references public.bins(id) on delete cascade,
  sku_name     text not null,
  assigned_at  timestamptz not null default now(),
  completed_at timestamptz
);

-- ── INDEXES (performance) ────────────────────────────────────────

create index if not exists idx_tasks_picker_id
  on public.tasks(picker_id);

create index if not exists idx_tasks_bin_id
  on public.tasks(bin_id);

create index if not exists idx_bins_aisle_id
  on public.bins(aisle_id);

create index if not exists idx_pickers_aisle
  on public.pickers(current_aisle);

-- Partial index: only indexes open (incomplete) tasks
-- Makes the ghost sweep query fast even with thousands of tasks
create index if not exists idx_tasks_open
  on public.tasks(completed_at)
  where completed_at is null;

-- ── REALTIME REPLICATION ─────────────────────────────────────────
-- This is what makes supabase.channel() work in the frontend.
-- Without this, the live grid will NOT update.

alter publication supabase_realtime add table public.bins;
alter publication supabase_realtime add table public.pickers;
alter publication supabase_realtime add table public.tasks;

-- ── SEED: 100 bins across a 10×10 grid, 5 aisles ─────────────────
-- Aisle A = bins 0–19  (rows 1–2)
-- Aisle B = bins 20–39 (rows 3–4)
-- Aisle C = bins 40–59 (rows 5–6)
-- Aisle D = bins 60–79 (rows 7–8)
-- Aisle E = bins 80–99 (rows 9–10)

do $$
declare
  aisle_labels text[] := array['A','B','C','D','E'];
  current_aisle text;
  bin_count integer := 0;
  r integer;
  c integer;
begin
  for r in 1..10 loop
    for c in 1..10 loop
      current_aisle := aisle_labels[((bin_count / 20) % 5) + 1];
      insert into public.bins (label, aisle_id, x, y, status, last_audit)
      values (
        current_aisle || '-' || lpad(bin_count::text, 3, '0'),
        current_aisle,
        c,
        r,
        'ok',
        now()
      );
      bin_count := bin_count + 1;
    end loop;
  end loop;
end $$;

-- ── SEED: 3 pickers ──────────────────────────────────────────────

insert into public.pickers (name, current_aisle, status) values
  ('Arjun Kumar',  null, 'idle'),
  ('Priya Sharma', null, 'idle'),
  ('Rohan Mehta',  null, 'idle');

-- ── VERIFY ───────────────────────────────────────────────────────

select 'Done: ' || count(*) || ' bins seeded.' as result
from public.bins;