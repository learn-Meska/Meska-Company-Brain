-- Content team: a new login role, and the content they prepare for each deal (a written guide plus files).
-- Trainers see it on their training once the content team has submitted it.

-- app_users.role / roles[] use this enum. A new value can't be used in the same transaction that adds it.
alter type public.user_role add value if not exists 'content';

alter table public.deals add column if not exists content_guide text;
alter table public.deals add column if not exists content_submitted_at timestamptz;
alter table public.deals add column if not exists content_submitted_by uuid references public.app_users (id);

create table if not exists public.deal_content (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  size_bytes bigint,
  uploaded_by uuid references public.app_users (id),
  created_at timestamptz not null default now()
);
create index if not exists deal_content_deal_id_idx on public.deal_content (deal_id);
alter table public.deal_content enable row level security;

notify pgrst, 'reload schema';
