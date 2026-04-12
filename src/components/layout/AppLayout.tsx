import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import SideNav from './SideNav'
import TopNav from './TopNav'

export default function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-surface">
      <SideNav isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <TopNav onOpenNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 p-8">
          <Outlet />
        </main>
        <footer className="border-t border-slate-200 bg-slate-50 flex justify-between items-center px-8 py-5 text-xs uppercase tracking-widest text-slate-400 font-bold">
          <span>YearRing Fund Protocol</span>
          <span>Base Mainnet · Non-custodial · Non-guaranteed</span>
        </footer>
      </div>
    </div>
  )
}
