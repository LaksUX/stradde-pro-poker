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
            // First screen in this tab or installed app: there is nothing to go
            // back to, so Back goes Home instead of doing nothing.
            onClick={() => (location.key === 'default' ? navigate('/home') : navigate(-1))}
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
          className="flex-1 flex items-center justify-center gap-1.5 text-sm font-bold tracking-wide text-ink"
        >
          <svg className="text-primary" width="18" height="18" viewBox="0 0 48 46" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"/>
          </svg>
          STRADDLE
        </button>
        <div className="w-9" />
      </header>

      <main className={active ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : 'pb-6'}>
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
