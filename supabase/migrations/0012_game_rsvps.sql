-- RSVP for scheduled games. A player who opens a scheduled game's link
-- today has no way to say "I'm in" ahead of time, and the host has no
-- pre-game headcount — Join.tsx explicitly refuses to do anything for a
-- 'scheduled' game (see its own comment) since joining is a buy-in request,
-- and RSVPing isn't one: no host approval, no money, no count, just a yes.
-- A separate table rather than overloading buyin_requests — the confirm/
-- decline lifecycle there doesn't fit a plain "I'm coming" toggle.

create table game_rsvps (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  full_name text not null, -- captured at RSVP time, same as buyin_requests.requester_name
  responded_at timestamptz not null default now(),
  unique (game_id, profile_id)
);

create index game_rsvps_game_idx on game_rsvps (game_id);

alter table game_rsvps enable row level security;

create policy "host reads rsvps in own game" on game_rsvps
  for select using (is_game_host(game_id));

create policy "player inserts own rsvp" on game_rsvps
  for insert with check (profile_id = auth.uid());

create policy "player deletes own rsvp" on game_rsvps
  for delete using (profile_id = auth.uid());

-- Names + count are public the same way the live roster is (see
-- public_live_roster) — anyone deciding whether to show up gets to see
-- who else already said yes, without needing to be signed in first.
create view public_game_rsvps as
  select game_id, profile_id, full_name, responded_at from game_rsvps;

alter view public_game_rsvps set (security_invoker = false);
grant select on public_game_rsvps to anon;

alter publication supabase_realtime add table game_rsvps;
