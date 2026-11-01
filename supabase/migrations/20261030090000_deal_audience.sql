-- New deal audience: Growth picks seniority levels and departments from the admin lists (lookups of kind
-- 'audience' and 'function') instead of uploading a participant CSV, and enters how many people will attend.

-- deals has no rows yet, so the new required column needs no default.
alter table public.deals add column if not exists participant_count integer not null check (participant_count between 1 and 10000);
-- "Mixed / all departments": a company-wide training, so no department is picked.
alter table public.deals add column if not exists all_departments boolean not null default false;

create table if not exists public.deal_audience (
  deal_id uuid not null references public.deals (id) on delete cascade,
  lookup_id uuid not null references public.lookups (id),
  primary key (deal_id, lookup_id)
);
create index if not exists deal_audience_lookup_id_idx on public.deal_audience (lookup_id);
alter table public.deal_audience enable row level security;

-- The participant list from the CSV step is gone (it never held any rows).
drop table if exists public.deal_participants;

notify pgrst, 'reload schema';
