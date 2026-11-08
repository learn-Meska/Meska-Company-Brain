-- Team admins: each team (Training Excellence, Growth, Content) can have its own admins, who add,
-- edit and remove the people in that team from "My team". Company admins keep full control.
-- Holds the team roles this login leads; always a subset of app_users.roles.
alter table public.app_users add column if not exists team_admin_of text[] not null default '{}';

alter table public.app_users drop constraint if exists app_users_team_admin_of_check;
alter table public.app_users add constraint app_users_team_admin_of_check
  check (team_admin_of <@ array['approver', 'growth', 'content']::text[]);

notify pgrst, 'reload schema';
