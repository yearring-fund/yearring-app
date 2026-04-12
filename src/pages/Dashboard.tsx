import { useAccount, useReadContracts, useReadContract } from 'wagmi'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { type Address } from 'viem'
import { ADDR, VAULT_ABI, STRAT_MGR_ABI, USDC_ABI, AAVE_POOL_ABI, AAVE_V3_POOL_BASE } from '../lib/contracts'
import { formatUSDC, formatShares, formatPPS, bpsToPercent } from '../lib/format'

// ── PPS sparkline helpers ─────────────────────────────────────────────────────
const PPS_STORAGE_KEY = 'yearring_pps_history'
const MAX_PPS_POINTS  = 30

type PpsPoint = { t: number; v: number } // timestamp + PPS value in USDC (float)

function loadPpsHistory(): PpsPoint[] {
  try {
    return JSON.parse(localStorage.getItem(PPS_STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function savePpsHistory(pts: PpsPoint[]) {
  localStorage.setItem(PPS_STORAGE_KEY, JSON.stringify(pts.slice(-MAX_PPS_POINTS)))
}

function Sparkline({ points }: { points: PpsPoint[] }) {
  if (points.length < 2) return (
    <div className="text-xs text-slate-400 italic">Accumulating data…</div>
  )
  const W = 160, H = 40
  const values = points.map(p => p.v)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const xs = points.map((_, i) => (i / (points.length - 1)) * W)
  const ys = points.map(p => H - ((p.v - min) / range) * (H - 4) - 2)
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const rising = values[values.length - 1] >= values[0]
  const color = rising ? '#22c55e' : '#f59e0b'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="2.5" fill={color} />
    </svg>
  )
}

// ── System mode config ────────────────────────────────────────────────────────
const SYSTEM_MODE_LABEL: Record<number, string> = {
  0: 'Normal',
  1: 'Paused',
  2: 'Emergency Exit',
}

const SYSTEM_MODE_STYLE: Record<number, { badge: string; card: string }> = {
  0: {
    badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    card:  'bg-[#3755c3]',
  },
  1: {
    badge: 'bg-amber-100 text-amber-700 border border-amber-200',
    card:  'bg-amber-500',
  },
  2: {
    badge: 'bg-red-100 text-red-700 border border-red-200',
    card:  'bg-red-600',
  },
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { address, isConnected } = useAccount()
  const [ppsHistory, setPpsHistory] = useState<PpsPoint[]>(loadPpsHistory)

  // ── Contract reads ──────────────────────────────────────────────────────────
  const { data, isLoading } = useReadContracts({
    contracts: [
      // 0 — totalAssets
      {
        address: ADDR.FundVaultV01,
        abi: VAULT_ABI,
        functionName: 'totalAssets',
      },
      // 1 — pricePerShare
      {
        address: ADDR.FundVaultV01,
        abi: VAULT_ABI,
        functionName: 'pricePerShare',
      },
      // 2 — systemMode
      {
        address: ADDR.FundVaultV01,
        abi: VAULT_ABI,
        functionName: 'systemMode',
      },
      // 3 — mgmtFeeBpsPerMonth
      {
        address: ADDR.FundVaultV01,
        abi: VAULT_ABI,
        functionName: 'mgmtFeeBpsPerMonth',
      },
      // 4 — reserveRatioBps
      {
        address: ADDR.FundVaultV01,
        abi: VAULT_ABI,
        functionName: 'reserveRatioBps',
      },
      // 5 — totalManagedAssets (StrategyManager)
      {
        address: ADDR.StrategyManagerV01,
        abi: STRAT_MGR_ABI,
        functionName: 'totalManagedAssets',
      },
      // 6 — user fbUSDC balance
      {
        address: ADDR.FundVaultV01,
        abi: VAULT_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
      },
      // 7 — user USDC balance
      {
        address: ADDR.USDC,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
      },
    ],
  })

  // ── Extract raw values ──────────────────────────────────────────────────────
  const totalAssets     = data?.[0]?.result as bigint | undefined
  const pricePerShare   = data?.[1]?.result as bigint | undefined
  const systemModeRaw   = data?.[2]?.result as number | undefined
  const mgmtFeeBps      = data?.[3]?.result as bigint | undefined
  const reserveRatioBps = data?.[4]?.result as bigint | undefined
  const totalManaged    = data?.[5]?.result as bigint | undefined
  const userShares      = data?.[6]?.result as bigint | undefined
  const userUSDC        = data?.[7]?.result as bigint | undefined

  // ── Read convertToAssets with the actual user share balance ─────────────────
  const { data: convertData } = useReadContracts({
    contracts: [
      {
        address: ADDR.FundVaultV01,
        abi: VAULT_ABI,
        functionName: 'convertToAssets',
        args: userShares !== undefined ? [userShares] : [0n],
      },
    ],
    query: { enabled: userShares !== undefined },
  })

  const userSharesInUSDC = convertData?.[0]?.result as bigint | undefined

  // ── Aave V3 supply APY ──────────────────────────────────────────────────────
  const { data: aaveReserveData } = useReadContract({
    address: AAVE_V3_POOL_BASE as Address,
    abi: AAVE_POOL_ABI,
    functionName: 'getReserveData',
    args: [ADDR.USDC as Address],
  })

  const aaveApyPct: string | undefined = (() => {
    if (!aaveReserveData) return undefined
    const rate = (aaveReserveData as { currentLiquidityRate: bigint }).currentLiquidityRate
    if (!rate) return undefined
    return ((Number(rate) / 1e27) * 100).toFixed(2)
  })()

  // ── PPS history accumulation ─────────────────────────────────────────────────
  useEffect(() => {
    if (pricePerShare === undefined) return
    const ppsFloat = Number(pricePerShare) / 1e6
    const now = Date.now()
    const hist = loadPpsHistory()
    // Only record if at least 1 hour has passed since last point (or no points)
    const last = hist[hist.length - 1]
    if (last && now - last.t < 60 * 60 * 1000) return
    const updated = [...hist, { t: now, v: ppsFloat }]
    savePpsHistory(updated)
    setPpsHistory(updated.slice(-MAX_PPS_POINTS))
  }, [pricePerShare])

  // ── Derived metrics ─────────────────────────────────────────────────────────
  const systemMode = systemModeRaw !== undefined ? Number(systemModeRaw) : undefined

  let reservePct     = '--'
  let deployedPct    = 0
  let deployedPctStr = '--'

  if (totalAssets !== undefined && totalAssets > 0n && totalManaged !== undefined) {
    const free = totalAssets - totalManaged
    const rPct = (Number(free) / Number(totalAssets)) * 100
    const dPct = (Number(totalManaged) / Number(totalAssets)) * 100
    reservePct     = rPct.toFixed(1) + '%'
    deployedPct    = Math.min(dPct, 100)
    deployedPctStr = dPct.toFixed(1) + '%'
  }

  const modeStyle = SYSTEM_MODE_STYLE[systemMode ?? 0]
  const modeLabel = systemMode !== undefined ? SYSTEM_MODE_LABEL[systemMode] : '--'

  // ── Helper ───────────────────────────────────────────────────────────────────
  const fmt = (v: bigint | undefined, fn: (x: bigint) => string) =>
    v !== undefined ? fn(v) : '--'

  return (
    <div className="min-h-screen bg-[#f4f6fb] font-[Manrope,sans-serif] text-[#1a1f36]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#1a1f36]">
              YearRing Fund Protocol
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              On-chain fund management on Base
            </p>
          </div>
          {isConnected && address && (
            <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-100 rounded-full px-4 py-1.5">
              <span className="material-symbols-outlined text-base text-[#3755c3]">
                account_circle
              </span>
              <span className="font-mono">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* ── Section 1: Hero stats bento grid ─────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
            Protocol Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Card 1 — Total TVL */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
                <span className="material-symbols-outlined text-base">
                  account_balance
                </span>
                Total TVL
              </div>
              {isLoading ? (
                <div className="h-8 w-32 bg-slate-100 rounded-lg animate-pulse" />
              ) : (
                <p className="text-3xl font-bold text-[#1a1f36] leading-none">
                  ${fmt(totalAssets, formatUSDC)}
                </p>
              )}
              <p className="text-xs text-slate-400 mt-1.5">USDC · FundVaultV01</p>
            </div>

            {/* Card 2 — Price Per Share + sparkline */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
                <span className="material-symbols-outlined text-base">
                  show_chart
                </span>
                Price Per Share (PPS)
              </div>
              {isLoading ? (
                <div className="h-8 w-36 bg-slate-100 rounded-lg animate-pulse" />
              ) : (
                <p className="text-2xl font-bold text-[#1a1f36] leading-none font-mono">
                  ${fmt(pricePerShare, formatPPS)}
                </p>
              )}
              <p className="text-xs text-slate-400 mt-1.5 mb-2">USDC per fbUSDC</p>
              <Sparkline points={ppsHistory} />
            </div>

            {/* Card 3 — Strategy Deployed */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
                <span className="material-symbols-outlined text-base">
                  moving
                </span>
                Strategy Deployed
              </div>
              {isLoading ? (
                <div className="h-8 w-32 bg-slate-100 rounded-lg animate-pulse" />
              ) : (
                <p className="text-3xl font-bold text-[#1a1f36] leading-none">
                  ${fmt(totalManaged, formatUSDC)}
                </p>
              )}
              <p className="text-xs text-slate-400 mt-1.5">USDC · StrategyManagerV01</p>
            </div>

            {/* Card 4 — System Mode */}
            <div
              className={`rounded-2xl p-5 shadow-sm ${
                systemMode === undefined
                  ? 'bg-slate-100 border border-slate-200'
                  : modeStyle.card
              }`}
            >
              <div
                className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3 ${
                  systemMode === undefined ? 'text-slate-400' : 'text-white/70'
                }`}
              >
                <span className="material-symbols-outlined text-base">
                  shield
                </span>
                System Mode
              </div>
              {isLoading ? (
                <div className="h-8 w-24 bg-white/20 rounded-lg animate-pulse" />
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
                      systemMode === undefined
                        ? 'bg-slate-200 text-slate-500'
                        : modeStyle.badge
                    }`}
                  >
                    {modeLabel}
                  </span>
                </div>
              )}
              <p
                className={`text-xs mt-2.5 ${
                  systemMode === undefined ? 'text-slate-400' : 'text-white/60'
                }`}
              >
                {systemMode === 0
                  ? 'Deposits & redeems open'
                  : systemMode === 1
                  ? 'Operations paused'
                  : systemMode === 2
                  ? 'Emergency mode active'
                  : 'Fetching status…'}
              </p>
            </div>

          </div>
        </section>

        {/* ── Section 2: Two-column layout ─────────────────────────────────── */}
        <section className="grid grid-cols-12 gap-4">

          {/* Left col — Protocol Metrics (col-span-8) */}
          <div className="col-span-12 lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-[#3755c3]">
                monitoring
              </span>
              <h3 className="text-base font-semibold text-[#1a1f36]">
                Protocol Metrics
              </h3>
            </div>

            <div className="space-y-5">

              {/* Reserve ratio row */}
              <div>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-sm text-slate-600 font-medium">
                    Current Free Reserve Ratio
                  </span>
                  <span className="text-sm font-bold text-[#1a1f36] font-mono">
                    {isLoading ? '--' : reservePct}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-400">Strategy Deployed</span>
                  <span className="text-xs text-slate-500 font-mono">
                    {isLoading ? '--' : deployedPctStr}
                  </span>
                </div>
              </div>

              {/* Strategy allocation progress bar */}
              <div>
                <div className="text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wide">
                  Strategy Allocation
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${deployedPct}%`,
                      background: 'linear-gradient(90deg, #3755c3 0%, #6680e8 100%)',
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-slate-400">0%</span>
                  <span className="text-[10px] text-slate-400">100%</span>
                </div>
              </div>

              {/* Warning: reserveRatioBps at default 100% means strategy not configured */}
              {!isLoading && reserveRatioBps === 10000n && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  <span className="material-symbols-outlined text-amber-600 text-base">
                    warning
                  </span>
                  <p className="text-xs text-amber-700">
                    <strong>Target Reserve is 100%</strong> — strategy deployment is disabled.
                    Admin must set a lower target before investing.
                  </p>
                </div>
              )}
              {/* Target reserve range info banner */}
              {(isLoading || reserveRatioBps !== 10000n) && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
                  <span className="material-symbols-outlined text-[#3755c3] text-base">
                    info
                  </span>
                  <p className="text-xs text-blue-700">
                    Target reserve range:{' '}
                    <strong>15% – 35%</strong> of total assets kept liquid
                  </p>
                </div>
              )}

              {/* Aave APY tile */}
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
                <span className="material-symbols-outlined text-emerald-600 text-base">
                  trending_up
                </span>
                <div>
                  <p className="text-xs text-emerald-700 font-semibold">
                    Current Strategy APY (Aave V3):{' '}
                    <span className="font-bold font-mono">
                      {aaveApyPct !== undefined ? `${aaveApyPct}%` : '—'}
                    </span>
                  </p>
                  <p className="text-[10px] text-emerald-600/70 mt-0.5">USDC supply rate · live from chain</p>
                </div>
              </div>

              {/* Fee & reserve parameter tiles */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 font-semibold">
                    Mgmt Fee
                  </p>
                  <p className="text-lg font-bold text-[#1a1f36] font-mono">
                    {isLoading
                      ? '--'
                      : mgmtFeeBps !== undefined
                      ? `${mgmtFeeBps.toString()} bps/mo`
                      : '--'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {!isLoading && mgmtFeeBps !== undefined
                      ? `≈ ${(Number(mgmtFeeBps) / 100).toFixed(2)}% / month`
                      : ''}
                  </p>
                </div>

                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 font-semibold">
                    Target Reserve
                  </p>
                  <p className="text-lg font-bold text-[#1a1f36] font-mono">
                    {isLoading
                      ? '--'
                      : reserveRatioBps !== undefined
                      ? bpsToPercent(reserveRatioBps)
                      : '--'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {!isLoading && reserveRatioBps !== undefined
                      ? `${reserveRatioBps.toString()} bps`
                      : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right col — Your Position (col-span-4) */}
          <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-[#3755c3]">
                wallet
              </span>
              <h3 className="text-base font-semibold text-[#1a1f36]">
                Your Position
              </h3>
            </div>

            {!isConnected ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                <span className="material-symbols-outlined text-4xl text-slate-300 mb-3">
                  link_off
                </span>
                <p className="text-sm text-slate-400 leading-snug">
                  Connect your wallet to
                  <br />
                  view your position
                </p>
              </div>
            ) : (
              <div className="flex-1 space-y-4">

                {/* fbUSDC balance */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                    fbUSDC Balance
                  </p>
                  <p className="text-xl font-bold text-[#1a1f36] font-mono">
                    {isLoading
                      ? '--'
                      : userShares !== undefined
                      ? formatShares(userShares)
                      : '--'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">fund shares</p>
                </div>

                {/* USDC value of shares */}
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-xs text-blue-500 uppercase tracking-wider mb-1 font-semibold">
                    Value in USDC
                  </p>
                  <p className="text-xl font-bold text-[#3755c3] font-mono">
                    $
                    {userSharesInUSDC !== undefined
                      ? formatUSDC(userSharesInUSDC)
                      : userShares !== undefined && userShares === 0n
                      ? '0.00'
                      : '--'}
                  </p>
                  <p className="text-xs text-blue-400 mt-0.5">at current PPS</p>
                </div>

                {/* USDC wallet balance */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                    USDC in Wallet
                  </p>
                  <p className="text-xl font-bold text-[#1a1f36] font-mono">
                    $
                    {isLoading
                      ? '--'
                      : userUSDC !== undefined
                      ? formatUSDC(userUSDC)
                      : '--'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">available to deposit</p>
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Link
                    to="/vault"
                    className="flex items-center justify-center gap-1.5 bg-[#3755c3] hover:bg-[#2d47aa] text-white text-sm font-semibold rounded-xl py-2.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">
                      add_circle
                    </span>
                    Deposit
                  </Link>
                  <Link
                    to="/vault"
                    className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-[#3755c3] border border-[#3755c3] text-sm font-semibold rounded-xl py-2.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">
                      remove_circle
                    </span>
                    Redeem
                  </Link>
                </div>
              </div>
            )}
          </div>

        </section>
      </main>
    </div>
  )
}
