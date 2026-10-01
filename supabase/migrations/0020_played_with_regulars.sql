-- Generalizes host_regulars (0013): that view only ever returns "people who
-- played in a game I hosted," keyed by host_id. It can't express "people I
-- played alongside under someone else's hosting" at all, since it filters
-- gp.profile_id <> g.host_id and groups by host_id specifically.
--
-- my_regulars replaces it with a self-join over game_players: for every
-- closed game, every other participant (host or fellow player alike, since
-- the host has their own game_players row too) counts toward "played with."
-- Same privacy shape as before — grant select to authenticated, filtered
-- client-side to where viewer_id = the signed-in profile, same as
-- host_regulars was filtered by host_id.
drop view if exists host_regulars;

create view my_regulars as
select
  gp1.profile_id as viewer_id,
  gp2.profile_id as other_id,
  p.full_name,
  count(distinct gp1.game_id) as games_played
from game_players gp1
join game_players gp2 on gp2.game_id = gp1.game_id and gp2.profile_id <> gp1.profile_id
join games g on g.id = gp1.game_id
join profiles p on p.id = gp2.profile_id
where g.status = 'closed'
group by gp1.profile_id, gp2.profile_id, p.full_name;

grant select on my_regulars to authenticated;
