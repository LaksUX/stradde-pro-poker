-- Upcoming games with RSVPs. The guest list of a scheduled game is simply its
-- game_players rows (the host adds names exactly as in a live game). A player
-- answers from their private card: In / Maybe / Out, plus optional arrival,
-- leaving time and a note that only the host reads.

create table if not exists game_rsvps (
  game_id uuid not null references games(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  response text not null default 'pending' check (response in ('pending', 'in', 'maybe', 'out')),
  arrive text,
  leave_by text,
  note text,
  updated_at timestamptz not null default now(),
  primary key (game_id, profile_id)
);

alter table game_rsvps enable row level security;

drop policy if exists "host reads rsvps" on game_rsvps;
create policy "host reads rsvps" on game_rsvps
  for select using (is_game_host(game_id));
-- No other policies: players write through set_rsvp below.

create or replace function get_card_upcoming(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c player_cards;
begin
  select * into c from player_cards where token = p_token;
  if not found then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'game_id', g.id,
      'name', g.name,
      'place', g.venue_freetext,
      'at', g.scheduled_for,
      'response', coalesce(r.response, 'pending'),
      'arrive', r.arrive,
      'leave_by', r.leave_by,
      'note', r.note,
      'going', (select count(*) from game_rsvps x where x.game_id = g.id and x.response = 'in')
    ) order by g.scheduled_for)
    from games g
    join game_players gp on gp.game_id = g.id and gp.profile_id = c.profile_id
    left join game_rsvps r on r.game_id = g.id and r.profile_id = c.profile_id
    where g.host_id = c.host_id
      and g.status = 'scheduled'
      and g.scheduled_for > now() - interval '12 hours'
  ), '[]'::jsonb);
end;
$$;

create or replace function set_rsvp(
  p_token text,
  p_game_id uuid,
  p_response text,
  p_arrive text default null,
  p_leave_by text default null,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c player_cards;
begin
  if p_response not in ('in', 'maybe', 'out') then
    raise exception 'bad response';
  end if;
  select * into c from player_cards where token = p_token;
  if not found then
    raise exception 'unknown card';
  end if;
  if not exists (
    select 1
    from games g
    join game_players gp on gp.game_id = g.id and gp.profile_id = c.profile_id
    where g.id = p_game_id and g.host_id = c.host_id and g.status = 'scheduled'
  ) then
    raise exception 'not invited to this game';
  end if;

  insert into game_rsvps (game_id, profile_id, response, arrive, leave_by, note, updated_at)
  values (
    p_game_id, c.profile_id, p_response,
    left(nullif(btrim(p_arrive), ''), 20),
    left(nullif(btrim(p_leave_by), ''), 20),
    left(nullif(btrim(p_note), ''), 280),
    now()
  )
  on conflict (game_id, profile_id) do update
    set response = excluded.response,
        arrive = excluded.arrive,
        leave_by = excluded.leave_by,
        note = excluded.note,
        updated_at = now();
end;
$$;

-- Starts a scheduled game: guests who answered Out are taken off the table,
-- everyone else stays seated.
create or replace function start_scheduled_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_game_host(p_game_id) then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from games where id = p_game_id and status = 'scheduled') then
    raise exception 'game is not scheduled';
  end if;

  delete from game_players gp
  using game_rsvps r
  where gp.game_id = p_game_id
    and gp.is_host = false
    and r.game_id = gp.game_id
    and r.profile_id = gp.profile_id
    and r.response = 'out';

  update games set status = 'live', scheduled_for = now() where id = p_game_id;
end;
$$;

revoke execute on function get_card_upcoming(text) from public;
grant execute on function get_card_upcoming(text) to anon, authenticated;
revoke execute on function set_rsvp(text, uuid, text, text, text, text) from public;
grant execute on function set_rsvp(text, uuid, text, text, text, text) to anon, authenticated;
revoke execute on function start_scheduled_game(uuid) from public;
grant execute on function start_scheduled_game(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table game_rsvps;
exception when others then
  null; -- already added, or realtime not enabled
end $$;

notify pgrst, 'reload schema';
