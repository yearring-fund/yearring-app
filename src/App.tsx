import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import Vault from './pages/Vault'
import Lock from './pages/Lock'
import Beneficiary from './pages/Beneficiary'
import Admin from './pages/Admin'
import Governance from './pages/Governance'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="vault" element={<Vault />} />
          <Route path="lock" element={<Lock />} />
          <Route path="beneficiary" element={<Beneficiary />} />
          <Route path="governance" element={<Governance />} />
          <Route path="admin" element={<Admin />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
