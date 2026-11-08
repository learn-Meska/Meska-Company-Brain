-- Portal access: the accesses ticked for each member of a portal (keys like 'te.assign', see src/lib/team-access.ts).
-- Portal admins (app_users.team_admin_of) have every access of their portal; company admins have everything.
alter table public.app_users add column if not exists permissions text[] not null default '{}';

-- Everyone already in a portal keeps what they could do before: every access of their portals.
update public.app_users set permissions = array(
  select k from unnest(array[
    'te.dashboard', 'te.assign', 'te.edit', 'te.cancel', 'te.find', 'te.trainers', 'te.compensation', 'te.settings', 'te.deal_value', 'te.emails'
  ]) k where 'approver' = any(roles::text[])
  union all
  select k from unnest(array['growth.new_deal', 'growth.all_bookings', 'growth.trainers', 'growth.calendar', 'growth.deal_value', 'growth.emails']) k
  where 'growth' = any(roles::text[])
  union all
  select k from unnest(array['content.view', 'content.write', 'content.submit', 'content.emails']) k where 'content' = any(roles::text[])
)
where cardinality(permissions) = 0;

notify pgrst, 'reload schema';
