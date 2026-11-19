-- B2C sessions: public cohorts Meska runs itself (diplomas, programs), uploaded by admins from the
-- "B2C Sessions" Excel template on /admin/b2c and shown on the calendar as B2C trainings.
-- They are kept apart from bookings: no deal, no trainer availability or slot locks, no emails.
create table if not exists public.b2c_sessions (
  id uuid primary key default gen_random_uuid(),
  program text not null,
  cohort text not null,
  format text not null check (format in ('online', 'offline')),
  day_number integer not null check (day_number between 1 and 100),
  session text not null,
  date date not null,
  start_time time not null,
  end_time time not null check (end_time > start_time),
  location text,
  -- the name as typed in the sheet; trainer_id when it matches a trainer profile
  trainer_name text,
  trainer_id uuid references public.trainers (id) on delete set null,
  status text not null check (status in ('confirmed', 'awaiting_trainer', 'needs_trainer', 'cancelled')),
  delivered boolean not null default false,
  imported_by uuid references public.app_users (id) on delete set null,
  imported_at timestamptz not null default now(),
  -- one row per cohort day: uploading the sheet again updates it
  unique (program, cohort, day_number)
);
create index if not exists b2c_sessions_date_idx on public.b2c_sessions (date);
create index if not exists b2c_sessions_trainer_idx on public.b2c_sessions (trainer_id);
alter table public.b2c_sessions enable row level security;
