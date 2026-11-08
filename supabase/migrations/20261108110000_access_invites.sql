-- Access invites: adding a category to someone who already has a login doesn't grant it straight away.
-- They get an email and must confirm (signed in as themselves) before the access is added.
create table if not exists public.access_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  category text not null check (category in ('approver', 'growth', 'content', 'admin')),
  portal_admin boolean not null default false,
  permissions text[] not null default '{}',
  token text not null unique,
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index if not exists access_invites_user_id_idx on public.access_invites (user_id);
alter table public.access_invites enable row level security;

notify pgrst, 'reload schema';
