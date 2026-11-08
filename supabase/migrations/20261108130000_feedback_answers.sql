-- Editable feedback form: each response keeps its answers together with the questions as they were worded
-- ([{id, type, label, value}]), so changing the form never changes past answers. recommend and reason stay
-- filled in for scoring.
alter table public.feedback_responses add column if not exists answers jsonb;

notify pgrst, 'reload schema';
