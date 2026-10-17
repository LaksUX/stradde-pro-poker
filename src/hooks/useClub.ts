import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { storedClubId, type ClubRole } from '../lib/club'

export type ClubCtx = { clubId: string; name: string; role: ClubRole; staffName: string }

// The club this browser is working in and the signed-in staff member's role.
export function useClub() {
  const [ctx, setCtx] = useState<ClubCtx | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const clubId = storedClubId()
    const uid = (await supabase.auth.getSession()).data.session?.user.id
    if (!clubId || !uid) {
      setCtx(null)
      setLoading(false)
      return
    }
    const [club, staff] = await Promise.all([
      supabase.from('clubs').select('name').eq('id', clubId).maybeSingle(),
      supabase.from('club_staff').select('role, display_name').eq('club_id', clubId).eq('user_id', uid).maybeSingle(),
    ])
    if (club.data && staff.data) {
      setCtx({
        clubId,
        name: club.data.name as string,
        role: staff.data.role as ClubRole,
        staffName: staff.data.display_name as string,
      })
    } else {
      setCtx(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { ctx, loading }
}
