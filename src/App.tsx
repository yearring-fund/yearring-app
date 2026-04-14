import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import Home from './pages/Home'
import Portfolio from './pages/Portfolio'
import Positions from './pages/portfolio/Positions'
import Activity from './pages/portfolio/Activity'
import Locks from './pages/portfolio/Locks'
import BeneficiaryPage from './pages/portfolio/Beneficiary'
import Admin from './pages/Admin'
import Settings from './pages/Settings'
import GovernancePage from './pages/GovernancePage'
import Console from './pages/Console'
import ErrorBoundary from './components/ui/ErrorBoundary'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── New design (standalone, no AppLayout) ─────────────────── */}
        <Route index element={<ErrorBoundary><Home /></ErrorBoundary>} />
        <Route path="settings"    element={<ErrorBoundary><Settings /></ErrorBoundary>} />
        <Route path="governance"  element={<ErrorBoundary><GovernancePage /></ErrorBoundary>} />
        <Route path="console"     element={<ErrorBoundary><Console /></ErrorBoundary>} />

        <Route path="portfolio" element={<ErrorBoundary><Portfolio /></ErrorBoundary>}>
          <Route index element={<Navigate to="positions" replace />} />
          <Route path="positions"   element={<Positions />} />
          <Route path="activity"    element={<Activity />} />
          <Route path="locks"       element={<Locks />} />
          <Route path="beneficiary" element={<BeneficiaryPage />} />
        </Route>

        {/* ── Legacy redirects ─────────────────────────────────────────── */}
        <Route path="dashboard"   element={<Navigate to="/" replace />} />
        <Route path="vault"       element={<Navigate to="/portfolio/positions" replace />} />
        <Route path="lock"        element={<Navigate to="/portfolio/locks" replace />} />
        <Route path="beneficiary" element={<Navigate to="/portfolio/beneficiary" replace />} />

        {/* ── Admin console (AppLayout shell) ──────────────────────────── */}
        <Route element={<AppLayout />}>
          <Route path="admin" element={<ErrorBoundary><Admin /></ErrorBoundary>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
