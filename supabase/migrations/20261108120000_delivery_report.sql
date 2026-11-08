-- The trainer's delivery report for a training day: attendance, topics covered, engagement (1-5),
-- challenges and follow-up suggestions. Filled in when the trainer marks the day as delivered.
alter table public.bookings add column if not exists delivery_report jsonb;

notify pgrst, 'reload schema';
