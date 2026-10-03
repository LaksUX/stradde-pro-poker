// MVP 2.0 host sign-in with a group ID + 4-digit PIN.
//
// Same trick as join-as-player: mint a real session for the EXISTING host
// user via a magic-link token (no email is ever sent), which the client
// redeems with supabase.auth.verifyOtp. The difference is what proves who
// you are: the PIN is checked by check_group_pin() (migration 0023), which
// counts misses and locks the group for 15 minutes after 5 of them. That
// function is only callable with the service role, so this Edge Function is
// the only door.
//
// Deploy: `supabase functions deploy group-login` (no extra secrets needed;
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  let groupId: string
  let pin: string
  try {
    const body = await req.json()
    groupId = String(body.group_id ?? '').trim().toUpperCase()
    pin = String(body.pin ?? '')
    if (!groupId || !/^[0-9]{4}$/.test(pin)) throw new Error('bad input')
  } catch {
    return json({ error: 'Expected { group_id, pin } with a 4-digit PIN' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: check, error: checkError } = await admin.rpc('check_group_pin', {
    p_group_id: groupId,
    p_pin: pin,
  })
  if (checkError) return json({ error: checkError.message }, 500)
  if (!check?.ok) {
    if (check?.reason === 'locked') {
      return json({ error: 'Too many wrong PINs. Try again in 15 minutes.', reason: 'locked' }, 429)
    }
    // Same message for an unknown group and a wrong PIN, so group IDs
    // can't be probed.
    return json({ error: 'Group ID or PIN is not right.', reason: 'invalid' }, 401)
  }

  const profileId: string = check.profile_id
  const { data: existing, error: getError } = await admin.auth.admin.getUserById(profileId)
  if (getError || !existing?.user) {
    return json({ error: 'This group has no account to sign in to.' }, 500)
  }

  let email = existing.user.email
  if (!email) {
    email = `g${profileId.replace(/-/g, '')}@group.pokernight.internal`
    const { error: updateError } = await admin.auth.admin.updateUserById(profileId, {
      email,
      email_confirm: true,
    })
    if (updateError) return json({ error: `Could not prepare sign-in: ${updateError.message}` }, 500)
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !linkData?.properties?.hashed_token) {
    return json({ error: `Could not create a session: ${linkError?.message ?? 'no token'}` }, 500)
  }

  return json({ ok: true, hashed_token: linkData.properties.hashed_token })
})
