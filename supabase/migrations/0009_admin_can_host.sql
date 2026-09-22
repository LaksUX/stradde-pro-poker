-- Let an admin account also act as a host, for a single "super host/admin"
-- testing account. profiles.role stays a single value ('player'|'host'|
-- 'admin') — rather than inventing a second flag, every RLS insert policy
-- that previously required role = 'host' now accepts role = 'admin' too.
--
-- Nothing about who counts as a specific game's host, or a confirmed
-- player, changes here — is_game_host() and every downstream check stay
-- keyed off actually being that game's host_id or a game_players row, not
-- off profiles.role. This migration only widens the three gates on
-- *creating* a game/venue/hosting-entity in the first place.

alter policy "host creates games" on games
  with check (
    host_id = auth.uid()
    and exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('host', 'admin') and p.approved
    )
  );

alter policy "approved hosts create venues" on venues
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('host', 'admin') and p.approved
    )
  );

alter policy "approved host creates own entity" on hosting_entities
  with check (
    owner_profile_id = auth.uid()
    and exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('host', 'admin') and p.approved
    )
  );
