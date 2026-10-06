import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import logoUrl from '../assets/logo.svg'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'

const TABS = [
  { label: 'Positions',   path: '/portfolio/positions'   },
  { label: 'Activity',    path: '/portfolio/activity'    },
  { label: 'Locks',       path: '/portfolio/locks'       },
  { label: 'Beneficiary', path: '/portfolio/beneficiary' },
]

const BOTTOM_NAV = [
  { icon: 'home',        label: 'Home',       path: '/'           },
  { icon: 'cases',       label: 'Portfolio',  path: '/portfolio'  },
  { icon: 'how_to_vote', label: 'Governance', path: '/governance' },
  { icon: 'settings',    label: 'Settings',   path: '/settings'   },
]

function truncate(a: string) { return a.slice(0, 6) + '…' + a.slice(-4) }

export default function Portfolio() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { address, isConnected } = useAccount()
  const { connect }    = useConnect()
  const { disconnect } = useDisconnect()

  const tabActive = (path: string) =>
    location.pathname === path ||
    (path === '/portfolio/positions' && location.pathname === '/portfolio')

  const navActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path))

  return (
    <div
      className="min-h-screen bg-[#fbf9f5]"
      style={{ fontFamily: "'Manrope', sans-serif" }}
    >
      {/* ── Fixed header (top nav + sub-tabs) ──────────────────────────── */}
      <div className="fixed top-0 w-full z-50">

        {/* Top nav */}
        <div className="bg-[#fbf9f5]/85 backdrop-blur-xl">
          <div className="flex justify-between items-center px-5 md:px-8 py-4">

            {/* Mobile: network badge */}
            <div className="flex md:hidden items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#c3c8c2]/30 text-xs font-semibold text-[#434844] bg-[#f5f3ef]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#715a3e]" />
              Base Mainnet
            </div>

            {/* Desktop: logo + links */}
            <div className="hidden md:flex items-center gap-8">
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
              <div className="flex gap-6 items-center">
                {[
                  { label: 'Home',       path: '/'           },
                  { label: 'Portfolio',  path: '/portfolio'  },
                  { label: 'Governance', path: '/governance' },
                  { label: 'Settings',   path: '/settings'   },
                ].map(({ label, path }) => {
                  const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
                  return (
                    <button
                      key={label}
                      onClick={() => navigate(path)}
                      className={`text-sm font-medium tracking-tight transition-colors pb-0.5 ${
                        active
                          ? 'text-[#18281e] border-b-2 border-[#715a3e]'
                          : 'text-[#434844] hover:text-[#18281e]'
                      }`}
                      style={{ fontFamily: "'Noto Serif', serif" }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Wallet */}
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#c3c8c2]/30 text-xs font-semibold text-[#434844] bg-[#f5f3ef]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#715a3e]" />
                Base Mainnet
              </div>
              {isConnected && address ? (
                <button
                  onClick={() => disconnect()}
                  className="bg-[#18281e] text-white px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 active:scale-95 transition-all"
                >
                  {truncate(address)}
                </button>
              ) : (
                <button
                  onClick={() => connect({ connector: injected() })}
                  className="bg-[#18281e] text-white px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 active:scale-95 transition-all"
                >
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sub-nav tabs */}
        <div className="bg-[#fbf9f5]/95 backdrop-blur-xl border-b border-[#c3c8c2]/15">
          <div className="flex max-w-7xl mx-auto px-5 md:px-8 overflow-x-auto">
            {TABS.map(({ label, path }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`px-5 py-3.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${
                  tabActive(path)
                    ? 'text-[#18281e] border-[#715a3e]'
                    : 'text-[#434844] border-transparent hover:text-[#18281e] hover:border-[#c3c8c2]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Page content ──────────────────────────────────────────────── */}
      <div className="pt-[108px] pb-24 md:pb-12">
        <Outlet />
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 w-full md:hidden flex justify-around items-center px-6 py-3 bg-[#fbf9f5]/85 backdrop-blur-xl border-t border-[#c3c8c2]/15 z-50">
        {BOTTOM_NAV.map(({ icon, label, path }) => {
          const active = navActive(path)
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center p-2.5 rounded-xl transition-all ${
                active
                  ? 'bg-[#2d3e33] text-white scale-95'
                  : 'text-[#434844] hover:bg-[#f5f3ef]'
              }`}
            >
              <span
                className="material-symbols-outlined text-xl"
                style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {icon}
              </span>
              <span className="text-[9px] mt-0.5 font-semibold">{label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
