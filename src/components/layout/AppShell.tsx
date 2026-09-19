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
      <header className="sticky top-0 z-40 flex h-12 items-center border-b border-hairline-soft bg-canvas/95 px-2 backdrop-blur">
        {!isHome ? (
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors active:scale-95 hover:bg-surface-soft"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <div className="w-9" />
        )}
        <span className="flex-1 text-center text-sm font-semibold text-ink">Straddle</span>
        <div className="w-9" />
      </header>

      <main className="pb-20">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline-soft bg-canvas/95 backdrop-blur [padding-bottom:env(safe-area-inset-bottom)]">
        <button
          onClick={() => navigate('/home')}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors active:scale-95 ${
            isHome ? 'text-primary' : 'text-muted'
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 11l9-7 9 7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Home
        </button>
        {active && (
          <button
            onClick={() => navigate(liveHref!)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors active:scale-95 ${
              onLiveTab ? 'text-primary' : 'text-muted'
            }`}
          >
            <span className="relative">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="4" strokeDasharray="2 2" />
              </svg>
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />
            </span>
            Live
          </button>
        )}
      </nav>
    </div>
  )
}
