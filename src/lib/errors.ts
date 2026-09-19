import { toast } from './toast'

// See PAGE_PROMPTS.md's Global "Offline / connection loss mid-entry" edge
// case — silent data loss on a money-tracking app is the worst-case failure
// mode. [decision] The app blocks with a clear "didn't save" message rather
// than queuing writes locally and retrying — a home-game host tapping
// buy-ins at a table needs to know *right now* whether the tap counted, not
// have it silently resolve five minutes later after everyone's gone home.
// Every write in the app should go through this instead of a bare
// `await supabase.from(...)` with no error handling, so a dropped
// connection always surfaces instead of just doing nothing.
// Auth calls (signInAnonymously, session refresh) don't fail fast the way
// PostgREST queries do — verified live: pointing the client at an
// unreachable host left "Continuing…" spinning forever with no error,
// instead of the caller's catch block ever firing. A stuck spinner with no
// feedback is worse than an error message, so every user-initiated auth
// entry point (Continue, Join, Apply to host) races its call against this
// deadline instead of trusting the underlying library to give up on its own.
export async function withTimeout<T>(promise: Promise<T>, ms = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out — that took too long')), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

export async function runWrite(
  // PromiseLike, not Promise — a Supabase query builder is thenable but
  // isn't a real Promise (no .catch/.finally in its type), and callers pass
  // the builder itself (e.g. `() => supabase.from(...).update(...)`)
  // rather than an already-awaited call.
  action: () => PromiseLike<{ error: { message: string } | null }>,
  label: string
): Promise<boolean> {
  try {
    const { error } = await withTimeout(Promise.resolve(action()))
    if (error) {
      toast.error(`${label} didn't save: ${error.message}`)
      return false
    }
    return true
  } catch {
    toast.error(
      navigator.onLine
        ? `${label} didn't save — something went wrong. Try again.`
        : `${label} didn't save — you're offline. Reconnect and try again.`
    )
    return false
  }
}
