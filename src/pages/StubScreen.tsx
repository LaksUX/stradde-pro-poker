// Placeholder for a screen not yet wired to Supabase. Each one has a
// complete behavioral spec in PAGE_PROMPTS.md under the matching heading —
// build against that, following the pattern in ShareTable.tsx / LiveGame.tsx
// (the two screens here that most heavily use RLS + realtime) or
// Continue.tsx / Join.tsx (the two entry-context examples of the one auth
// mechanism).
export function StubScreen({ name }: { name: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="text-lg font-semibold text-ink">{name}</div>
      <p className="text-sm text-muted">
        Not built yet — see the "{name}" section of <code>PAGE_PROMPTS.md</code> for the full
        spec. Continue, Join, Create Game, Share Table, and Live Game are the real, wired
        reference implementations to follow the same pattern from.
      </p>
    </div>
  )
}
