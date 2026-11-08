-- Content approval: a content team member (not a portal admin) sends the content for approval.
-- The guide waits in content_review_guide until a content admin approves it (then it becomes content_guide
-- and the trainer is told) or sends it back with a note.
alter table public.deals add column if not exists content_review_guide text;
alter table public.deals add column if not exists content_review_requested_at timestamptz;
alter table public.deals add column if not exists content_review_requested_by uuid references public.app_users (id) on delete set null;
alter table public.deals add column if not exists content_review_note text;

notify pgrst, 'reload schema';
