-- Records when a game actually went live, so the live game header can show
-- "Started 8:42 PM · 1h 23m". Optional for the app: the UI falls back to
-- scheduled_for when this column is missing or null, so running this only
-- makes the start time exact for games that were scheduled and started later.

alter table public.games add column if not exists started_at timestamptz;

update public.games
set started_at = scheduled_for
where started_at is null and status in ('live', 'closed');

create or replace function public.set_game_started_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'live' and new.started_at is null then
    new.started_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists games_set_started_at on public.games;
create trigger games_set_started_at
  before insert or update of status on public.games
  for each row execute function public.set_game_started_at();
