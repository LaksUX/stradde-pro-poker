-- MVP 2.0: players no longer sign in, and hosts use a group ID + PIN, so phone
-- numbers are not needed any more. Remove every stored one.
--
-- BEFORE RUNNING: make sure every host/admin can still sign in without a phone.
-- This must return no rows (anyone listed has no group ID yet and would lose
-- the only way back into their account):
--
--   select p.id, p.full_name, p.role
--   from profiles p
--   left join host_groups g on g.profile_id = p.id
--   where p.role in ('host', 'admin') and g.profile_id is null;
--
-- Irreversible: the numbers are gone once this runs.

update profiles set phone = null where phone is not null;
