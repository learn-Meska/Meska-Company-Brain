-- A compensation line belongs to a training day assigned to the trainer. `training` and `training_date` stay as what
-- the trainer sees, copied from the booking when the line is saved.

alter table public.compensation_lines add column if not exists booking_id uuid references public.bookings (id) on delete set null;
create index if not exists compensation_lines_booking_id_idx on public.compensation_lines (booking_id);

notify pgrst, 'reload schema';
