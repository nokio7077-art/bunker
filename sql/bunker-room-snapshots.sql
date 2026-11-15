-- Run once in a NEW Supabase project, SQL Editor.
-- Contains private room sessions and recovery codes: never grant browser access.
create table if not exists public.bunker_room_snapshots (
 id text primary key check (id = 'active'),
 snapshot jsonb not null,
 saved_at bigint not null,
 updated_at timestamptz not null default now()
);
alter table public.bunker_room_snapshots enable row level security;
revoke all on table public.bunker_room_snapshots from anon, authenticated;
grant select, insert, update on table public.bunker_room_snapshots to service_role;
-- Only the server's secret key can read/write. No public policies.
