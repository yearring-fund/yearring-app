import { useState } from 'react'

type Period = 'today' | 'week' | 'month'
import logoUrl from '../assets/logo.svg'
import { useAccount, useDisconnect, useConnect } from 'wagmi'
import { useNavigate, useLocation } from 'react-router-dom'
import { injected } from 'wagmi/connectors'
import { ADDR } from '../lib/contracts'

const NAV_ITEMS = [
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

const CONTRACTS = [
  { name: 'Fund Vault',            key: 'FundVaultV01'         },
  { name: 'Lock Ledger',           key: 'LockLedgerV02'        },
  { name: 'Lock Reward Manager',   key: 'LockRewardManagerV02' },
  { name: 'Lock Benefit',          key: 'LockBenefitV02'       },
  { name: 'Beneficiary Module',    key: 'BeneficiaryModuleV02' },
  { name: 'Reward Token (RWT)',     key: 'RewardToken'          },
  { name: 'Strategy Manager',      key: 'StrategyManagerV01'   },
  { name: 'Metrics Layer',         key: 'MetricsLayerV02'      },
  { name: 'Governance Signal',     key: 'GovernanceSignalV02'  },
] as const

function shortAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="flex items-center justify-between py-2.5 gap-3">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/50">{label}</div>
        <div className="font-mono text-xs text-[#1b1c1a] hidden md:block">{value}</div>
        <div className="font-mono text-xs text-[#1b1c1a] md:hidden">{shortAddr(value)}</div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={copy}
          className="p-1.5 rounded-lg text-[#434844]/40 hover:text-[#434844] hover:bg-[#e8e8e2] transition-colors"
          title="Copy"
        >
          <span className="material-symbols-outlined text-base">
            {copied ? 'check' : 'content_copy'}
          </span>
        </button>
        <a
          href={`https://basescan.org/address/${value}`}
          target="_blank"
          rel="noreferrer"
          className="p-1.5 rounded-lg text-[#434844]/40 hover:text-[#434844] hover:bg-[#e8e8e2] transition-colors"
          title="View on BaseScan"
        >
          <span className="material-symbols-outlined text-base">open_in_new</span>
        </a>
      </div>
    </div>
  )
}

export default function Settings() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { connect } = useConnect()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [contractsOpen, setContractsOpen] = useState(true)
  const [addrCopied, setAddrCopied] = useState(false)
  const [period, setPeriod] = useState<Period>(
    () => (localStorage.getItem('homePeriod') as Period) || 'week'
  )

  function handlePeriod(p: Period) {
    setPeriod(p)
    localStorage.setItem('homePeriod', p)
  }

  async function copyAddress() {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setAddrCopied(true)
    setTimeout(() => setAddrCopied(false), 2000)
  }

  return (
    <div className="min-h-screen pb-24 md:pb-0" style={{ background: '#fbf9f5' }}>

      {/* ── Top nav (desktop) ──────────────────────────────────────────── */}
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
            <div className="hidden md:flex gap-6 items-center">
              {NAV_ITEMS.map(({ label, path }) => {
                const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
                return (
                  <button
                    key={label}
                    onClick={() => navigate(path)}
                    className={`text-sm font-medium tracking-tight transition-colors pb-0.5 ${
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
              <button
                onClick={() => disconnect()}
                className="bg-[#18281e] text-white px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 transition-all"
              >
                {truncate(address)}
              </button>
            ) : (
              <button
                onClick={() => connect({ connector: injected() })}
                className="bg-[#18281e] text-white px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 transition-all"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-5 md:px-6 pt-24 pb-8 space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>
          Settings
        </h2>
        <p className="mt-1 text-xs text-[#434844]/60">Account and protocol configuration.</p>
      </div>

      {/* ── Account ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#f5f5f0' }}>
        <div className="px-5 py-3 border-b border-[#e8e8e2]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/50">Account</span>
        </div>
        <div className="p-5 space-y-4">
          {/* Network */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#434844]/60">Network</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-white text-[#434844]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#715a3e]" />
              Base Mainnet
            </span>
          </div>

          {/* Wallet */}
          {isConnected && address ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-[#434844]/60 mb-0.5">Wallet</div>
                  <div className="font-mono text-sm text-[#1b1c1a] hidden md:block">{address}</div>
                  <div className="font-mono text-sm text-[#1b1c1a] md:hidden">{shortAddr(address)}</div>
                </div>
                <button
                  onClick={copyAddress}
                  className="p-1.5 rounded-lg text-[#434844]/40 hover:text-[#434844] hover:bg-[#e8e8e2] transition-colors flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-base">
                    {addrCopied ? 'check' : 'content_copy'}
                  </span>
                </button>
              </div>

              <div style={{ height: '1px', background: '#e8e8e2' }} />

              <button
                onClick={() => disconnect()}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-600 transition-colors"
              >
                <span className="material-symbols-outlined text-base">logout</span>
                Disconnect Wallet
              </button>
            </>
          ) : (
            <button
              onClick={() => connect({ connector: injected() })}
              className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #18281e, #2d3e33)' }}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      {/* ── Display ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#f5f5f0' }}>
        <div className="px-5 py-3 border-b border-[#e8e8e2]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/50">Display</span>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-[#1b1c1a]">Homepage P/L Period</div>
              <div className="text-[11px] text-[#434844]/50 mt-0.5">
                Estimated earnings shown on the home dashboard.
              </div>
            </div>
            <div className="flex flex-shrink-0 p-1 rounded-lg gap-0.5" style={{ background: '#e8e8e2' }}>
              {(['today', 'week', 'month'] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => handlePeriod(p)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold capitalize transition-all ${
                    period === p
                      ? 'bg-white text-[#18281e] shadow-sm'
                      : 'text-[#434844]/60 hover:text-[#434844]'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Protocol Contracts ──────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#f5f5f0' }}>
        <button
          onClick={() => setContractsOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[#ededea] transition-colors"
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/50">
            Protocol Contracts
          </span>
          <span
            className="material-symbols-outlined text-base text-[#434844]/40 transition-transform duration-200"
            style={{ transform: contractsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            expand_more
          </span>
        </button>

        {contractsOpen && (
          <div className="px-5 pb-4">
            <div style={{ height: '1px', background: '#e8e8e2', marginBottom: '4px' }} />
            {CONTRACTS.map(({ name, key }) => (
              <div key={key} style={{ borderBottom: '1px solid #e8e8e240' }}>
                <CopyRow label={name} value={ADDR[key]} />
              </div>
            ))}
            {/* USDC */}
            <CopyRow label="USDC (Base)" value={ADDR.USDC} />
          </div>
        )}
      </div>

      {/* ── About ───────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#f5f5f0' }}>
        <div className="px-5 py-3 border-b border-[#e8e8e2]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/50">About</span>
        </div>
        <div className="p-5 space-y-3">
          {[
            ['Protocol',  'YearRing Fund'],
            ['Version',   'V02'],
            ['Network',   'Base Mainnet · Chain ID 8453'],
            ['License',   'BUSL-1.1 with Additional Use Grant'],
            ['Audit',     'In preparation · Allowlist active'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span className="text-[#434844]/60">{label}</span>
              <span className={`text-[#1b1c1a] ${label === 'Version' ? 'font-mono' : 'font-semibold'}`}>{value}</span>
            </div>
          ))}
          <div style={{ height: '1px', background: '#e8e8e2' }} />
          <div className="flex items-center flex-wrap gap-x-4 gap-y-2 pt-1">
            <a
              href={`https://basescan.org/address/${ADDR.FundVaultV01}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-[#434844]/50 hover:text-[#434844] transition-colors"
            >
              <span className="material-symbols-outlined text-sm">open_in_new</span>
              BaseScan
            </a>
            <a
              href="https://github.com/yearringfund"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-[#434844]/50 hover:text-[#434844] transition-colors"
            >
              <span className="material-symbols-outlined text-sm">code</span>
              GitHub
            </a>
            <span className="text-xs text-[#434844]/30">·</span>
            <a
              href="https://docs.yearringfund.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-[#434844]/50 hover:text-[#434844] transition-colors"
            >
              <span className="material-symbols-outlined text-sm">menu_book</span>
              Docs
            </a>
          </div>
        </div>
      </div>
      </div>{/* end content */}

      {/* ── Mobile bottom nav ───────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 w-full md:hidden flex justify-around items-center px-6 py-3 bg-[#fbf9f5]/85 backdrop-blur-xl border-t border-[#c3c8c2]/15 z-50">
        {BOTTOM_NAV.map(({ icon, label, path }) => {
          const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
          return (
            <button key={path} onClick={() => navigate(path)} className="flex flex-col items-center gap-0.5">
              <span
                className="material-symbols-outlined text-2xl transition-colors"
                style={{
                  color: active ? '#18281e' : '#434844',
                  fontVariationSettings: active ? "'FILL' 1" : undefined,
                }}
              >
                {icon}
              </span>
              <span className={`text-[9px] font-semibold ${active ? 'text-[#18281e]' : 'text-[#434844]/50'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </nav>

    </div>
  )
}
