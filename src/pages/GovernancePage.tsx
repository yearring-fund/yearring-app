import logoUrl from '../assets/logo.svg'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useNavigate, useLocation } from 'react-router-dom'
import { injected } from 'wagmi/connectors'

const NAV = [
  { label: 'Home',       path: '/'           },
  { label: 'Portfolio',  path: '/portfolio'  },
  { label: 'Governance', path: '/governance' },
  { label: 'Settings',   path: '/settings'   },
] as const

const BOTTOM_NAV = [
  { icon: 'home',        label: 'Home',       path: '/'           },
  { icon: 'cases',       label: 'Portfolio',  path: '/portfolio'  },
  { icon: 'how_to_vote', label: 'Governance', path: '/governance' },
  { icon: 'settings',    label: 'Settings',   path: '/settings'   },
] as const

function truncate(addr: string) { return addr.slice(0, 6) + '…' + addr.slice(-4) }

export default function GovernancePage() {
  const { address, isConnected } = useAccount()
  const { connect }    = useConnect()
  const { disconnect } = useDisconnect()
  const navigate  = useNavigate()
  const location  = useLocation()

  return (
    <div className="min-h-screen pb-24 md:pb-0" style={{ background: '#fbf9f5' }}>

      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 w-full z-50 bg-[#fbf9f5]/85 backdrop-blur-xl border-b border-[#c3c8c2]/15">
        <div className="flex justify-between items-center px-5 md:px-8 py-4">
          <div className="flex items-center gap-8">
            <div
              className="flex items-center gap-2.5 cursor-pointer"
              onClick={() => navigate('/')}
            >
              <img src={logoUrl} alt="YearRing" className="h-7 w-7" />
              <span
                className="text-xl font-bold text-[#18281e]"
                style={{ fontFamily: "'Noto Serif', serif" }}
              >
                YearRing Fund
              </span>
            </div>
            <div className="hidden md:flex gap-6">
              {NAV.map(({ label, path }) => {
                const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
                return (
                  <button key={label} onClick={() => navigate(path)}
                    className={`text-sm font-medium tracking-tight pb-0.5 transition-colors ${
                      active ? 'text-[#18281e] border-b-2 border-[#715a3e]' : 'text-[#434844] hover:text-[#18281e]'
                    }`}
                    style={{ fontFamily: "'Noto Serif', serif" }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#c3c8c2]/30 text-xs font-semibold text-[#434844] bg-[#f5f3ef]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#715a3e]" />
              Base Mainnet
            </div>
            {isConnected && address ? (
              <button onClick={() => disconnect()}
                className="bg-[#18281e] text-white px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 transition-all">
                {truncate(address)}
              </button>
            ) : (
              <button onClick={() => connect({ connector: injected() })}
                className="bg-[#18281e] text-white px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 transition-all">
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-5 md:px-6 pt-28 pb-8">
        <div className="rounded-2xl p-8 flex flex-col items-center text-center gap-4"
          style={{ background: '#f5f5f0', border: '1px solid #e8e8e2' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#715a3e20' }}>
            <span className="material-symbols-outlined text-2xl" style={{ color: '#715a3e' }}>how_to_vote</span>
          </div>
          <div>
            <h2 className="text-base font-bold text-[#1b1c1a] mb-2" style={{ fontFamily: "'Noto Serif', serif" }}>
              Governance — Coming Soon
            </h2>
            <p className="text-xs text-[#434844]/60 leading-relaxed max-w-sm">
              On-chain governance signalling is being redesigned for V2.1. Points holders will be able to signal preferences on protocol parameters once the new governance module is deployed.
            </p>
          </div>
          <button
            onClick={() => navigate('/portfolio/positions')}
            className="mt-2 px-5 py-2 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-all"
            style={{ background: '#18281e' }}
          >
            Go to Portfolio
          </button>
        </div>
      </div>

      {/* ── Bottom nav (mobile) ──────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden z-50 border-t border-[#c3c8c2]/20"
        style={{ background: '#fbf9f5/95', backdropFilter: 'blur(16px)' }}>
        <div className="flex">
          {BOTTOM_NAV.map(({ icon, label, path }) => {
            const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
            return (
              <button key={path} onClick={() => navigate(path)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-semibold transition-colors ${
                  active ? 'text-[#18281e]' : 'text-[#434844]/40'
                }`}>
                <span className="material-symbols-outlined text-xl">{icon}</span>
                {label}
              </button>
            )
          })}
        </div>
      </nav>

    </div>
  )
}
