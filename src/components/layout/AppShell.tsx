import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useActiveGame } from '../../hooks/useActiveGame'

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
        <button
          onClick={() => navigate('/home')}
          className="flex-1 text-center text-sm font-bold tracking-wide text-ink"
        >
          STRADDLE
        </button>
        <div className="w-9" />
      </header>

      <main className={active ? 'pb-24' : 'pb-6'}>
        <Outlet />
      </main>

      {active && (
        <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 [padding-bottom:calc(env(safe-area-inset-bottom)+12px)]">
          <button
            onClick={() => navigate(onLiveTab ? '/home' : liveHref!)}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-hairline bg-canvas px-5 py-2.5 text-sm font-semibold shadow-elevated transition-colors active:scale-95 hover:bg-surface"
          >
            {onLiveTab ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 11l9-7 9 7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Home
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-win opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-win" />
                </span>
                Live
              </>
            )}
          </button>
        </nav>
      )}
    </div>
  )
}
