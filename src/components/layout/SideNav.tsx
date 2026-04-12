import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { type Address } from 'viem'
import { ADDR, VAULT_ABI } from '../../lib/contracts'

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000' as const

type NavItem = {
  to: string
  icon: string
  label: string
}

const navItems: NavItem[] = [
  { to: '/',           icon: 'dashboard',          label: 'Overview'    },
  { to: '/vault',      icon: 'account_balance',    label: 'Vault'       },
  { to: '/lock',       icon: 'lock',               label: 'Lock'        },
  { to: '/beneficiary',icon: 'supervisor_account', label: 'Beneficiary' },
]

// ── Shared nav content ────────────────────────────────────────────────────────
function NavContent({
  onNavClick,
  isAdmin,
}: {
  onNavClick?: () => void
  isAdmin: boolean
}) {
  return (
    <>
      {/* Brand */}
      <div className="px-6 py-8 flex flex-col gap-1">
        <h1 className="text-lg font-black text-blue-900 tracking-tighter">YearRing</h1>
        <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/60 font-bold">
          Fund Protocol
        </p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavClick}
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-4 py-3 bg-white text-blue-700 font-semibold shadow-sm rounded-lg transition-all duration-200'
                : 'flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-blue-600 hover:bg-slate-200/50 rounded-lg transition-all duration-200'
            }
          >
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom links */}
      <div className="px-4 py-6 border-t border-slate-100 space-y-1">
        <a
          href="https://github.com/yearring-fund/YearRing-FundProtocol"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-2 text-slate-400 hover:text-blue-600 transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">code</span>
          <span>Protocol</span>
        </a>
        {isAdmin && (
          <NavLink
            to="/admin"
            onClick={onNavClick}
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-4 py-2 text-blue-700 font-semibold transition-all'
                : 'flex items-center gap-3 px-4 py-2 text-slate-400 hover:text-blue-600 transition-all'
            }
          >
            <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
            <span>Admin</span>
          </NavLink>
        )}
      </div>
    </>
  )
}

// ── SideNav ───────────────────────────────────────────────────────────────────
export default function SideNav({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const { address } = useAccount()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const hamburgerRef = useRef<HTMLButtonElement | null>(null)

  const { data: isAdmin } = useReadContract({
    address: ADDR.FundVaultV01,
    abi: VAULT_ABI,
    functionName: 'hasRole',
    args: [DEFAULT_ADMIN_ROLE, address as Address],
    query: { enabled: !!address },
  })

  // P0-1 · Esc closes the drawer
  useEffect(() => {
    if (!isOpen) return
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [isOpen, onClose])

  // P0-2 · Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // P1 · Focus management — move focus into close button on open, restore on close
  useEffect(() => {
    if (isOpen) {
      // Store the element that opened the drawer so we can return focus later
      hamburgerRef.current = document.activeElement as HTMLButtonElement
      // Small delay to let the transition start
      const t = setTimeout(() => closeButtonRef.current?.focus(), 50)
      return () => clearTimeout(t)
    } else {
      hamburgerRef.current?.focus()
    }
  }, [isOpen])

  return (
    <>
      {/* ── Desktop sidebar (always visible md+) ─────────────────────────── */}
      <aside className="hidden md:flex h-screen w-64 fixed left-0 top-0 flex-col bg-slate-50 border-r border-slate-200 z-40">
        <NavContent isAdmin={!!isAdmin} />
      </aside>

      {/* ── Mobile overlay + drawer ───────────────────────────────────────── */}
      {/* P0-3 backdrop — always in DOM for smooth opacity transition */}
      <div
        className={[
          'fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 md:hidden',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* P0-3 · Drawer with role="dialog" + aria-modal */}
      {/* P0-4 · Safe-area padding for iOS notch / home indicator */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={[
          'fixed top-0 left-0 h-full w-72 bg-slate-50 border-r border-slate-200 z-50 flex flex-col',
          'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
          'transform transition-transform duration-300 ease-in-out md:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Close button */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-200 transition-colors"
          aria-label="Close navigation"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <NavContent isAdmin={!!isAdmin} onNavClick={onClose} />
      </aside>
    </>
  )
}
