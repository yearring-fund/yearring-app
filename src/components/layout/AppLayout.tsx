import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAccount, useSwitchChain } from 'wagmi'
import { base } from 'wagmi/chains'
import SideNav from './SideNav'
import TopNav from './TopNav'

export default function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongNetwork = isConnected && chainId !== undefined && chainId !== base.id

  return (
    <div className="flex min-h-screen bg-surface">
      <SideNav isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <TopNav onOpenNav={() => setMobileNavOpen(true)} />
        {wrongNetwork && (
          <div className="flex items-center justify-between gap-3 px-6 py-2.5 bg-error text-on-error text-sm font-semibold">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">warning</span>
              Wrong network — please switch to Base Mainnet
            </span>
            <button
              onClick={() => switchChain({ chainId: base.id })}
              className="px-3 py-1 rounded-lg bg-on-error text-error text-xs font-bold hover:opacity-90 transition-opacity"
            >
              Switch to Base
            </button>
          </div>
        )}
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
