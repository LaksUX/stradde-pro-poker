-- Host-initiated buy-ins, player-confirmed — see REQUIREMENTS.md's
-- thirteenth revision note. Previously (per the "Joining a game" section,
-- never actually built) a host adding a buy-in directly to a player's row
-- was meant to auto-confirm immediately, on the theory that the confirm
-- step exists to check the host's word, not the other way around. That's
-- reversed here: the host can now initiate a buy-in for any player
-- (including themselves), but it stays 'pending' — financially invisible,
-- per the money-integrity invariant — until that PLAYER confirms it. This
-- catches the host fat-fingering a count or crediting the wrong seat before
-- it ever counts, the same way host-confirm catches a player's overclaim.

alter table buyin_requests
  drop constraint buyin_requests_request_type_check,
  add constraint buyin_requests_request_type_check
    check (request_type in ('join', 'more_buyins', 'host_added'));

-- A host can insert a pending request on any confirmed player's behalf in
-- their own game (including their own row, since a host is also a
-- game_players row). Forced to request_type = 'host_added' and
-- status = 'pending' at the database layer, not just the app layer — a host
-- inserting straight to 'confirmed' would recreate exactly the money-
-- integrity gap self-join's host-confirm step exists to close, just from
-- the other direction.
create policy "host adds a pending buy-in on a player's behalf" on buyin_requests
  for insert with check (
    is_game_host(game_id)
    and request_type = 'host_added'
    and status = 'pending'
    and exists (
      select 1 from game_players gp
      where gp.id = game_player_id
        and gp.game_id = buyin_requests.game_id
        and gp.profile_id = buyin_requests.profile_id
    )
  );

-- Closes a gap 0002_rls_policies.sql flagged but left open: "player sets
-- their own confirm/dispute flag" is a row-level-only USING clause with no
-- column restriction, so nothing at the database layer stopped a player
-- from updating status/count/confirmed_at on their own join/more_buyins
-- request — only the app UI never doing that. That was a dormant gap before
-- (no legitimate flow needed a player to set status); it stops being
-- dormant now that a legitimate one exists, so it needs a real enforcement
-- point rather than staying app-layer-only.
create or replace function enforce_buyin_request_update()
returns trigger as $$
begin
  if is_game_host(new.game_id) then
    -- Host path: unrestricted, same as before this migration — confirming/
    -- declining join & more_buyins requests, adjusting a pending request's
    -- count before confirming, etc.
    return new;
  end if;

  -- Every non-host update reaches here only because
  -- "player sets their own confirm/dispute flag"'s USING clause already
  -- guaranteed old.profile_id = auth.uid() — this is always the requesting
  -- player acting on their own row from here on.

  if old.request_type = 'host_added' and old.status = 'pending' then
    -- Confirming or declining a buy-in the host added on their behalf.
    if new.status not in ('confirmed', 'declined') then
      raise exception 'a player may only confirm or decline a host-added request';
    end if;
    if new.count <> old.count
      or new.game_player_id is distinct from old.game_player_id
      or new.request_type <> old.request_type
      or new.profile_id <> old.profile_id
    then
      raise exception 'a player cannot change a request''s count or target while confirming it';
    end if;
    if new.status = 'confirmed' then
      new.confirmed_at := now();
    end if;
    return new;
  end if;

  -- Otherwise, the only thing a player may ever touch is their own
  -- confirm/dispute flag on an already-decided request — every other
  -- column must round-trip unchanged.
  if new.status <> old.status
    or new.count <> old.count
    or new.request_type <> old.request_type
    or new.game_player_id is distinct from old.game_player_id
    or new.confirmed_at is distinct from old.confirmed_at
  then
    raise exception 'a player can only set their confirm/dispute flag, not the request itself';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger buyin_requests_enforce_update
  before update on buyin_requests
  for each row execute function enforce_buyin_request_update();
