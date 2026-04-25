import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import logoUrl from '../assets/logo.svg'
import {
  useAccount,
  useReadContracts,
  useReadContract,
  usePublicClient,
  useConnect,
  useDisconnect,
} from 'wagmi'
import { injected } from 'wagmi/connectors'
import { formatUnits, type Address } from 'viem'
import { ADDR, VAULT_ABI, AAVE_POOL_ABI, AAVE_V3_POOL_BASE, LEDGER_ABI } from '../lib/contracts'

// ── Design tokens (Private Atelier palette) ────────────────────────────────
// primary       #18281e   primary-container #2d3e33   on-primary-container #96a99b
// secondary     #715a3e   background        #fbf9f5   on-surface           #1b1c1a
// on-surface-variant #434844   surface-container-low #f5f3ef
// outline-variant #c3c8c2   surface-container-lowest #ffffff
// These conflict with the existing MD3 palette so we use arbitrary Tailwind values.

type Period = 'today' | 'week' | 'month'

type ActivityItem = {
  type: 'Deposit' | 'Redeem'
  shares: bigint
  txHash: string
  blockNumber: bigint
  timestamp: number | null
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtUSD(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(ts: number | null) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function truncateAddr(a: string) {
  return a.slice(0, 6) + '…' + a.slice(-4)
}

// ── Sub-components ─────────────────────────────────────────────────────────

const OFFICIAL_LINKS = [
  { label: 'Website', href: 'https://yearringfund.com',                              display: 'yearringfund.com',                            external: false },
  { label: 'App',     href: 'https://app.yearringfund.com',                          display: 'app.yearringfund.com',                        external: false },
  { label: 'Docs',    href: 'https://docs.yearringfund.com',                         display: 'docs.yearringfund.com',                       external: true  },
  { label: 'GitHub',  href: 'https://github.com/SiLugang/YearRing-FundProtocol',    display: 'github.com/SiLugang/YearRing-FundProtocol',   external: true  },
  { label: 'Email',   href: 'mailto:hello@yearringfund.com',                         display: 'hello@yearringfund.com',                      external: false },
]

function SecurityNoticeCard({ className = '' }: { className?: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{ border: '1px solid #e8e8e2', background: '#f9f9f6' }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-widest text-[#18281e]/60 mb-2">
            Security Notice
          </p>
          <p className="text-xs text-[#434844] leading-relaxed">
            Please verify all access points through{' '}
            <a href="https://yearringfund.com" className="font-semibold text-[#18281e] hover:underline">
              yearringfund.com
            </a>
            . We only recognize the official links listed here. Official contact:{' '}
            <a href="mailto:hello@yearringfund.com" className="font-semibold text-[#18281e] hover:underline">
              hello@yearringfund.com
            </a>
          </p>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-[#18281e] border border-[#18281e]/15 hover:bg-[#18281e]/5 transition-all whitespace-nowrap"
        >
          View Official Links
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            {expanded ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid #e8e8e2' }}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4 sm:grid-cols-4">
            {OFFICIAL_LINKS.map(({ label, href, display, external }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#434844]/40">
                  {label}
                </span>
                <a
                  href={href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noopener noreferrer' : undefined}
                  className="text-[11px] font-semibold text-[#18281e] hover:underline break-all leading-snug"
                >
                  {display}
                </a>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#8a9089] leading-relaxed">
            Only trust links listed above. Any other links or contact methods are unofficial.
          </p>
        </div>
      )}
    </div>
  )
}

function NetworkBadge() {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#c3c8c2]/30 text-xs font-semibold text-[#434844] bg-[#f5f3ef]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#715a3e]" />
      Base Mainnet
    </div>
  )
}

function WalletBtn({ isConnected, address }: { isConnected: boolean; address?: string }) {
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()
  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="bg-[#18281e] text-white px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 active:scale-95 transition-all"
      >
        {truncateAddr(address)}
      </button>
    )
  }
  return (
    <button
      onClick={() => connect({ connector: injected() })}
      className="bg-[#18281e] text-white px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 active:scale-95 transition-all"
    >
      Connect Wallet
    </button>
  )
}


function ActivityRow({
  item,
  pps,
}: {
  item: ActivityItem
  pps: number
}) {
  const isDeposit = item.type === 'Deposit'
  const usdcApprox = Number(formatUnits(item.shares, 18)) * pps
  return (
    <div className="flex items-center justify-between p-4 bg-[#f5f3ef] rounded-xl">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
          isDeposit ? 'bg-[#18281e]/8 text-[#18281e]' : 'bg-[#715a3e]/8 text-[#715a3e]'
        }`}>
          <span className="material-symbols-outlined text-base">
            {isDeposit ? 'arrow_downward' : 'arrow_upward'}
          </span>
        </div>
        <div>
          <p className="text-sm font-bold text-[#1b1c1a]">{item.type}</p>
          <p className="text-[10px] text-[#434844] uppercase tracking-wider font-medium">
            {fmtDate(item.timestamp)}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-bold ${isDeposit ? 'text-[#18281e]' : 'text-[#1b1c1a]'}`}>
          {isDeposit ? '+' : '-'}${fmtUSD(usdcApprox)}
        </p>
        <p className="text-[9px] font-extrabold uppercase tracking-widest text-[#715a3e]/60">
          Confirmed
        </p>
      </div>
    </div>
  )
}

// Desktop activity table row
function ActivityTableRow({ item, pps }: { item: ActivityItem; pps: number }) {
  const isDeposit = item.type === 'Deposit'
  const usdcApprox = Number(formatUnits(item.shares, 18)) * pps
  return (
    <div className="grid grid-cols-4 px-8 py-5 items-center hover:bg-white transition-colors group">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
          isDeposit ? 'bg-[#18281e]/8 text-[#18281e]' : 'bg-[#715a3e]/8 text-[#715a3e]'
        }`}>
          <span className="material-symbols-outlined text-sm">
            {isDeposit ? 'arrow_downward' : 'arrow_upward'}
          </span>
        </div>
        <span className="font-bold text-[#1b1c1a] group-hover:text-[#18281e] transition-colors text-sm">
          {item.type}
        </span>
      </div>
      <div
        className="font-bold text-[#1b1c1a] text-sm"
        style={{ fontFamily: "'Noto Serif', serif" }}
      >
        {isDeposit ? '+' : '-'}${fmtUSD(usdcApprox)}
      </div>
      <div className="text-sm text-[#434844]">{fmtDate(item.timestamp)}</div>
      <div className="text-right">
        <span className="inline-block px-3 py-1 rounded-full bg-[#715a3e]/10 text-[#715a3e] text-xs font-bold">
          Confirmed
        </span>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const period: Period = (localStorage.getItem('homePeriod') as Period) || 'week'
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  // ── On-chain reads ────────────────────────────────────────────────────────
  const { data: reads } = useReadContracts({
    contracts: [
      {
        address: ADDR.FundVaultV01 as Address,
        abi: VAULT_ABI,
        functionName: 'balanceOf',
        args: [address ?? '0x0000000000000000000000000000000000000000'],
      },
      {
        address: ADDR.FundVaultV01 as Address,
        abi: VAULT_ABI,
        functionName: 'totalAssets',
      },
      {
        address: ADDR.FundVaultV01 as Address,
        abi: VAULT_ABI,
        functionName: 'systemMode',
      },
      {
        address: ADDR.FundVaultV01 as Address,
        abi: VAULT_ABI,
        functionName: 'pricePerShare',
      },
    ],
  })

  const userShares   = (reads?.[0]?.result as bigint) ?? 0n
  const totalAssets  = (reads?.[1]?.result as bigint) ?? 0n
  const systemModeNum = reads?.[2]?.result !== undefined ? Number(reads[2].result) : undefined
  const pricePerShare = (reads?.[3]?.result as bigint) ?? 0n

  // Locked shares
  const { data: lockIdsRaw } = useReadContract({
    address: ADDR.LockLedgerV02 as Address,
    abi: LEDGER_ABI,
    functionName: 'userLockIds',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: isConnected && !!address },
  })
  const lockIds = (lockIdsRaw as bigint[] | undefined) ?? []

  const { data: lockReads } = useReadContracts({
    contracts: lockIds.map(id => ({
      address: ADDR.LockLedgerV02 as Address,
      abi: LEDGER_ABI,
      functionName: 'getLock',
      args: [id],
    })),
    query: { enabled: lockIds.length > 0 },
  })

  const lockedShares: bigint = (lockReads ?? []).reduce((sum, r) => {
    const lock = r.result as { shares: bigint; unlocked: boolean; earlyExited: boolean } | undefined
    if (!lock || lock.unlocked || lock.earlyExited) return sum
    return sum + lock.shares
  }, 0n)

  const totalShares = userShares + lockedShares

  // Convert to USDC
  const { data: holdingsRaw } = useReadContract({
    address: ADDR.FundVaultV01 as Address,
    abi: VAULT_ABI,
    functionName: 'convertToAssets',
    args: [totalShares > 0n ? totalShares : 1000000000000n],
    query: { enabled: true },
  })

  // Aave APR
  const { data: aaveReserveData } = useReadContract({
    address: AAVE_V3_POOL_BASE as Address,
    abi: AAVE_POOL_ABI,
    functionName: 'getReserveData',
    args: [ADDR.USDC as Address],
  })

  // Derived values
  const holdingsUSDC  = isConnected && totalShares > 0n
    ? ((holdingsRaw as bigint | undefined) ?? 0n)
    : 0n
  const holdingsFloat = Number(formatUnits(holdingsUSDC, 6))

  const aprDecimal = (() => {
    if (!aaveReserveData) return 0
    const rate = (aaveReserveData as { currentLiquidityRate: bigint }).currentLiquidityRate
    return rate ? Number(rate) / 1e27 : 0
  })()

  // PPS for activity amount conversion (approx = holdingsUSDC / totalShares)
  const pps = totalShares > 0n
    ? Number(formatUnits(holdingsUSDC, 6)) / Number(formatUnits(totalShares, 18))
    : 1.0

  const plToday = holdingsFloat * aprDecimal * (1 / 365)
  const plWeek  = holdingsFloat * aprDecimal * (7 / 365)
  const plMonth = holdingsFloat * aprDecimal * (30 / 365)
  const plValue = period === 'today' ? plToday : period === 'week' ? plWeek : plMonth

  const plLabel = period === 'today'
    ? 'Estimated P/L Today'
    : period === 'week'
    ? 'Estimated P/L This Week'
    : 'Estimated P/L This Month'

  // ── Recent activity (Transfer events) ─────────────────────────────────────
  const fetchActivity = useCallback(async () => {
    if (!isConnected || !address || !publicClient) return
    setActivityLoading(true)
    try {
      const latest = await publicClient.getBlockNumber()
      const from   = latest > 100_000n ? latest - 100_000n : 0n
      const padded = ('0x000000000000000000000000' + address.slice(2).toLowerCase()) as `0x${string}`
      const ZERO   = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
      const TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as `0x${string}`

      const [deposits, redeems] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicClient.getLogs({ address: ADDR.FundVaultV01 as Address, topics: [TRANSFER_SIG, ZERO, padded],   fromBlock: from, toBlock: 'latest' } as any),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicClient.getLogs({ address: ADDR.FundVaultV01 as Address, topics: [TRANSFER_SIG, padded, ZERO],   fromBlock: from, toBlock: 'latest' } as any),
      ])

      const raw: ActivityItem[] = [
        ...deposits.map(l => ({
          type: 'Deposit' as const,
          shares: BigInt(l.data),
          txHash: l.transactionHash ?? '',
          blockNumber: l.blockNumber ?? 0n,
          timestamp: null,
        })),
        ...redeems.map(l => ({
          type: 'Redeem' as const,
          shares: BigInt(l.data),
          txHash: l.transactionHash ?? '',
          blockNumber: l.blockNumber ?? 0n,
          timestamp: null,
        })),
      ].sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1)).slice(0, 5)

      // Fetch block timestamps
      const blocks = await Promise.all(
        raw.map(item => publicClient.getBlock({ blockNumber: item.blockNumber }).catch(() => null))
      )
      const withTs = raw.map((item, i) => ({
        ...item,
        timestamp: blocks[i] ? Number(blocks[i]!.timestamp) : null,
      }))

      setActivity(withTs)
    } catch {
      setActivity([])
    } finally {
      setActivityLoading(false)
    }
  }, [isConnected, address, publicClient])

  useEffect(() => { fetchActivity() }, [fetchActivity])

  // ── Layout: shared hero content ───────────────────────────────────────────
  const heroContent = (
    <div className="relative z-10 text-center space-y-5 w-full">
      <span
        className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-60 text-white block"
      >
        Your Fund Value
      </span>
      <h1
        className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white"
        style={{ fontFamily: "'Noto Serif', serif" }}
      >
        {isConnected
          ? holdingsFloat > 0
            ? `$${fmtUSD(holdingsFloat)}`
            : '$—'
          : '$—'}
      </h1>
      <div className="flex items-center justify-center gap-2 text-white/80 text-sm font-medium">
        <span className="text-white/60 text-xs">{plLabel}</span>
        <span className="text-[#e0c29f] font-semibold">
          {isConnected && plValue > 0 ? `+$${fmtUSD(plValue)}` : '—'}
        </span>
        {/* Tooltip */}
        <div className="relative group cursor-help">
          <span className="material-symbols-outlined text-sm text-white/40 hover:text-white/70 transition-colors">
            info
          </span>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 text-left">
            <div className="bg-[#1b1c1a]/90 backdrop-blur-sm text-white text-[10px] leading-relaxed rounded-lg px-3 py-2">
              Based on PPS change and current holdings. May differ from realized results when balance changes during the selected period.
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Mobile layout ──────────────────────────────────────────────────────────
  const mobileLayout = (
    <div className="md:hidden min-h-screen bg-[#fbf9f5] pb-24" style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* Top bar */}
      <header className="fixed top-0 w-full z-50 bg-[#fbf9f5]/80 backdrop-blur-xl">
        <div className="flex justify-between items-center px-5 py-4 max-w-screen-md mx-auto">
          <NetworkBadge />
          <WalletBtn isConnected={isConnected} address={address} />
        </div>
      </header>

      <main className="pt-20 px-5 max-w-screen-sm mx-auto space-y-5">
        {/* Hero card */}
        <section
          className="relative rounded-xl overflow-hidden p-7 flex flex-col items-center"
          style={{ background: 'linear-gradient(145deg, #18281e, #2d3e33)' }}
        >
          {/* Ring motif */}
          <div
            className="absolute inset-0 pointer-events-none opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle at center, transparent 30%, rgba(255,255,255,0.05) 31%, transparent 32%, rgba(255,255,255,0.04) 60%, transparent 61%)',
              backgroundSize: '200% 200%',
              backgroundPosition: 'center',
            }}
          />
          {heroContent}
        </section>

        {/* Action buttons */}
        <section className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/portfolio/positions')}
            className="flex items-center justify-center gap-2 py-4 rounded-lg text-sm font-bold text-white hover:opacity-90 active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg, #18281e, #2d3e33)' }}
          >
            <span className="material-symbols-outlined text-lg">add_circle</span>
            Deposit
          </button>
          <button
            onClick={() => navigate('/portfolio/positions')}
            className="flex items-center justify-center gap-2 py-4 rounded-lg text-sm font-bold text-[#18281e] bg-[#f5f3ef] hover:bg-[#eae8e4] active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-lg">remove_circle</span>
            Redeem
          </button>
        </section>

        {/* Recent Activity */}
        <section className="space-y-3">
          <div className="flex justify-between items-end pb-2 border-b border-[#c3c8c2]/15">
            <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#434844]">
              Recent Activity
            </h2>
            <button
              onClick={() => navigate('/portfolio/activity')}
              className="text-[10px] font-bold uppercase text-[#715a3e] hover:underline"
            >
              View All
            </button>
          </div>

          {!isConnected ? (
            <p className="text-sm text-[#434844]/60 py-4 text-center">
              Connect your wallet to view activity.
            </p>
          ) : activityLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-[#434844]/50 text-xs">
              <span className="w-4 h-4 rounded-full border-2 border-[#715a3e]/40 border-t-[#715a3e] animate-spin" />
              Loading…
            </div>
          ) : activity.length === 0 ? (
            <p className="text-sm text-[#434844]/60 py-4 text-center">No recent activity found.</p>
          ) : (
            <div className="space-y-2">
              {activity.map((item, i) => (
                <ActivityRow key={i} item={item} pps={pps} />
              ))}
            </div>
          )}
        </section>

        {/* Security Notice */}
        <SecurityNoticeCard />

        {/* Quote */}
        <footer className="pt-8 pb-4 border-t border-[#c3c8c2]/15">
          <p
            className="text-xs leading-relaxed text-[#434844]/50 italic text-center max-w-[260px] mx-auto"
            style={{ fontFamily: "'Noto Serif', serif" }}
          >
            "True wealth is measured not by the velocity of capital, but by the strength of its stewardship over time."
          </p>
        </footer>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center px-6 py-3 bg-[#fbf9f5]/80 backdrop-blur-xl border-t border-[#c3c8c2]/15 z-50">
        {[
          { icon: 'home',        label: 'Home',       path: '/'           },
          { icon: 'cases',       label: 'Portfolio',  path: '/portfolio'  },
          { icon: 'how_to_vote', label: 'Governance', path: '/governance' },
          { icon: 'settings',    label: 'Settings',   path: '/settings'   },
        ].map(({ icon, label, path }) => {
          const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center p-2.5 rounded-xl transition-all ${
                active ? 'bg-[#2d3e33] text-white scale-95' : 'text-[#434844] hover:bg-[#f5f3ef]'
              }`}
            >
              <span className="material-symbols-outlined text-xl"
                style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                {icon}
              </span>
              <span className="text-[9px] mt-0.5 font-semibold">{label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )

  // ── Desktop layout ─────────────────────────────────────────────────────────
  const desktopLayout = (
    <div className="hidden md:block min-h-screen bg-[#fbf9f5]" style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* Top nav */}
      <nav className="fixed top-0 w-full z-50 bg-[#fbf9f5]/80 backdrop-blur-xl">
        <div className="flex justify-between items-center px-8 py-4 max-w-full">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2.5">
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
                    className={`text-sm font-medium tracking-tight transition-colors ${
                      active
                        ? 'text-[#18281e] border-b-2 border-[#715a3e] pb-0.5'
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
          <div className="flex items-center gap-4">
            <NetworkBadge />
            <WalletBtn isConnected={isConnected} address={address} />
          </div>
        </div>
      </nav>

      <main className="pt-20">
        {/* Hero — 2-column structured panel */}
        <section className="px-8 mt-6">
          <div className="grid grid-cols-2 gap-0 rounded-xl overflow-hidden" style={{ border: '1px solid #e8e8e2' }}>
            {/* Left: portfolio summary */}
            <div
              className="relative p-8 flex flex-col justify-between"
              style={{ background: 'linear-gradient(145deg, #18281e 0%, #2d3e33 100%)' }}
            >
              {/* Ring motif */}
              <div className="absolute inset-0 pointer-events-none opacity-10"
                style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, transparent 30%, rgba(113,90,62,0.15) 31%, transparent 32%)', backgroundSize: '600px 600px', backgroundRepeat: 'no-repeat', backgroundPosition: '80% center' }} />
              <div className="relative z-10 space-y-5">
                <div>
                  <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/50 block mb-1">
                    Your Fund Value
                  </span>
                  <div className="text-5xl font-bold text-white" style={{ fontFamily: "'Noto Serif', serif" }}>
                    {isConnected && holdingsFloat > 0 ? `$${fmtUSD(holdingsFloat)}` : '$—'}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-white/50">{plLabel}</span>
                    <span className="text-xs font-semibold" style={{ color: '#e0c29f' }}>
                      {isConnected && plValue > 0 ? `+$${fmtUSD(plValue)}` : '—'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Available', value: isConnected ? `$${fmtUSD(Number(formatUnits(userShares, 18)) * (pps || 1))}` : '—', icon: 'account_balance_wallet' },
                    { label: 'Locked',    value: isConnected ? `$${fmtUSD(Number(formatUnits(lockedShares, 18)) * (pps || 1))}` : '—', icon: 'lock' },
                  ].map(({ label, value, icon }) => (
                    <div key={label} className="px-3 py-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="material-symbols-outlined text-xs text-white/40">{icon}</span>
                        <span className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">{label}</span>
                      </div>
                      <span className="text-sm font-bold text-white" style={{ fontFamily: "'Noto Serif', serif" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative z-10 flex gap-3 mt-6">
                <button
                  onClick={() => navigate('/portfolio/positions')}
                  className="flex-1 flex items-center justify-center gap-2 bg-white text-[#18281e] py-3 rounded-lg font-bold text-sm hover:bg-[#f5f3ef] transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">add_circle</span>
                  Deposit
                </button>
                <button
                  onClick={() => navigate('/portfolio/positions')}
                  className="flex-1 flex items-center justify-center gap-2 border border-white/20 text-white py-3 rounded-lg font-bold text-sm hover:bg-white/10 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">remove_circle</span>
                  Redeem
                </button>
              </div>
            </div>

            {/* Right: protocol state */}
            <div className="p-8 flex flex-col justify-between" style={{ background: '#f9f9f6' }}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/40">Protocol State</span>
                  {(() => {
                    const mode = systemModeNum
                    if (mode === undefined) return <span className="text-[10px] text-[#434844]/30">—</span>
                    const cfg: Record<number, { label: string; dot: string; bg: string; text: string }> = {
                      0: { label: 'Normal',         dot: '#18281e',  bg: '#18281e14', text: '#18281e' },
                      1: { label: 'Paused',         dot: '#d97706',  bg: '#fef3c7',  text: '#92400e' },
                      2: { label: 'Emergency Exit', dot: '#dc2626',  bg: '#fef2f2',  text: '#dc2626' },
                    }
                    const c = cfg[mode] ?? cfg[0]
                    return (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                        style={{ background: c.bg, color: c.text }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
                        {c.label}
                      </span>
                    )
                  })()}
                </div>
                <div style={{ height: '1px', background: '#e8e8e2' }} />
                <div className="space-y-2.5">
                  {[
                    { label: 'Strategy',   value: 'Aave V3 · USDC' },
                    { label: 'Network',    value: 'Base Mainnet' },
                    { label: 'PPS',        value: pricePerShare > 0n ? Number(formatUnits(pricePerShare, 6)).toFixed(6) : '—' },
                    { label: 'APR (est.)', value: aprDecimal > 0 ? `${(aprDecimal * 100).toFixed(2)}%` : '—' },
                    { label: 'Protocol TVL', value: totalAssets > 0n ? `$${fmtUSD(Number(formatUnits(totalAssets, 6)))}` : '—' },
                    { label: 'Governance', value: '24h Timelock' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between text-xs">
                      <span className="text-[#434844]/50">{label}</span>
                      <span className="font-semibold text-[#1b1c1a]">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-4 flex items-center gap-3 flex-wrap" style={{ borderTop: '1px solid #e8e8e2' }}>
                <a href={`https://basescan.org/address/${ADDR.FundVaultV01}`}
                  target="_blank" rel="noopener"
                  className="text-[10px] font-bold text-[#715a3e] hover:underline flex items-center gap-0.5">
                  BaseScan ↗
                </a>
                <span className="text-[#e8e8e2]">·</span>
                <button
                  onClick={() => navigate('/settings')}
                  className="text-[10px] font-bold text-[#715a3e] hover:underline"
                >
                  Contracts
                </button>
                <span className="text-[#e8e8e2]">·</span>
                <button
                  onClick={() => navigate('/portfolio/positions')}
                  className="text-[10px] font-bold text-[#715a3e] hover:underline"
                >
                  Exit path →
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Protocol status strip */}
        <section className="px-8 mt-4">
          <div className="flex items-center gap-5 flex-wrap px-5 py-3 rounded-xl"
            style={{ background: '#f5f5f0', border: '1px solid #e8e8e2' }}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-[#434844]/35 flex-shrink-0">
              Protocol
            </span>
            <div className="w-px h-3.5 bg-[#e8e8e2] flex-shrink-0" />
            {([
              { label: 'Strategy',     value: 'Aave V3'       },
              { label: 'Network',      value: 'Base'          },
              { label: 'Custody',      value: 'Non-custodial' },
              { label: 'Governance',   value: '24h Timelock', dot: '#18281e' },
              { label: 'APR (est.)',   value: aprDecimal > 0 ? `${(aprDecimal * 100).toFixed(2)}%` : '—' },
              { label: 'Protocol TVL', value: totalAssets > 0n ? `$${fmtUSD(Number(formatUnits(totalAssets, 6)))}` : '—' },
            ] as { label: string; value: string; dot?: string }[]).map(({ label, value, dot }) => (
              <div key={label} className="flex items-center gap-1.5 flex-shrink-0">
                {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />}
                <span className="text-[10px] text-[#434844]/50 font-semibold">{label}:</span>
                <span className="text-[10px] font-bold text-[#1b1c1a]">{value}</span>
              </div>
            ))}
            <div className="ml-auto flex-shrink-0 flex items-center gap-3">
              <a href="https://basescan.org/address/0x9dD61ee543a9C51aBe7B26A89687C9aEeea98a54"
                target="_blank" rel="noopener"
                className="text-[9px] font-bold text-[#715a3e] hover:underline">
                Verify on BaseScan ↗
              </a>
            </div>
          </div>
        </section>

        {/* Main content grid */}
        <section className="max-w-7xl mx-auto px-8 py-16">
          <div className="grid grid-cols-12 gap-10">
            {/* Left sidebar: Holdings summary */}
            <div className="col-span-12 lg:col-span-4 space-y-8">
              <div>
                <h2
                  className="text-2xl font-bold mb-5 text-[#1b1c1a]"
                  style={{ fontFamily: "'Noto Serif', serif" }}
                >
                  Your Holdings
                </h2>
                <div className="space-y-3">
                  {[
                    {
                      icon: 'account_balance_wallet',
                      label: 'Available',
                      sub: 'Liquid fbUSDC',
                      value: isConnected
                        ? `$${fmtUSD(Number(formatUnits(
                            (reads?.[0]?.result as bigint) ?? 0n, 18
                          )) * (pps || 1))}`
                        : '—',
                      color: '#18281e',
                    },
                    {
                      icon: 'lock',
                      label: 'Locked',
                      sub: 'In lock positions',
                      value: isConnected
                        ? `$${fmtUSD(Number(formatUnits(lockedShares, 18)) * (pps || 1))}`
                        : '—',
                      color: '#715a3e',
                    },
                  ].map(({ icon, label, sub, value, color }) => (
                    <div
                      key={label}
                      className="p-5 rounded-xl bg-[#f5f3ef] flex justify-between items-center"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white"
                          style={{ background: color }}
                        >
                          <span className="material-symbols-outlined text-base">{icon}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#1b1c1a]">{label}</p>
                          <p className="text-xs text-[#434844]">{sub}</p>
                        </div>
                      </div>
                      <span
                        className="font-bold text-[#1b1c1a]"
                        style={{ fontFamily: "'Noto Serif', serif" }}
                      >
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* TVL card */}
              <div
                className="p-7 rounded-xl relative overflow-hidden text-white"
                style={{ background: 'linear-gradient(145deg, #18281e, #2d3e33)' }}
              >
                <p
                  className="text-[#96a99b] text-sm mb-1"
                  style={{ fontFamily: "'Noto Serif', serif" }}
                >
                  Protocol TVL
                </p>
                <h3 className="text-3xl font-bold mb-3">
                  {totalAssets > 0n
                    ? `$${fmtUSD(Number(formatUnits(totalAssets, 6)))}`
                    : '—'}
                </h3>
                <p className="text-xs text-[#96a99b] leading-relaxed">
                  Total assets under management across all participants.
                </p>
              </div>


              {/* Security entry card */}
              <div className="rounded-xl p-5" style={{ border: '1px solid #e8e8e2', background: '#fff' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#434844]/40 mb-3">
                  Security status
                </p>
                <div className="space-y-2 mb-4">
                  {([
                    { label: 'Timelock',       value: '24h delay · active',    ok: true  },
                    { label: 'Emergency exit', value: 'Always available',       ok: true  },
                    { label: 'Source code',    value: 'Open source · GitHub',   ok: true  },
                    { label: 'Audit',          value: 'In preparation',         ok: false },
                  ] as { label: string; value: string; ok: boolean }[]).map(({ label, value, ok }) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: ok ? '#18281e' : '#715a3e' }} />
                        <span className="text-[10px] text-[#434844]/60">{label}</span>
                      </div>
                      <span className="text-[10px] font-semibold text-[#1b1c1a] text-right">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 pt-3" style={{ borderTop: '1px solid #f0f0ec' }}>
                  <a href="https://basescan.org/address/0x9dD61ee543a9C51aBe7B26A89687C9aEeea98a54"
                    target="_blank" rel="noopener"
                    className="text-[10px] font-bold text-[#715a3e] hover:underline">
                    BaseScan ↗
                  </a>
                  <span className="text-[#e8e8e2]">·</span>
                  <a href="https://github.com/yearring-fund/YearRing-FundProtocol"
                    target="_blank" rel="noopener"
                    className="text-[10px] font-bold text-[#715a3e] hover:underline">
                    Protocol ↗
                  </a>
                  <span className="text-[#e8e8e2]">·</span>
                  <a href="https://yearringfund.com/#security"
                    target="_blank" rel="noopener"
                    className="text-[10px] font-bold text-[#715a3e] hover:underline">
                    Trust ↗
                  </a>
                </div>
              </div>
            </div>

            {/* Right: Activity table */}
            <div className="col-span-12 lg:col-span-8">
              <div className="flex justify-between items-end mb-7">
                <div>
                  <h2
                    className="text-3xl font-bold text-[#1b1c1a]"
                    style={{ fontFamily: "'Noto Serif', serif" }}
                  >
                    Recent Activity
                  </h2>
                  <p className="text-[#434844] mt-1 text-sm">
                    Stewardship history and settlement data
                  </p>
                </div>
                <button
                  onClick={() => navigate('/portfolio/activity')}
                  className="text-[#715a3e] font-bold text-sm flex items-center gap-1 hover:underline"
                >
                  View all
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </button>
              </div>

              <div className="bg-[#f5f3ef] rounded-xl overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-4 px-8 py-4 border-b border-[#c3c8c2]/15 text-xs font-bold uppercase tracking-widest text-[#434844]">
                  <span>Action</span>
                  <span>Amount</span>
                  <span>Date</span>
                  <span className="text-right">Status</span>
                </div>

                {!isConnected ? (
                  <div className="px-8 py-12 text-center text-sm text-[#434844]/60">
                    Connect your wallet to view activity.
                  </div>
                ) : activityLoading ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-[#434844]/50 text-xs">
                    <span className="w-4 h-4 rounded-full border-2 border-[#715a3e]/40 border-t-[#715a3e] animate-spin" />
                    Loading activity…
                  </div>
                ) : activity.length === 0 ? (
                  <div className="px-8 py-12 text-center text-sm text-[#434844]/60">
                    No recent activity found.
                  </div>
                ) : (
                  <div className="divide-y divide-[#c3c8c2]/10">
                    {activity.map((item, i) => (
                      <ActivityTableRow key={i} item={item} pps={pps} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Quote */}
        <section className="max-w-4xl mx-auto px-8 py-20 text-center">
          <div className="w-10 h-px bg-[#715a3e]/30 mx-auto mb-10" />
          <p
            className="text-2xl italic text-[#1b1c1a] leading-relaxed tracking-wide"
            style={{ fontFamily: "'Noto Serif', serif" }}
          >
            "True wealth is measured not by the velocity of capital,<br />
            but by the strength of its stewardship over time."
          </p>
          <div className="w-10 h-px bg-[#715a3e]/30 mx-auto mt-10" />
        </section>

        {/* Security Notice */}
        <section className="max-w-7xl mx-auto px-8 pb-10">
          <SecurityNoticeCard />
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#f5f3ef] py-10">
        <div className="flex flex-col md:flex-row justify-between items-center px-12 max-w-7xl mx-auto gap-4">
          <p className="text-xs uppercase tracking-widest text-[#434844]">
            © 2024 YearRing Fund. All rights reserved.
          </p>
          <div className="flex gap-6">
            {['Privacy', 'Terms', 'Security'].map(l => (
              <button key={l} className="text-xs text-[#434844] hover:text-[#18281e] transition-colors">
                {l}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )

  return (
    <>
      {mobileLayout}
      {desktopLayout}
    </>
  )
}
