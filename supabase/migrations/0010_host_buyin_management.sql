-- Poker Night — host-driven buy-in corrections (Live Game's player bottom sheet)
-- The bottom sheet lets a host set any player's total buy-in count directly —
-- not just their own. That needs two grants 0002_rls_policies.sql never gave:
--
-- 1. Insert: the only existing insert policy required `profile_id = auth.uid()`
--    (a player submitting their own request), so a host adding buy-ins for
--    anyone but themselves was silently rejected by RLS.
-- 2. Delete: there was no delete policy on buyin_requests at all. Lowering a
--    player's buy-ins (see LiveGame.tsx's applyBuyinChange, which shrinks or
--    deletes the player's own confirmed rows newest-first, since a negative
--    correction row is impossible under the `count >= 1` check) needs one.

create policy "host inserts confirmed requests for players in own game" on buyin_requests
  for insert with check (is_game_host(game_id));

create policy "host deletes requests in own game" on buyin_requests
  for delete using (is_game_host(game_id));
