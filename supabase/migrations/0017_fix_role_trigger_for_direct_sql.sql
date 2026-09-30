-- 0014's prevent_self_role_change trigger checked only is_admin(), which
-- resolves auth.uid() — a claim that only exists on requests that went
-- through PostgREST with a real user JWT. A direct SQL editor session (or
-- any other superuser/service connection) has no JWT at all, so auth.uid()
-- is null there and is_admin() reads false — meaning the trigger was
-- silently reverting any role/approved change made directly in the SQL
-- editor back to its old value, including the exact
-- `update profiles set role = 'admin' where phone = ...` bootstrap/restore
-- procedure this project has documented and relied on since Admin.tsx's own
-- header comment. Verified live: this is why restoring a demoted admin's
-- role via direct SQL appeared to do nothing.
--
-- Fix: only apply the block when there IS an authenticated actor (auth.uid()
-- is not null) who isn't an admin — a direct database session is always
-- trusted, same as it always implicitly was before 0014 existed.

create or replace function prevent_self_role_change()
returns trigger as $$
begin
  if auth.uid() is not null and not is_admin() then
    new.role := old.role;
    new.approved := old.approved;
  end if;
  return new;
end;
$$ language plpgsql security definer;
