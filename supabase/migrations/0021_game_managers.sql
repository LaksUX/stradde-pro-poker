-- Game managers: lets a host delegate in-game management (approve buy-ins,
-- set cashouts) to another player at the table. A manager sees the same
-- LiveGame host view and has the same RLS write access as the host for
-- that specific game, but cannot delete the game or change its settings.
--
-- The simplest approach: widen is_game_host() to include managers. Every
-- existing RLS policy that calls is_game_host() automatically grants
-- managers the same row-level access the host already has — no policy
-- changes needed on game_players, buyin_requests, or settlement_transfers.

create table game_managers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (game_id, profile_id)
);

alter table game_managers enable row level security;

-- Host can see all managers in their game.
create policy "host reads managers in own game"
  on game_managers for select
  using (is_game_host(game_id));

-- A manager can see their own row (so the UI can check "am I a manager?").
create policy "manager reads own row"
  on game_managers for select
  using (profile_id = auth.uid());

-- Only the host can add or remove managers.
create policy "host inserts managers"
  on game_managers for insert
  with check (is_game_host(game_id));

create policy "host deletes managers"
  on game_managers for delete
  using (is_game_host(game_id));

-- Now widen is_game_host() to also return true for managers. The SECURITY
-- DEFINER flag lets this run outside RLS (avoiding recursion), same as the
-- original definition in 0002.
create or replace function is_game_host(p_game_id uuid)
returns boolean as $$
  select exists (
    select 1 from games where id = p_game_id and host_id = auth.uid()
  )
  or exists (
    select 1 from game_managers where game_id = p_game_id and profile_id = auth.uid()
  );
$$ language sql stable security definer;

-- Managers should also receive push notifications for new buy-in requests,
-- same as the host. Replace the trigger function to push to both.
create or replace function notify_new_request()
returns trigger as $$
declare
  v_host_id uuid;
  v_profile_ids jsonb;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  select host_id into v_host_id from games where id = new.game_id;
  if v_host_id is null then
    return new;
  end if;
  -- Collect host + all managers for this game.
  select jsonb_agg(pid) into v_profile_ids
  from (
    select v_host_id as pid
    union
    select profile_id from game_managers where game_id = new.game_id
  ) t;
  perform notify_push(jsonb_build_object(
    'profile_ids', v_profile_ids,
    'title', case when new.request_type = 'join' then 'New join request' else 'New buy-in request' end,
    'body', coalesce(new.requester_name, 'A player') || ' requested ' || new.count ||
            ' buy-in' || case when new.count = 1 then '' else 's' end,
    'url', '/games/' || new.game_id || '/live'
  ));
  return new;
end;
$$ language plpgsql security definer;

-- The prevent_player_cashout_tamper trigger checks is_game_host() to decide
-- who can write cashout — since is_game_host() now includes managers, they
-- automatically get that same trust. No trigger change needed.

-- Realtime so the host's UI updates when they add/remove a manager.
alter publication supabase_realtime add table game_managers;
