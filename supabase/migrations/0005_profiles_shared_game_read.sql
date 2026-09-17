-- profiles had no policy letting anyone but the owner (or an admin) read a
-- row — but LiveGame/GameDetail (host) and MySettlements (player) all embed
-- `profiles(full_name)` through a direct `game_players` select, which goes
-- through profiles' own RLS for the embedded resource. With no policy
-- covering "someone else in the same game", PostgREST silently returns a
-- null embedded object rather than erroring, so every player name in the
-- host's Live Game / Game Detail rendered as "—", and My Settlements
-- couldn't show who the other side of a transfer was. public_live_roster
-- was unaffected — it's a security-definer-style view (no
-- `security_invoker`), so it already bypasses this.
--
-- Fix: a profile is readable by anyone who shares a `game_players` row with
-- it in the same game — either because they host that game, or because
-- they're a confirmed player in it themselves. This matches what the UI
-- already surfaces elsewhere (names are shown in the shared table roster to
-- anyone who's joined), so it isn't a new exposure, just closing the gap
-- between that and direct embedded selects.

create policy "read profile of someone you share a game with" on profiles
  for select using (
    exists (
      select 1 from game_players gp
      where gp.profile_id = profiles.id
        and (
          is_game_host(gp.game_id)
          or exists (
            select 1 from game_players gp2
            where gp2.game_id = gp.game_id and gp2.profile_id = auth.uid()
          )
        )
    )
  );
