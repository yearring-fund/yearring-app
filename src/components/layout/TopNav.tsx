import { NavLink } from 'react-router-dom'
import WalletButton from '../ui/WalletButton'
import SystemModeBadge from '../ui/SystemModeBadge'

const topLinks = [
  { to: '/',           label: 'Overview'    },
  { to: '/vault',      label: 'Vault'       },
  { to: '/lock',       label: 'Lock'        },
  { to: '/beneficiary',label: 'Beneficiary' },
]

export default function TopNav({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header className="w-full sticky top-0 z-30 bg-slate-50 border-b border-slate-100 flex justify-between items-center px-4 md:px-8 py-4">
      {/* Left: hamburger (mobile) + brand + page links (desktop) */}
      <div className="flex items-center gap-4">
        {/* Hamburger — mobile only */}
        <button
          onClick={onOpenNav}
          className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-200 transition-colors"
          aria-label="Open navigation"
        >
          <span className="material-symbols-outlined text-[22px]">menu</span>
        </button>

        <div className="text-xl font-black tracking-tighter text-blue-900">
          YearRing Fund
        </div>

        <nav className="hidden lg:flex gap-6">
          {topLinks.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                isActive
                  ? 'text-blue-700 border-b-2 border-blue-700 pb-1 font-semibold text-sm'
                  : 'text-slate-500 hover:text-blue-800 font-medium text-sm transition-colors duration-200'
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Right: status + wallet */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:block">
          <SystemModeBadge />
        </div>
        <WalletButton />
      </div>
    </header>
  )
}
