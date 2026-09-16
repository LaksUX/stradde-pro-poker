// UNTESTED — I have no network access to supabase.co from where I built
// this, so I cannot deploy or invoke it to verify it actually works. Test
// this yourself (or with Claude Code, which has real network access)
// before trusting it. See the bottom of this file for exact test steps.
//
// Problem this solves: Supabase Anonymous Sign-in mints a new auth.uid()
// per browser/session. When someone "continues" with a phone number that
// already has a profile tied to a DIFFERENT auth.uid() (cleared browser, a
// different device, a fresh incognito window), the client has no safe way
// to prove it's really them and get back into that existing account — see
// useAuth.ts's continueWithPhone for the client-side half of this.
//
// Approach: Supabase's Admin API can mint a real session for an existing
// user via a magic-link token — but that API needs an email, and our
// anonymous users don't have one. So each profile gets a synthetic,
// internal-only email derived from its phone number (never sent anywhere,
// never shown to anyone) purely so the Admin API has something to generate
// a link against. This function:
//   1. Looks up the profile by phone (service-role, bypasses RLS safely —
//      this is the one place that's appropriate, since it's server-side and
//      never exposes the service-role key to the client).
//   2. Ensures that profile's auth user has its synthetic email set.
//   3. Generates a magic-link token for that email and returns the
//      "hashed_token" (not the emailed link — nothing is emailed).
//   4. The client calls supabase.auth.verifyOtp({ token_hash, type:
//      'magiclink' }) with that token, which establishes a real session for
//      the EXISTING user id, all without ever sending mail.
//
// Security note worth restating plainly: this does NOT add phone
// verification. Anyone who types a phone number they don't own can still
// request this and get signed in as that identity — same trust level as
// the rest of self-join today, per REQUIREMENTS.md's accepted gap. This
// function fixes the cross-device *mechanism*, not the underlying
// unverified-phone trust model.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function syntheticEmail(phoneE164: string): string {
  // Internal-only, never sent anywhere, never shown to a user. Just needs
  // to be a stable, valid-looking email unique per phone.
  const digits = phoneE164.replace(/[^0-9]/g, '')
  return `p${digits}@phone.pokernight.internal`
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 })
  }

  let phone: string
  try {
    const body = await req.json()
    phone = body.phone
    if (!phone || typeof phone !== 'string') throw new Error('bad phone')
  } catch {
    return new Response(JSON.stringify({ error: 'Expected { phone: string }' }), { status: 400 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, phone')
    .eq('phone', phone)
    .maybeSingle()

  if (profileError) {
    return new Response(JSON.stringify({ error: profileError.message }), { status: 500 })
  }
  if (!profile) {
    // No existing profile for this phone — the caller should fall back to
    // the normal client-side signInAnonymously + upsert path instead.
    return new Response(JSON.stringify({ exists: false }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const email = syntheticEmail(phone)

  // Make sure this user's synthetic email is actually set — a profile
  // created before this function existed won't have one yet.
  const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
    email,
    email_confirm: true,
  })
  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), { status: 500 })
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !linkData?.properties?.hashed_token) {
    return new Response(
      JSON.stringify({ error: linkError?.message ?? 'Could not generate a session token' }),
      { status: 500 }
    )
  }

  return new Response(
    JSON.stringify({ exists: true, hashed_token: linkData.properties.hashed_token }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})

// --- How to deploy and test this yourself ---
//
// 1. Deploy: `supabase functions deploy join-as-player` (needs the Supabase
//    CLI logged into your account — I can't run this from here).
// 2. The function needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as
//    secrets — Supabase sets these automatically for Edge Functions, you
//    shouldn't need to configure them manually, but confirm in the
//    dashboard under Edge Functions → join-as-player → Secrets if it fails.
// 3. Test directly with curl, bypassing the app entirely first:
//      curl -X POST https://<project-ref>.supabase.co/functions/v1/join-as-player \
//        -H "Authorization: Bearer <anon key>" \
//        -H "Content-Type: application/json" \
//        -d '{"phone":"+15550142"}'
//    Use a phone number you know already has a profile. You should get
//    back { exists: true, hashed_token: "..." }, not an error.
// 4. Only once that curl test works should you trust the client-side
//    integration in useAuth.ts's continueWithPhone.
