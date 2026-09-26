-- Fixes "who owes who" showing blank names on My Settlements / Home / the
-- shared table link. 0005_profiles_shared_game_read.sql already let a player
-- read the *profile* of a settlement counterpart, but every one of those
-- screens gets there by embedding `profiles(full_name)` through a
-- `game_players` select on the OTHER player's row — and game_players itself
-- still only has "player reads own row only" (profile_id = auth.uid()), so
-- that outer row was never visible in the first place. The profiles fix
-- alone couldn't matter; this is the missing half.
--
-- Scoped deliberately narrow: visible only when a settlement_transfers row
-- already connects the two game_players rows, i.e. only after the host has
-- closed and settled that game. This does NOT let one player browse another
-- player's live cash-out/buy-in numbers mid-game — REQUIREMENTS.md's "a
-- player who is not the host sees only their own numbers" still holds while
-- a game is live, since no settlement_transfers rows exist until close.
--
-- Same-table self-reference in the policy body would recurse (see
-- is_admin()'s comment in 0002_rls_policies.sql for why), so this goes
-- through a security definer function exactly like is_game_host/
-- is_confirmed_player/is_admin already do.

create or replace function shares_settlement_transfer(p_game_players_id uuid)
returns boolean as $$
  select exists (
    select 1
    from settlement_transfers st
    join game_players gp on gp.id in (st.from_player_id, st.to_player_id)
    where p_game_players_id in (st.from_player_id, st.to_player_id)
      and gp.profile_id = auth.uid()
  );
$$ language sql stable security definer;

create policy "player reads settlement counterpart's row" on game_players
  for select using (shares_settlement_transfer(id));

-- Closes a gap flagged (but left unfixed) since applyToHost() in
-- useAuth.ts: "update own profile" had no column restriction, so any signed
-- in player could self-promote by calling
-- `profiles.update({ role: 'admin', approved: true })` directly against the
-- API — the client just never happened to send that call. Now that hosting
-- is admin-granted only (no more self-serve apply-to-host), there's no
-- remaining legitimate case for a self-update to touch role/approved at
-- all, so this trigger silently keeps both columns unchanged unless the
-- actor is an admin.
create or replace function prevent_self_role_change()
returns trigger as $$
begin
  if not is_admin() then
    new.role := old.role;
    new.approved := old.approved;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger profiles_prevent_self_role_change
  before update on profiles
  for each row execute function prevent_self_role_change();
