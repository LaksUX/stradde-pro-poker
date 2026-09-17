-- game_players had no player-side update policy at all — the host could
-- update any row in their game, but a player couldn't touch their own row
-- to set cashout_confirm_status (needed by My Game's cash-out confirm/
-- dispute pair, per PAGE_PROMPTS.md "My Game"). Mirrors the same
-- intentionally-broad-at-the-row-level shape as buyin_requests' player
-- policy: the application layer must only ever send cashout_confirm_status
-- from a non-host session, never cashout/cashout_confirmed_at. Worth
-- tightening with a trigger before this leaves prototype status.

create policy "player sets confirm/dispute on own cashout" on game_players
  for update using (profile_id = auth.uid());
