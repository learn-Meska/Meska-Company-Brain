-- Every deal has a segment: B2B (a company deal Growth sends from New deal) or B2C (coming later).
-- Existing deals were all created by Growth, so they become B2B.
alter table public.deals add column if not exists segment text not null default 'b2b' check (segment in ('b2b', 'b2c'));
