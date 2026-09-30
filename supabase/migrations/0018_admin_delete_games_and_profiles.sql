-- Lets an admin clean up test data from Home's Admin tab: delete a game
-- outright (cascades game_players/buyin_requests/settlement_transfers —
-- all reference games.id with on delete cascade, 0001_core_schema.sql), or
-- delete a player's profile entirely. Neither existed as an RLS policy
-- before — games and profiles had no delete policy at all, so even an
-- admin got a silent RLS-denied no-op trying either.
--
-- Deleting a profile does NOT cascade: venues.created_by, games.host_id,
-- and hosting_entities.owner_profile_id all reference profiles with no
-- cascade, so a profile that ever hosted anything fails with a real
-- foreign-key error instead of silently taking their games/venues down
-- with them — deliberate, not a gap to fix later.

create policy "admin deletes any game" on games
  for delete using (is_admin());

create policy "admin deletes any profile" on profiles
  for delete using (is_admin());
