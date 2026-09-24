-- Game join code — a short, typeable alternative to sharing the raw invite
-- URL/QR. gameId is a UUID, useless to read aloud or type from memory; this
-- adds a 6-character code (unambiguous alphabet: no 0/O, 1/I/L) a player can
-- enter directly instead of needing the link. The link/QR stays the primary
-- flow (still one tap, still works offline-scan) — the code is the fallback
-- for "just tell people at the table."

alter table games add column join_code text unique;

create or replace function generate_game_join_code() returns text as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from games where join_code = code);
  end loop;
  return code;
end;
$$ language plpgsql;

-- Only fills it in when the insert didn't already set one — keeps this
-- forward-compatible with anything that wants to pass its own code later,
-- without that being how it works today (CreateGame.tsx never sets it).
create or replace function set_game_join_code() returns trigger as $$
begin
  if new.join_code is null then
    new.join_code := generate_game_join_code();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger games_set_join_code
  before insert on games
  for each row execute function set_game_join_code();

-- Backfill games created before this migration.
update games set join_code = generate_game_join_code() where join_code is null;

-- Exposed the same way every other field on this view already is — meant to
-- be shared with anyone the host gives it to, same trust level as the QR
-- code/link it sits next to.
create or replace view public_game_summary as
  select id, name, venue_id, venue_freetext, scheduled_for, status, stake,
         table_size, table_status_override, host_id, join_code
  from games;

alter view public_game_summary set (security_invoker = false);
grant select on public_game_summary to anon;
