-- Trainer compensation, entered by hand by Training Excellence. Nothing is calculated from bookings, tiers or scores for now.
-- Trainers see their own lines on /me/compensation.

create table if not exists public.compensation_lines (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers (id),
  training_date date not null,
  training text not null,
  hours numeric not null check (hours >= 0),
  rate numeric not null check (rate >= 0),
  amount numeric not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid')),
  payment_date date,
  created_by uuid references public.app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists compensation_lines_trainer_id_idx on public.compensation_lines (trainer_id);
alter table public.compensation_lines enable row level security;

notify pgrst, 'reload schema';
