import { useState, useEffect } from 'react'
import {
  useAccount,
  useReadContracts,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import {
  ADDR, VAULT_ABI, USDC_ABI, AAVE_POOL_ABI, AAVE_V3_POOL_BASE, LEDGER_ABI, STRAT_MGR_ABI,
} from '../../lib/contracts'
import { parseTxError, parseReadError } from '../../lib/txError'
import { Sk } from '../../components/ui/Skeleton'

// ── PPS Sparkline ──────────────────────────────────────────────────────────
const PPS_KEY = 'yearring_pps_history'
const MAX_PTS = 30
type PpsPoint = { t: number; v: number }
function loadPps(): PpsPoint[] {
  try { return JSON.parse(localStorage.getItem(PPS_KEY) ?? '[]') } catch { return [] }
}
function savePps(pts: PpsPoint[]) {
  localStorage.setItem(PPS_KEY, JSON.stringify(pts.slice(-MAX_PTS)))
}
function Sparkline({ points }: { points: PpsPoint[] }) {
  if (points.length < 2) return (
    <span className="text-[11px] text-white/30 italic">Accumulating…</span>
  )
  const W = 120, H = 32
  const vals = points.map(p => p.v)
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 0.000001
  const xs = points.map((_, i) => (i / (points.length - 1)) * W)
  const ys = points.map(p => H - ((p.v - min) / range) * (H - 4) - 2)
  const d  = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const rising = vals[vals.length - 1] >= vals[0]
  const color  = rising ? '#4ade80' : '#fbbf24'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="2.5" fill={color} />
    </svg>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtUSDC(n: bigint)  { return Number(formatUnits(n, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtShares(n: bigint){ return Number(formatUnits(n, 18)).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) }
function fmtPPS(n: bigint)   { return Number(formatUnits(n, 6)).toFixed(6) }

function safeParse(val: string, decimals: number): bigint {
  try { return val && Number(val) > 0 ? parseUnits(val, decimals) : 0n }
  catch { return 0n }
}

// ── Step indicator ─────────────────────────────────────────────────────────
function StepDots({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-1 text-[10px]">
      {steps.map((label, i) => {
        const idx = i + 1
        const done    = idx < current
        const active  = idx === current
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[#c3c8c2]">›</span>}
            <span className={`font-bold ${active ? 'text-[#18281e]' : done ? 'text-[#715a3e]' : 'text-[#434844]/30'}`}>
              {done ? '✓' : idx}
            </span>
            <span className={active ? 'text-[#434844]' : done ? 'text-[#715a3e]' : 'text-[#434844]/30'}>
              {label}
            </span>
          </span>
        )
      })}
    </div>
  )
}

// ── Mode badge ─────────────────────────────────────────────────────────────
function ModeBadge({ mode }: { mode: number | undefined }) {
  if (mode === undefined) return null
  const cfg: Record<number, { label: string; color: string; dot: string }> = {
    0: { label: 'Normal',        color: 'bg-[#18281e]/8 text-[#18281e]',    dot: 'bg-[#18281e]'  },
    1: { label: 'Paused',        color: 'bg-amber-100 text-amber-800',       dot: 'bg-amber-500'  },
    2: { label: 'Emergency Exit',color: 'bg-red-50 text-red-700',            dot: 'bg-red-500'    },
  }
  const c = cfg[mode] ?? cfg[0]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${c.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

// ── Emergency Exit Panel ───────────────────────────────────────────────────
type ExitRound = { snapshotId: bigint; snapshotTotalSupply: bigint; availableAssets: bigint; totalClaimed: bigint; isOpen: boolean }

function EmergencyExitPanel({ fbUsdcBalance }: { fbUsdcBalance: bigint }) {
  const { address } = useAccount()
  const [burnAmt, setBurnAmt] = useState('')
  const [txErr,  setTxErr]   = useState('')

  const { data: roundId, refetch: refetchRoundId } = useReadContract({
    address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
    functionName: 'currentRoundId',
    query: { refetchInterval: 10_000 },
  })
  const { data: roundData, refetch: refetchRound } = useReadContract({
    address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
    functionName: 'exitRounds', args: [roundId as bigint],
    query: { enabled: !!roundId && (roundId as bigint) > 0n },
  })
  const { data: claimed, refetch: refetchClaimed } = useReadContract({
    address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
    functionName: 'roundSharesClaimed',
    args: [roundId as bigint, address as Address],
    query: { enabled: !!roundId && (roundId as bigint) > 0n && !!address },
  })

  const { writeContractAsync, isPending } = useWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const round      = roundData as ExitRound | undefined
  const claimedAmt = (claimed as bigint | undefined) ?? 0n
  const parsedBurn = safeParse(burnAmt, 18)

  const estimatedOut = round && round.snapshotTotalSupply > 0n
    ? (parsedBurn * round.availableAssets) / round.snapshotTotalSupply
    : 0n

  const noRound   = !roundId || (roundId as bigint) === 0n
  const isClosed  = round && !round.isOpen

  const handleClaim = async () => {
    if (!roundId || parsedBurn === 0n) return
    setTxErr('')
    try {
      const hash = await writeContractAsync({
        address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
        functionName: 'claimExitAssets',
        args: [roundId as bigint, parsedBurn],
      })
      setTxHash(hash)
      setBurnAmt('')
      refetchRoundId(); refetchRound(); refetchClaimed()
    } catch (e) { setTxErr(parseTxError(e)) }
  }

  return (
    <div className="border border-red-200 rounded-xl overflow-hidden">
      <div className="bg-red-600 px-5 py-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-white text-lg">emergency</span>
        <span className="text-white font-bold text-xs tracking-widest uppercase">Emergency Exit Mode</span>
      </div>
      <div className="bg-red-50 px-5 py-4 space-y-4">
        <p className="text-sm text-red-800 leading-relaxed">
          Normal deposits and redeems are disabled. Burn your fbUSDC shares below to claim a pro-rata share of the available USDC.
        </p>
        {noRound ? (
          <p className="text-sm text-[#434844]/70 bg-white rounded-lg px-4 py-3">
            No exit round open yet. The admin must call <code className="font-mono text-xs bg-[#f5f3ef] px-1 rounded">openExitModeRound()</code> first.
          </p>
        ) : isClosed ? (
          <p className="text-sm text-[#434844]/70 bg-white rounded-lg px-4 py-3">
            Round #{(roundId as bigint).toString()} is closed. Waiting for admin to open a new round.
          </p>
        ) : round ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Round',     value: `#${(roundId as bigint).toString()}` },
                { label: 'Available', value: `$${fmtUSDC(round.availableAssets)}` },
                { label: 'Claimed',   value: `${fmtShares(claimedAmt)} fbUSDC` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-[#434844] mb-0.5">{label}</p>
                  <p className="font-bold text-[#1b1c1a] text-sm">{value}</p>
                </div>
              ))}
            </div>
            <div className="border-b-2 border-[#c3c8c2] focus-within:border-red-400 transition-colors pb-1 flex items-center gap-2 bg-white rounded-t-lg px-3 pt-2">
              <input
                type="number" min="0" placeholder="0.0000"
                value={burnAmt}
                onChange={e => setBurnAmt(e.target.value)}
                className="flex-1 bg-transparent text-lg font-semibold text-[#1b1c1a] outline-none placeholder:text-[#434844]/25"
              />
              <span className="text-[#434844] text-sm font-medium">fbUSDC</span>
              <button
                onClick={() => fbUsdcBalance > 0n && setBurnAmt(formatUnits(fbUsdcBalance, 18))}
                className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded"
              >MAX</button>
            </div>
            {parsedBurn > 0n && estimatedOut > 0n && (
              <p className="text-xs text-[#434844]">
                Estimated receive: <span className="font-semibold text-[#1b1c1a]">${fmtUSDC(estimatedOut)} USDC</span>
              </p>
            )}
            {txErr && (
              <p className="text-xs text-red-700 bg-red-100 rounded-lg px-3 py-2">{txErr}</p>
            )}
            {isSuccess && (
              <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">✓ Claimed successfully</p>
            )}
            <button
              disabled={parsedBurn === 0n || parsedBurn > fbUsdcBalance || isPending || confirming}
              onClick={handleClaim}
              className="w-full py-3 rounded-lg text-sm font-bold bg-red-600 text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {confirming ? 'Confirming…' : isPending ? 'Signing…' : 'Claim Exit Assets'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Positions() {
  const { address, isConnected } = useAccount()
  const [depositAmt, setDepositAmt] = useState('')
  const [redeemAmt,  setRedeemAmt]  = useState('')
  const [depositErr, setDepositErr] = useState('')
  const [redeemErr,  setRedeemErr]  = useState('')
  const [ppsHistory, setPpsHistory] = useState<PpsPoint[]>(loadPps)

  // ── Batch reads ──────────────────────────────────────────────────────────
  const { data: reads, isLoading: readsLoading, error: readsError, refetch: refetchReads } = useReadContracts({
    contracts: [
      { address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI, functionName: 'balanceOf',      args: [address ?? '0x0000000000000000000000000000000000000000'] },
      { address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI, functionName: 'totalAssets' },
      { address: ADDR.USDC         as Address, abi: USDC_ABI,  functionName: 'balanceOf',      args: [address ?? '0x0000000000000000000000000000000000000000'] },
      { address: ADDR.USDC         as Address, abi: USDC_ABI,  functionName: 'allowance',      args: [address ?? '0x0000000000000000000000000000000000000000', ADDR.FundVaultV01 as Address] },
      { address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI, functionName: 'depositsPaused' },
      { address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI, functionName: 'redeemsPaused' },
      { address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI, functionName: 'isAllowed',      args: [address ?? '0x0000000000000000000000000000000000000000'] },
      { address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI, functionName: 'systemMode',     query: { refetchInterval: 10_000 } } as const,
      { address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI, functionName: 'pricePerShare' },
      { address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI, functionName: 'mgmtFeeBpsPerMonth' },
    ],
  })

  const fbUsdcBalance  = (reads?.[0]?.result as bigint) ?? 0n
  const totalAssets    = (reads?.[1]?.result as bigint) ?? 0n
  const usdcBalance    = (reads?.[2]?.result as bigint) ?? 0n
  const usdcAllowance  = (reads?.[3]?.result as bigint) ?? 0n
  const depositsPaused = (reads?.[4]?.result as boolean) ?? false
  const redeemsPaused  = (reads?.[5]?.result as boolean) ?? false
  const isAllowed      = isConnected ? ((reads?.[6]?.result as boolean) ?? false) : false
  const systemModeNum  = reads?.[7]?.result !== undefined ? Number(reads[7].result) : undefined
  const pps            = (reads?.[8]?.result as bigint) ?? 0n
  const mgmtFeeBps     = (reads?.[9]?.result as bigint) ?? 0n

  // ── Locked shares ────────────────────────────────────────────────────────
  const { data: lockIdsRaw } = useReadContract({
    address: ADDR.LockLedgerV02 as Address, abi: LEDGER_ABI,
    functionName: 'userLockIds',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: isConnected && !!address },
  })
  const lockIds = (lockIdsRaw as bigint[] | undefined) ?? []

  const { data: lockReads } = useReadContracts({
    contracts: lockIds.map(id => ({
      address: ADDR.LockLedgerV02 as Address, abi: LEDGER_ABI,
      functionName: 'getLock', args: [id],
    })),
    query: { enabled: lockIds.length > 0 },
  })

  const lockedShares: bigint = (lockReads ?? []).reduce((sum, r) => {
    const lock = r.result as { shares: bigint; unlocked: boolean; earlyExited: boolean } | undefined
    if (!lock || lock.unlocked || lock.earlyExited) return sum
    return sum + lock.shares
  }, 0n)

  // ── USDC equivalents ─────────────────────────────────────────────────────
  const totalShares = fbUsdcBalance + lockedShares

  const { data: holdingsRaw } = useReadContract({
    address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
    functionName: 'convertToAssets',
    args: [totalShares > 0n ? totalShares : 1_000_000_000_000n],
  })
  const { data: lockedUSDCRaw } = useReadContract({
    address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
    functionName: 'convertToAssets',
    args: [lockedShares > 0n ? lockedShares : 1_000_000_000_000n],
  })
  const { data: freeUSDCRaw } = useReadContract({
    address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
    functionName: 'convertToAssets',
    args: [fbUsdcBalance > 0n ? fbUsdcBalance : 1_000_000_000_000n],
  })

  const holdingsUSDC  = isConnected && totalShares  > 0n ? (holdingsRaw  as bigint | undefined) ?? 0n : 0n
  const lockedUSDC    = isConnected && lockedShares > 0n ? (lockedUSDCRaw as bigint | undefined) ?? 0n : 0n
  const freeUSDC      = isConnected && fbUsdcBalance > 0n ? (freeUSDCRaw  as bigint | undefined) ?? 0n : 0n

  // ── Aave APR ─────────────────────────────────────────────────────────────
  const { data: aaveReserveData } = useReadContract({
    address: AAVE_V3_POOL_BASE as Address, abi: AAVE_POOL_ABI,
    functionName: 'getReserveData', args: [ADDR.USDC as Address],
  })
  const aprPct = (() => {
    if (!aaveReserveData) return undefined
    const rate = (aaveReserveData as { currentLiquidityRate: bigint }).currentLiquidityRate
    if (!rate) return undefined
    return (Number((rate * 10000n) / 1_000_000_000_000_000_000_000_000_000n) / 100).toFixed(2)
  })()

  // ── Strategy stats ───────────────────────────────────────────────────────
  const { data: stratDeployedRaw } = useReadContract({
    address: ADDR.StrategyManagerV01 as Address, abi: STRAT_MGR_ABI,
    functionName: 'totalManagedAssets',
  })
  const stratDeployed = (stratDeployedRaw as bigint | undefined) ?? 0n
  const reserveUSDC   = totalAssets > stratDeployed ? totalAssets - stratDeployed : 0n
  const reserveRatioPct = totalAssets > 0n
    ? Number((reserveUSDC * 10000n) / totalAssets) / 100
    : 0

  // ── PPS history tracking ─────────────────────────────────────────────────
  useEffect(() => {
    if (pps === 0n) return
    const v = Number(formatUnits(pps, 6))
    setPpsHistory(prev => {
      const last = prev[prev.length - 1]
      if (last && Math.abs(last.v - v) < 0.000001) return prev
      const next = [...prev, { t: Date.now(), v }]
      savePps(next)
      return next
    })
  }, [pps])

  // ── Parsed amounts ────────────────────────────────────────────────────────
  const parsedDeposit = safeParse(depositAmt, 6)
  const parsedRedeem  = safeParse(redeemAmt,  18)

  // ── Preview reads ─────────────────────────────────────────────────────────
  const { data: previewShares } = useReadContract({
    address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
    functionName: 'previewDeposit', args: [parsedDeposit],
    query: { enabled: parsedDeposit > 0n },
  })
  const { data: previewUSDC } = useReadContract({
    address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
    functionName: 'previewRedeem', args: [parsedRedeem],
    query: { enabled: parsedRedeem > 0n },
  })

  // ── Write: approve ────────────────────────────────────────────────────────
  const { writeContract: writeApprove, data: approveTxHash, isPending: approvePending, error: approveError, reset: resetApprove } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash })

  // ── Write: deposit ────────────────────────────────────────────────────────
  const { writeContract: writeDeposit, data: depositTxHash, isPending: depositPending, error: depositError, reset: resetDeposit } = useWriteContract()
  const { isLoading: depositConfirming, isSuccess: depositSuccess } = useWaitForTransactionReceipt({ hash: depositTxHash })

  // ── Write: redeem ─────────────────────────────────────────────────────────
  const { writeContract: writeRedeem, data: redeemTxHash, isPending: redeemPending, error: redeemError, reset: resetRedeem } = useWriteContract()
  const { isLoading: redeemConfirming, isSuccess: redeemSuccess } = useWaitForTransactionReceipt({ hash: redeemTxHash })

  // ── Derived state ─────────────────────────────────────────────────────────
  const needsApproval   = parsedDeposit > 0n && usdcAllowance < parsedDeposit
  const approveInflight = approvePending || approveConfirming
  const depositInflight = depositPending || depositConfirming
  const redeemInflight  = redeemPending  || redeemConfirming

  const depositStep = depositSuccess ? 3 : !needsApproval ? 2 : 1

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleApprove = () => {
    setDepositErr('')
    try {
      writeApprove({ address: ADDR.USDC as Address, abi: USDC_ABI, functionName: 'approve', args: [ADDR.FundVaultV01 as Address, parsedDeposit] })
    } catch(e) { setDepositErr(parseTxError(e)) }
  }
  const handleDeposit = () => {
    setDepositErr('')
    try {
      writeDeposit({ address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI, functionName: 'deposit', args: [parsedDeposit, address as Address] })
    } catch(e) { setDepositErr(parseTxError(e)) }
  }
  const handleRedeem = () => {
    setRedeemErr('')
    try {
      writeRedeem({ address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI, functionName: 'redeem', args: [parsedRedeem, address as Address, address as Address] })
    } catch(e) { setRedeemErr(parseTxError(e)) }
  }
  const handleMaxRedeem = () => fbUsdcBalance > 0n && setRedeemAmt(formatUnits(fbUsdcBalance, 18))

  // ── Refetch on success ────────────────────────────────────────────────────
  useEffect(() => {
    if (approveSuccess || depositSuccess || redeemSuccess) refetchReads()
    if (depositSuccess) { setDepositAmt(''); resetDeposit() }
    if (redeemSuccess)  { setRedeemAmt('');  resetRedeem()  }
  }, [approveSuccess, depositSuccess, redeemSuccess])

  // ── Error display ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (approveError || depositError) setDepositErr(parseTxError(approveError ?? depositError))
  }, [approveError, depositError])
  useEffect(() => {
    if (redeemError) setRedeemErr(parseTxError(redeemError))
  }, [redeemError])

  // ── Button helpers ────────────────────────────────────────────────────────
  const depositBtn = (() => {
    if (!isConnected)          return { label: 'Connect Wallet',    disabled: true }
    if (systemModeNum !== 0)   return { label: 'Deposits Disabled', disabled: true }
    if (depositsPaused)        return { label: 'Deposits Paused',   disabled: true }
    if (!isAllowed)            return { label: 'Not Allowlisted',   disabled: true }
    if (parsedDeposit === 0n)  return { label: 'Enter Amount',      disabled: true }
    if (parsedDeposit > usdcBalance) return { label: 'Insufficient USDC', disabled: true }
    if (needsApproval) {
      if (approveInflight) return { label: approveConfirming ? 'Confirming…' : 'Signing…', disabled: true }
      return { label: 'Approve USDC', disabled: false, action: handleApprove }
    }
    if (depositInflight) return { label: depositConfirming ? 'Confirming…' : 'Signing…', disabled: true }
    if (depositSuccess)  return { label: '✓ Deposited', disabled: true }
    return { label: 'Deposit', disabled: false, action: handleDeposit }
  })()

  const redeemBtn = (() => {
    if (!isConnected)         return { label: 'Connect Wallet',    disabled: true }
    if (systemModeNum === 2)  return { label: 'Use Emergency Exit', disabled: true }
    if (redeemsPaused)        return { label: 'Redeems Paused',    disabled: true }
    if (parsedRedeem === 0n)  return { label: 'Enter Amount',      disabled: true }
    if (parsedRedeem > fbUsdcBalance) return { label: 'Insufficient Balance', disabled: true }
    if (redeemInflight) return { label: redeemConfirming ? 'Confirming…' : 'Signing…', disabled: true }
    if (redeemSuccess)  return { label: '✓ Redeemed', disabled: true }
    return { label: 'Redeem fbUSDC', disabled: false, action: handleRedeem }
  })()

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-6 space-y-6">

      {/* ── Hero summary card ──────────────────────────────────────────── */}
      <section
        className="relative rounded-xl overflow-hidden px-7 py-6"
        style={{ background: 'linear-gradient(145deg, #18281e 0%, #2d3e33 100%)' }}
      >
        {/* Ring motif */}
        <div className="absolute inset-0 pointer-events-none opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle at 80% 50%, transparent 30%, rgba(113,90,62,0.15) 31%, transparent 32%)',
            backgroundSize: '600px 600px', backgroundPosition: 'right center', backgroundRepeat: 'no-repeat',
          }}
        />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          {/* Left: balance */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/50">
                Total Portfolio Value
              </span>
              <ModeBadge mode={systemModeNum} />
            </div>
            {isConnected && readsLoading ? (
              <div className="space-y-2 pt-1">
                <div className="animate-pulse h-12 w-52 rounded-xl bg-white/20" />
                <div className="animate-pulse h-4 w-64 rounded-md bg-white/10" />
              </div>
            ) : (
              <>
                <h1
                  className="text-4xl md:text-5xl font-bold tracking-tight text-white"
                  style={{ fontFamily: "'Noto Serif', serif" }}
                >
                  {isConnected && holdingsUSDC > 0n ? `$${fmtUSDC(holdingsUSDC)}` : '$—'}
                </h1>
                {isConnected && (
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-white/60">
                      Available <span className="text-white font-semibold">
                        {freeUSDC > 0n ? `$${fmtUSDC(freeUSDC)}` : '$0.00'}
                      </span>
                    </span>
                    <span className="text-white/30">·</span>
                    <span className="text-white/60">
                      Locked <span className="text-[#e0c29f] font-semibold">
                        {lockedUSDC > 0n ? `$${fmtUSDC(lockedUSDC)}` : '$0.00'}
                      </span>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: stats */}
          <div className="flex flex-wrap gap-6 md:gap-10">
            {[
              { label: 'Price per Share', value: pps > 0n ? fmtPPS(pps) : '—', sub: 'fbUSDC / USDC' },
              { label: 'Current APR',     value: aprPct ? `${aprPct}%` : '—',  sub: 'Aave V3 · Estimated' },
              { label: 'Total Assets',    value: totalAssets > 0n ? `$${fmtUSDC(totalAssets)}` : '—', sub: 'Protocol TVL' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</p>
                {readsLoading ? (
                  <div className="animate-pulse h-6 w-20 rounded-md bg-white/20" />
                ) : (
                  <p className="text-lg font-bold text-white" style={{ fontFamily: "'Noto Serif', serif" }}>
                    {value}
                  </p>
                )}
                <p className="text-[10px] text-white/40">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Protocol stats row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Strategy Deployed', value: stratDeployed > 0n ? `$${fmtUSDC(stratDeployed)}` : '—', sub: 'In Aave V3' },
          { label: 'Reserve',           value: reserveUSDC   > 0n ? `$${fmtUSDC(reserveUSDC)}`   : '—', sub: `${reserveRatioPct.toFixed(1)}% of TVL` },
          { label: 'Mgmt Fee',          value: mgmtFeeBps === 0n ? 'Free' : `${(Number(mgmtFeeBps) / 100).toFixed(2)}%`, sub: 'Per month' },
          { label: 'PPS Trend',         value: null, sparkline: true },
        ].map(({ label, value, sub, sparkline }) => (
          <div key={label} className="rounded-xl px-4 py-3" style={{ background: '#f5f5f0' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/50 mb-1">{label}</p>
            {sparkline ? (
              <Sparkline points={ppsHistory} />
            ) : readsLoading ? (
              <>
                <Sk className="h-5 w-20 mb-1" />
                <Sk className="h-3 w-14" />
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>{value}</p>
                <p className="text-[10px] text-[#434844]/40 mt-0.5">{sub}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── Read error banner ───────────────────────────────────────────── */}
      {readsError && !readsLoading && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs text-red-600"
          style={{ background: '#fff1f1', border: '1px solid #fca5a530' }}>
          <span className="material-symbols-outlined text-base flex-shrink-0">cloud_off</span>
          <span className="flex-1">{parseReadError(readsError)}</span>
          <button onClick={() => refetchReads()} className="font-semibold underline flex-shrink-0">Retry</button>
        </div>
      )}

      {/* ── Allowlist warning ───────────────────────────────────────────── */}
      {isConnected && !isAllowed && (
        <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs"
          style={{ background: '#fdf8f3', border: '1px solid #715a3e30' }}>
          <span className="material-symbols-outlined text-base text-[#715a3e] shrink-0">info</span>
          <span className="text-[#715a3e]">
            Your address is not on the allowlist. Deposits are restricted — redeems remain open to all shareholders.
          </span>
        </div>
      )}

      {/* ── Deposit / Redeem panels ─────────────────────────────────────── */}
      {!isConnected ? (
        <div className="rounded-2xl flex flex-col items-center justify-center py-14 text-center space-y-3"
          style={{ background: '#f5f5f0' }}>
          <span className="material-symbols-outlined text-4xl text-[#c3c8c2]">account_balance_wallet</span>
          <div>
            <p className="text-sm font-semibold text-[#1b1c1a]">Connect your wallet</p>
            <p className="text-xs text-[#434844]/50 mt-1">to deposit, redeem, or view your position</p>
          </div>
        </div>
      ) : null}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-5 ${!isConnected ? 'hidden' : ''}`}>

        {/* ── Deposit ── */}
        <div className="bg-[#f5f3ef] rounded-xl p-6 space-y-5">
          <h3
            className="text-lg font-bold text-[#1b1c1a]"
            style={{ fontFamily: "'Noto Serif', serif" }}
          >
            Deposit
          </h3>

          {/* Input */}
          <div className="space-y-1">
            <div className="border-b-2 border-[#c3c8c2] focus-within:border-[#715a3e] transition-colors pb-1.5 flex items-center gap-2">
              <input
                type="number" min="0" placeholder="0.00"
                value={depositAmt}
                onChange={e => { setDepositAmt(e.target.value); setDepositErr(''); resetApprove() }}
                className="flex-1 bg-transparent text-2xl font-semibold text-[#1b1c1a] outline-none placeholder:text-[#434844]/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[#434844] font-semibold text-sm">USDC</span>
            </div>
            <p className="text-xs text-[#434844]/70">
              Balance: <span className="font-semibold text-[#434844]">
                {isConnected ? `$${fmtUSDC(usdcBalance)}` : '—'}
              </span>
            </p>
          </div>

          {/* Preview */}
          {parsedDeposit > 0n && previewShares !== undefined && (
            <div className="bg-white rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-xs text-[#434844]">You receive</span>
              <span className="text-sm font-bold text-[#18281e]">
                ≈ {fmtShares(previewShares as bigint)} fbUSDC
              </span>
            </div>
          )}

          {/* Step indicator */}
          {isConnected && parsedDeposit > 0n && needsApproval && (
            <StepDots steps={['Approve', 'Deposit']} current={depositStep} />
          )}

          {/* Error */}
          {depositErr && (
            <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{depositErr}</p>
          )}

          {/* Status */}
          {depositSuccess && depositTxHash && (
            <div className="flex items-center gap-2 text-xs text-[#18281e] bg-[#18281e]/5 rounded-lg px-3 py-2">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span>Deposit confirmed</span>
              <a href={`https://basescan.org/tx/${depositTxHash}`} target="_blank" rel="noreferrer" className="ml-auto underline">
                View
              </a>
            </div>
          )}

          {/* Button */}
          <button
            disabled={depositBtn.disabled}
            onClick={depositBtn.action}
            className={`w-full py-3.5 rounded-lg font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${
              depositBtn.disabled
                ? 'bg-[#434844]/10 text-[#434844]'
                : 'text-white hover:opacity-90'
            }`}
            style={!depositBtn.disabled ? { background: 'linear-gradient(135deg, #18281e, #2d3e33)' } : undefined}
          >
            {depositBtn.label}
          </button>

          {/* Allowlist hint */}
          {isConnected && !isAllowed && (
            <p className="text-[10px] text-[#434844]/60 text-center">
              Deposits require allowlist membership. Redeems are open to all shareholders.
            </p>
          )}
        </div>

        {/* ── Redeem ── */}
        <div className="bg-[#f5f3ef] rounded-xl p-6 space-y-5">
          <h3
            className="text-lg font-bold text-[#1b1c1a]"
            style={{ fontFamily: "'Noto Serif', serif" }}
          >
            Redeem
          </h3>

          {/* Input */}
          <div className="space-y-1">
            <div className="border-b-2 border-[#c3c8c2] focus-within:border-[#715a3e] transition-colors pb-1.5 flex items-center gap-2">
              <input
                type="number" min="0" placeholder="0.0000"
                value={redeemAmt}
                onChange={e => { setRedeemAmt(e.target.value); setRedeemErr(''); resetRedeem() }}
                className="flex-1 bg-transparent text-2xl font-semibold text-[#1b1c1a] outline-none placeholder:text-[#434844]/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[#434844] font-semibold text-sm">fbUSDC</span>
              <button
                onClick={handleMaxRedeem}
                className="text-[10px] font-bold text-[#715a3e] bg-[#715a3e]/8 px-2 py-0.5 rounded hover:bg-[#715a3e]/15 transition-colors"
              >
                MAX
              </button>
            </div>
            <p className="text-xs text-[#434844]/70">
              Balance: <span className="font-semibold text-[#434844]">
                {isConnected ? `${fmtShares(fbUsdcBalance)} fbUSDC` : '—'}
              </span>
            </p>
          </div>

          {/* Preview */}
          {parsedRedeem > 0n && previewUSDC !== undefined && (
            <div className="bg-white rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-xs text-[#434844]">You receive</span>
              <span className="text-sm font-bold text-[#18281e]">
                ≈ ${fmtUSDC(previewUSDC as bigint)} USDC
              </span>
            </div>
          )}

          {/* Spacer to align with deposit step indicator */}
          <div className="h-4" />

          {/* Error */}
          {redeemErr && (
            <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{redeemErr}</p>
          )}

          {/* Status */}
          {redeemSuccess && redeemTxHash && (
            <div className="flex items-center gap-2 text-xs text-[#18281e] bg-[#18281e]/5 rounded-lg px-3 py-2">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span>Redeem confirmed</span>
              <a href={`https://basescan.org/tx/${redeemTxHash}`} target="_blank" rel="noreferrer" className="ml-auto underline">
                View
              </a>
            </div>
          )}

          {/* Button */}
          <button
            disabled={redeemBtn.disabled}
            onClick={redeemBtn.action}
            className={`w-full py-3.5 rounded-lg font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${
              redeemBtn.disabled
                ? 'bg-[#434844]/10 text-[#434844]'
                : 'bg-[#18281e] text-white hover:opacity-90'
            }`}
          >
            {redeemBtn.label}
          </button>

          {/* Locked shares note */}
          {isConnected && lockedShares > 0n && (
            <p className="text-[10px] text-[#434844]/60 text-center">
              {fmtShares(lockedShares)} fbUSDC is locked · go to Locks to manage
            </p>
          )}
        </div>
      </div>

      {/* ── Emergency Exit Panel ───────────────────────────────────────── */}
      {isConnected && systemModeNum === 2 && (
        <EmergencyExitPanel fbUsdcBalance={fbUsdcBalance} />
      )}
    </div>
  )
}
