-- Lets a player propose a cash-out amount themselves (My Game's combined
-- "Request buy-ins or cash-out" action) instead of only ever waiting for
-- the host to type one in on their behalf. The host still has the final
-- say — this is a proposal the host sees pre-filled in their own cashout
-- input, not a write to the authoritative `cashout` column itself.

alter table game_players add column cashout_requested numeric;

-- Closes a gap flagged (but left unfixed) since 0004_player_cashout_confirm.sql:
-- "player sets confirm/dispute on own cashout" has no column restriction at
-- the row level, so a player could already write `cashout` directly via a
-- raw API call, bypassing host confirmation entirely — the exact same class
-- of bug as profiles' role/approved self-update, fixed the same way
-- (prevent_self_role_change, 0014/0017). Adding a second player-writable
-- column (cashout_requested) here makes closing this properly non-optional
-- rather than a future cleanup: a non-host actor's update may only ever
-- change cashout_confirm_status and cashout_requested now — everything
-- else on the row reverts to its prior value.
create or replace function prevent_player_cashout_tamper()
returns trigger as $$
begin
  if not is_game_host(new.game_id) then
    new.cashout := old.cashout;
    new.is_host := old.is_host;
    new.profile_id := old.profile_id;
    new.game_id := old.game_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger game_players_prevent_player_tamper
  before update on game_players
  for each row execute function prevent_player_cashout_tamper();

-- One consistent "other players, names only" source for My Game regardless
-- of whether the game is still live or already closed — public_live_roster
-- (0002 migration) only covers status = 'live' and is also missing a
-- player's own game once it closes. No buy-in/cash-out/net column at all,
-- same privacy shape as venue_regulars.
create view game_roster_names as
select gp.game_id, gp.profile_id, p.full_name
from game_players gp
join profiles p on p.id = gp.profile_id
join games g on g.id = gp.game_id
where g.status in ('live', 'closed');

grant select on game_roster_names to authenticated;
