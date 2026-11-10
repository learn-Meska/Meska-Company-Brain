-- Three layers in every portal: portal admin (app_users.team_admin_of), team leader and member.
-- team_leader_of: the portals this login is a team leader in (always a subset of roles).
-- reports_to: for a member, the team leader (or admin) they are assigned to in each portal,
--   e.g. {"growth": "<app_users.id>"}. A leader sees the deals of the members assigned to them.
alter table public.app_users add column if not exists team_leader_of text[] not null default '{}';
alter table public.app_users add column if not exists reports_to jsonb not null default '{}'::jsonb;

alter table public.app_users drop constraint if exists app_users_team_leader_of_check;
alter table public.app_users add constraint app_users_team_leader_of_check
  check (team_leader_of <@ array['approver', 'growth', 'content']::text[]);

-- An access invite carries the level and the leader too, so they apply when the person confirms.
alter table public.access_invites add column if not exists team_leader boolean not null default false;
alter table public.access_invites add column if not exists leader_id uuid references public.app_users (id) on delete set null;

-- Feedback the Meska team adds by hand on a training (e.g. what the client said on a call).
-- Optional, shown only to Growth, Training Excellence and admins; never to the trainer, never in scores.
create table if not exists public.training_feedback (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  author_id uuid references public.app_users (id) on delete set null,
  -- the portal the author wrote it from: 'growth', 'approver' (Training Excellence) or 'admin'
  team text not null check (team in ('growth', 'approver', 'admin')),
  -- who the feedback came from: the client, the participants, the trainer or the team's own view
  source text not null default 'client' check (source in ('client', 'participants', 'trainer', 'internal')),
  rating smallint check (rating between 1 and 5),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists training_feedback_booking_id_idx on public.training_feedback (booking_id);
alter table public.training_feedback enable row level security;

notify pgrst, 'reload schema';
