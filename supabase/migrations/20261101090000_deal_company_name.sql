-- New deal: Growth enters the client's company name before the program name.
alter table public.deals add column if not exists company_name text not null default '';

notify pgrst, 'reload schema';
