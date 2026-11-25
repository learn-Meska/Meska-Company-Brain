-- QR feedback for B2C sessions: each uploaded session gets its own feedback link (/f/<token>), like a booking day.
-- Participant answers are kept in their own table, so the B2B feedback (feedback_responses) is untouched.
-- Uploading the sheet again keeps the token: the upsert never names feedback_token.
alter table public.b2c_sessions add column if not exists feedback_token uuid not null default gen_random_uuid();
create unique index if not exists b2c_sessions_feedback_token_key on public.b2c_sessions (feedback_token);

create table if not exists public.b2c_feedback_responses (
  id uuid primary key default gen_random_uuid(),
  -- removing a cohort on /admin/b2c removes its feedback too, as deleting a booking does
  b2c_session_id uuid not null references public.b2c_sessions (id) on delete cascade,
  -- the trainer the session had when the answer came in, so a later re-upload can't move scores between trainers
  trainer_id uuid references public.trainers (id) on delete set null,
  recommend smallint check (recommend between 0 and 10),
  reason text,
  told_objectives boolean,
  practised boolean,
  ai_safety boolean,
  answers jsonb,
  created_at timestamptz not null default now()
);
create index if not exists b2c_feedback_responses_session_idx on public.b2c_feedback_responses (b2c_session_id);
create index if not exists b2c_feedback_responses_trainer_idx on public.b2c_feedback_responses (trainer_id);
alter table public.b2c_feedback_responses enable row level security;
