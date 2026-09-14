import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Login } from './pages/Login'
import { Join } from './pages/Join'
import { CreateGame } from './pages/CreateGame'
import { ShareTable } from './pages/ShareTable'
import { LiveGame } from './pages/LiveGame'
import { StubScreen } from './pages/StubScreen'

// Route map mirrors PAGE_PROMPTS.md's screen list. Five are real (wired to
// Supabase); the rest are stubs pointing back at their spec — see
// pages/StubScreen.tsx and the project README for how to continue them.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/join/:gameId" element={<Join />} />
        <Route path="/games/new" element={<CreateGame />} />
        <Route path="/t/:gameId" element={<ShareTable />} />
        <Route path="/games/:gameId/live" element={<LiveGame />} />

        {/* Stubs — real screens to build next, each spec'd in PAGE_PROMPTS.md */}
        <Route path="/pending-approval" element={<StubScreen name="Pending Approval" />} />
        <Route path="/admin" element={<StubScreen name="Admin" />} />
        <Route path="/home" element={<StubScreen name="Home" />} />
        <Route path="/games/:gameId/scheduled" element={<StubScreen name="Scheduled Game" />} />
        <Route path="/games/:gameId/my-game" element={<StubScreen name="My Game" />} />
        <Route path="/my-settlements" element={<StubScreen name="My Settlements" />} />
        <Route path="/games/:gameId/settlement" element={<StubScreen name="Settlement" />} />
        <Route path="/games/:gameId" element={<StubScreen name="Game Detail" />} />
        <Route path="/venues/:venueId" element={<StubScreen name="Venue Detail" />} />
      </Routes>
    </BrowserRouter>
  )
}
