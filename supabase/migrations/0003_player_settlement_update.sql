-- Players could read their own settlement_transfers rows but never update
-- them - Confirm / Request change on My Settlements and Share Table's
-- closed state both need this. Mirrors the same USING clause as the
-- existing "player reads own transfers" SELECT policy.
--
-- Known gap, same shape as buyin_requests' player-confirm policy: this is
-- intentionally broad at the row level (any column, not just status/
-- request_note). The application layer must only ever send those two
-- columns in an update from a non-host session - worth tightening with a
-- trigger before this leaves prototype status, not assumed safe.

create policy "player updates status on own transfers" on settlement_transfers
  for update using (
    exists (
      select 1 from game_players gp
      where gp.id in (from_player_id, to_player_id) and gp.profile_id = auth.uid()
    )
  );
