import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { Continue } from './pages/Continue'
import { ApplyToHost } from './pages/ApplyToHost'
import { Join } from './pages/Join'
import { CreateGame } from './pages/CreateGame'
import { ShareTable } from './pages/ShareTable'
import { LiveGame } from './pages/LiveGame'
import { Settlement } from './pages/Settlement'
import { StubScreen } from './pages/StubScreen'

function RootRedirect() {
  const { session, profile, loading } = useAuth()
  if (loading) return <div className="p-6 text-center text-muted">Loading…</div>
  if (!session) return <Navigate to="/continue" replace />
  if (profile?.role === 'host' && profile.approved) return <Navigate to="/games/new" replace />
  if (profile?.role === 'host' && !profile.approved) return <Navigate to="/pending-approval" replace />
  return <Navigate to="/home" replace />
}

// Route map mirrors PAGE_PROMPTS.md's screen list. Six are real (wired to
// Supabase); the rest are stubs pointing back at their spec — see
// pages/StubScreen.tsx and the project README for how to continue them.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/continue" element={<Continue />} />
        <Route path="/apply-to-host" element={<ApplyToHost />} />
        <Route path="/join/:gameId" element={<Join />} />
        <Route path="/games/new" element={<CreateGame />} />
        <Route path="/t/:gameId" element={<ShareTable />} />
        <Route path="/games/:gameId/live" element={<LiveGame />} />
        <Route path="/games/:gameId/settlement" element={<Settlement />} />

        {/* Stubs — real screens to build next, each spec'd in PAGE_PROMPTS.md */}
        <Route path="/pending-approval" element={<StubScreen name="Pending Approval" />} />
        <Route path="/admin" element={<StubScreen name="Admin" />} />
        <Route path="/home" element={<StubScreen name="Home" />} />
        <Route path="/games/:gameId/scheduled" element={<StubScreen name="Scheduled Game" />} />
        <Route path="/games/:gameId/my-game" element={<StubScreen name="My Game" />} />
        <Route path="/my-settlements" element={<StubScreen name="My Settlements" />} />
        <Route path="/games/:gameId" element={<StubScreen name="Game Detail" />} />
        <Route path="/venues/:venueId" element={<StubScreen name="Venue Detail" />} />
      </Routes>
    </BrowserRouter>
  )
}
