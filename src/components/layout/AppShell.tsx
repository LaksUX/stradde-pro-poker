import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useActiveGame } from '../../hooks/useActiveGame'

// The persistent chrome every "inside the app" screen shares — a back
// button up top and a two-item bottom nav (Home + Live), per PAGE_PROMPTS.md's
// Global section: "Bottom nav: Home + Live (when a game's active) only — no
// History entry." Public, unauthenticated screens (Share Table, Join,
// Scheduled Game's public state) deliberately stay outside this shell in
// App.tsx — a stranger opening a shared link shouldn't see app navigation
// for an app they haven't signed into.
//
// The bottom nav is a real two-way switch (Home vs. the active game), so it
// gets DESIGN-dashboard.md's segmented-tab treatment — a floating stadium
// pill with the active tab filled orange — rather than a flat edge-to-edge
// tab bar.
export function AppShell() {
  const { profile } = useAuth()
  const active = useActiveGame(profile)
  const location = useLocation()
  const navigate = useNavigate()

  const isHome = location.pathname === '/home'
  const liveHref = active ? (active.isHost ? `/games/${active.gameId}/live` : `/games/${active.gameId}/my-game`) : null
  const onLiveTab = active != null && location.pathname === liveHref

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 flex h-12 items-center bg-surface-soft/95 px-2 backdrop-blur">
        {!isHome ? (
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors active:scale-95 hover:bg-surface"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <div className="w-9" />
        )}
        <span className="flex-1 text-center text-sm font-bold tracking-wide text-ink">STRADDLE</span>
        <div className="w-9" />
      </header>

      <main className="pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 [padding-bottom:calc(env(safe-area-inset-bottom)+12px)]">
        <div className="flex gap-1 rounded-full border border-hairline bg-canvas p-1.5 shadow-elevated">
          <button
            onClick={() => navigate('/home')}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors active:scale-95 ${
              isHome ? 'bg-primary text-on-primary' : 'text-muted hover:text-ink'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 11l9-7 9 7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Home
          </button>
          {active && (
            <button
              onClick={() => navigate(liveHref!)}
              className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors active:scale-95 ${
                onLiveTab ? 'bg-primary text-on-primary' : 'text-muted hover:text-ink'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-win opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-win" />
              </span>
              Live
            </button>
          )}
        </div>
      </nav>
    </div>
  )
}
