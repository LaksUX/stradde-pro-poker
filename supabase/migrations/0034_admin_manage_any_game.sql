-- Admin can see and manage any host's game: the same access a host or manager
-- has, via is_game_host(), plus read and update on the games table itself
-- (delete was already allowed in 0018).

create or replace function is_game_host(p_game_id uuid)
returns boolean as $$
  select exists (
    select 1 from games where id = p_game_id and host_id = auth.uid()
  )
  or exists (
    select 1 from game_managers where game_id = p_game_id and profile_id = auth.uid()
  )
  or is_admin();
$$ language sql stable security definer;

create policy "admin reads all games" on games
  for select using (is_admin());

create policy "admin updates all games" on games
  for update using (is_admin());
