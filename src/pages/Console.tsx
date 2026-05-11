import { Navigate } from 'react-router-dom'

// Legacy admin console — redirects to the current admin panel
export default function Console() {
  return <Navigate to="/admin" replace />
}
