-- Growth no longer chooses the trainer: every New deal goes to Training Excellence, who assign one.
-- When Growth wants something changed afterwards (another trainer, another date, or to cancel), it sends a
-- change request with a reason. Training Excellence sees it on the training and answers it.
create table if not exists public.training_change_requests (
  id uuid primary key default gen_random_uuid(),
  -- the training day the request was raised from; it stands for the whole training (its deal or batch)
  booking_id uuid not null references public.bookings (id) on delete cascade,
  -- what Growth asks for: another trainer, another date or time, or to cancel the training
  kind text not null check (kind in ('trainer', 'date', 'cancel')),
  reason text not null check (char_length(reason) between 10 and 2000),
  requested_by uuid references public.app_users (id) on delete set null,
  -- open until Training Excellence acts on it (done), declines it, or Growth withdraws it
  status text not null default 'open' check (status in ('open', 'done', 'declined', 'withdrawn')),
  resolved_by uuid references public.app_users (id) on delete set null,
  resolved_at timestamptz,
  -- Training Excellence's answer to Growth
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists training_change_requests_booking_id_idx on public.training_change_requests (booking_id);
create index if not exists training_change_requests_open_idx on public.training_change_requests (status) where status = 'open';

-- The app reads and writes only through the service role; nothing is exposed to the anon or signed-in keys.
alter table public.training_change_requests enable row level security;

-- Set when the trainer was reminded to mark a past training day as delivered (sent once per day).
alter table public.bookings add column if not exists delivery_reminder_sent_at timestamptz;

notify pgrst, 'reload schema';
