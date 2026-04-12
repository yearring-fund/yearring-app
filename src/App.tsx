import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import Vault from './pages/Vault'
import Lock from './pages/Lock'
import Beneficiary from './pages/Beneficiary'
import Admin from './pages/Admin'
import Governance from './pages/Governance'
import ErrorBoundary from './components/ui/ErrorBoundary'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="vault" element={<ErrorBoundary><Vault /></ErrorBoundary>} />
          <Route path="lock" element={<ErrorBoundary><Lock /></ErrorBoundary>} />
          <Route path="beneficiary" element={<ErrorBoundary><Beneficiary /></ErrorBoundary>} />
          <Route path="governance" element={<ErrorBoundary><Governance /></ErrorBoundary>} />
          <Route path="admin" element={<ErrorBoundary><Admin /></ErrorBoundary>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
