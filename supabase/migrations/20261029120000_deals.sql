-- New deal (Growth): one deal per request, holding the commercial details and the participant list.
-- Every training day of the request (one bookings row per day) points at it through bookings.deal_id.

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  -- the program name stays on the bookings (Growth can still edit it per day there)
  -- the amount Growth enters is per training day; the total is value_per_day * days
  value_per_day numeric(14, 2) not null check (value_per_day > 0),
  days integer not null check (days between 1 and 365),
  proposal_path text not null,
  proposal_name text not null,
  proposal_size bigint,
  created_by uuid references public.app_users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.deal_participants (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  position integer not null,
  name text not null check (length(btrim(name)) > 0),
  title text,
  department text,
  unique (deal_id, position)
);

create index if not exists deal_participants_deal_id_idx on public.deal_participants (deal_id);

alter table public.bookings add column if not exists deal_id uuid references public.deals (id) on delete set null;
create index if not exists bookings_deal_id_idx on public.bookings (deal_id);

-- The app reads and writes only through the service role; nothing is exposed to the anon or signed-in keys.
alter table public.deals enable row level security;
alter table public.deal_participants enable row level security;

-- Private bucket for proposals (PDF, Word, PowerPoint, Excel), uploaded through one-time signed URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('proposals', 'proposals', false, 52428800)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
