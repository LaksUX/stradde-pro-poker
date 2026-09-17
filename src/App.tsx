import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { Continue } from './pages/Continue'
import { ApplyToHost } from './pages/ApplyToHost'
import { Home } from './pages/Home'
import { PendingApproval } from './pages/PendingApproval'
import { Admin } from './pages/Admin'
import { Join } from './pages/Join'
import { CreateGame } from './pages/CreateGame'
import { ScheduledGame } from './pages/ScheduledGame'
import { ShareTable } from './pages/ShareTable'
import { LiveGame } from './pages/LiveGame'
import { Settlement } from './pages/Settlement'
import { GameDetail } from './pages/GameDetail'
import { MySettlements } from './pages/MySettlements'
import { MyGame } from './pages/MyGame'
import { VenueDetail } from './pages/VenueDetail'
import { OfflineBanner } from './components/ui/OfflineBanner'

function RootRedirect() {
  const { session, profile, loading } = useAuth()
  if (loading) return <div className="p-6 text-center text-muted">Loading…</div>
  if (!session) return <Navigate to="/continue" replace />
  if (profile?.role === 'host' && profile.approved) return <Navigate to="/games/new" replace />
  if (profile?.role === 'host' && !profile.approved) return <Navigate to="/pending-approval" replace />
  return <Navigate to="/home" replace />
}

// Route map mirrors PAGE_PROMPTS.md's screen list — every screen is now
// wired to Supabase.
export default function App() {
  return (
    <BrowserRouter>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/continue" element={<Continue />} />
        <Route path="/apply-to-host" element={<ApplyToHost />} />
        <Route path="/home" element={<Home />} />
        <Route path="/pending-approval" element={<PendingApproval />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/join/:gameId" element={<Join />} />
        <Route path="/games/new" element={<CreateGame />} />
        <Route path="/games/:gameId/scheduled" element={<ScheduledGame />} />
        <Route path="/t/:gameId" element={<ShareTable />} />
        <Route path="/games/:gameId/live" element={<LiveGame />} />
        <Route path="/games/:gameId/settlement" element={<Settlement />} />
        <Route path="/my-settlements" element={<MySettlements />} />
        <Route path="/games/:gameId" element={<GameDetail />} />
        <Route path="/games/:gameId/my-game" element={<MyGame />} />
        <Route path="/venues/:venueId" element={<VenueDetail />} />
      </Routes>
    </BrowserRouter>
  )
}
