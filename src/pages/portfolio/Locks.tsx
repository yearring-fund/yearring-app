import { useState, useMemo, useEffect } from 'react'
import {
  useAccount,
  useReadContracts,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { formatUnits, parseUnits, type Address } from 'viem'
import {
  ADDR, VAULT_ABI, LOCK_MGR_ABI, REBATE_MGR_ABI, POINTS_ABI,
} from '../../lib/contracts'
import { parseTxError, parseReadError } from '../../lib/txError'
import { Sk } from '../../components/ui/Skeleton'

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtYrUSDC(n: bigint) {
  return Number(formatUnits(n, 18)).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}
function fmtUSDC(n: bigint) {
  return Number(formatUnits(n, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPoints(n: bigint) {
  return Number(formatUnits(n, 18)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function safeParse(val: string): bigint {
  try { return val && Number(val) > 0 ? parseUnits(val, 18) : 0n }
  catch { return 0n }
}
function fmtDate(ts: bigint) {
  return new Date(Number(ts) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function daysLeft(minUnlockTime: bigint) {
  const diff = Number(minUnlockTime) - Math.floor(Date.now() / 1000)
  return Math.max(0, Math.ceil(diff / 86400))
}

// Derive tier name from committedDuration (mirrors RewardsMathV21)
function tierFromDuration(committedDuration: bigint): { name: string; accent: string; bg: string } {
  const secs = Number(committedDuration)
  if (secs >= 180 * 86400) return { name: 'Gold',   accent: '#7a6020', bg: '#fdf9ee' }
  if (secs >=  90 * 86400) return { name: 'Silver', accent: '#5a6a6d', bg: '#f3f7f7' }
  if (secs >=  30 * 86400) return { name: 'Bronze', accent: '#715a3e', bg: '#fdf8f3' }
  return { name: 'Trial', accent: '#434844', bg: '#f5f5f0' }
}

// ── Lock status enum (mirrors LockStatus in ILockManagerV21) ──────────────
// 0=None, 1=Active, 2=Exited, 3=EarlyExited

// ── Tiers (for create lock UI) ─────────────────────────────────────────────
const TIERS = [
  {
    id: 0,
    name: 'Bronze',
    duration: 30 * 86400,    // 30 days
    durationLabel: '30 days',
    feeRebatePct: 20,
    multiplierBps: 10000,    // 1.0×
    icon: 'token',
    accent: '#715a3e',
    bg: '#fdf8f3',
  },
  {
    id: 1,
    name: 'Silver',
    duration: 90 * 86400,    // 90 days
    durationLabel: '90 days',
    feeRebatePct: 40,
    multiplierBps: 13000,    // 1.3×
    icon: 'workspace_premium',
    accent: '#5a6a6d',
    bg: '#f3f7f7',
    badge: 'Most Popular',
  },
  {
    id: 2,
    name: 'Gold',
    duration: 180 * 86400,   // 180 days
    durationLabel: '180 days',
    feeRebatePct: 60,
    multiplierBps: 18000,    // 1.8×
    icon: 'military_tech',
    accent: '#7a6020',
    bg: '#fdf9ee',
  },
] as const

// ── Step indicator ─────────────────────────────────────────────────────────
function StepDots({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-1 text-[10px]">
      {steps.map((label, i) => {
        const idx = i + 1
        const done   = idx < current
        const active = idx === current
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

// ── Tier card ──────────────────────────────────────────────────────────────
function TierCard({
  tier,
  selected,
  onSelect,
}: {
  tier: typeof TIERS[number]
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="flex-shrink-0 w-[160px] md:flex-1 rounded-2xl p-4 text-left transition-all duration-150"
      style={{
        background: selected ? tier.bg : '#f5f5f0',
        border: selected ? `1.5px solid ${tier.accent}` : '1.5px solid transparent',
        outline: 'none',
      }}
    >
      {'badge' in tier && tier.badge && (
        <div className="mb-2">
          <span
            className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: tier.accent, color: '#fff' }}
          >
            {tier.badge}
          </span>
        </div>
      )}
      <span
        className="material-symbols-outlined text-2xl mb-2 block"
        style={{ color: tier.accent }}
      >
        {tier.icon}
      </span>
      <div className="font-bold text-[#1b1c1a] text-sm" style={{ fontFamily: "'Noto Serif', serif" }}>
        {tier.name}
      </div>
      <div className="text-[11px] text-[#434844]/60 mt-0.5">{tier.durationLabel}</div>
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-[#434844]/60">Fee rebate</span>
          <span className="font-semibold" style={{ color: tier.accent }}>
            {tier.feeRebatePct}%
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-[#434844]/60">Points reward</span>
          <span className="font-semibold text-[#434844]">
            {(tier.multiplierBps / 10000).toFixed(1)}×
          </span>
        </div>
      </div>
    </button>
  )
}

// ── Tier badge (for lock row) ──────────────────────────────────────────────
function TierBadge({ committedDuration }: { committedDuration: bigint }) {
  const t = tierFromDuration(committedDuration)
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: t.bg, color: t.accent, border: `1px solid ${t.accent}40` }}
    >
      {t.name}
    </span>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status, minUnlockTime }: { status: number; minUnlockTime: bigint }) {
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (status === 3) return <span className="text-[10px] text-red-500 font-semibold">Early Exited</span>
  if (status === 2) return <span className="text-[10px] text-[#434844]/40 font-semibold">Unlocked</span>
  if (status === 1 && minUnlockTime <= now) return <span className="text-[10px] text-emerald-600 font-semibold">Ready</span>
  if (status === 1) return (
    <span className="text-[10px] text-[#715a3e] font-semibold">
      {daysLeft(minUnlockTime)}d left
    </span>
  )
  return null
}

// ── V21 LockInfo from getLock ──────────────────────────────────────────────
interface V21LockRaw {
  owner: Address
  yrUSDCAmount: bigint
  principalAssetsUSDC: bigint
  startTime: bigint
  minUnlockTime: bigint
  committedDuration: bigint
  basePointsIssued: bigint
  bonusPointsIssued: bigint
  lastBonusPointsCheckpoint: bigint
  lastRebateCheckpoint: bigint
  claimableRebateUSDC: bigint
  manager: Address
  managerUnits: bigint
  assetType: number
  status: number
  transition: number
}

// ── Single lock row / card ─────────────────────────────────────────────────
interface LockInfo {
  lockId: bigint
  raw: V21LockRaw
}

function LockRow({
  lock,
  onRefresh,
}: {
  lock: LockInfo
  onRefresh: () => void
}) {
  const { raw, lockId } = lock
  const [expanded, setExpanded] = useState(false)
  const [txErr, setTxErr] = useState('')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const now = BigInt(Math.floor(Date.now() / 1000))
  const isActive     = raw.status === 1
  const isReady      = isActive && raw.minUnlockTime <= now
  const isLocked     = isActive && raw.minUnlockTime > now
  const canClaim     = (isActive || raw.status === 2) && raw.claimableRebateUSDC > 0n
  const canEarlyExit = isLocked

  const { writeContractAsync: write, isPending } = useWriteContract()
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash })
  const busy = isPending || confirming

  async function doUnlock() {
    setTxErr('')
    try {
      const h = await write({
        address: ADDR.LockManagerV21 as Address,
        abi: LOCK_MGR_ABI,
        functionName: 'unlock',
        args: [lockId],
      })
      setTxHash(h)
      setTimeout(onRefresh, 4000)
    } catch (e) { setTxErr(parseTxError(e)) }
  }

  async function doClaimRebate() {
    setTxErr('')
    try {
      const h = await write({
        address: ADDR.RebateManagerV21 as Address,
        abi: REBATE_MGR_ABI,
        functionName: 'claimRebate',
        args: [lockId],
      })
      setTxHash(h)
      setTimeout(onRefresh, 4000)
    } catch (e) { setTxErr(parseTxError(e)) }
  }

  // V21 earlyExit: no points approval needed — LockManager calls debit() internally
  async function doEarlyExit() {
    setTxErr('')
    try {
      const h = await write({
        address: ADDR.LockManagerV21 as Address,
        abi: LOCK_MGR_ABI,
        functionName: 'earlyExit',
        args: [lockId],
      })
      setTxHash(h)
      setTimeout(onRefresh, 4000)
    } catch (e) { setTxErr(parseTxError(e)) }
  }

  const isFinished = raw.status === 2 || raw.status === 3

  return (
    <div className={`rounded-xl p-4 transition-all ${isFinished ? 'opacity-50' : 'bg-white/60'}`}
      style={{ border: '1px solid #e8e8e2' }}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <TierBadge committedDuration={raw.committedDuration} />
          <span className="text-xs text-[#434844]/50 font-mono">#{lockId.toString()}</span>
        </div>
        <StatusBadge status={raw.status} minUnlockTime={raw.minUnlockTime} />
      </div>

      {/* Main info */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <div className="text-[10px] text-[#434844]/50 uppercase tracking-wide">Locked</div>
          <div className="font-semibold text-[#1b1c1a] font-mono">{fmtYrUSDC(raw.yrUSDCAmount)} yrUSDC</div>
        </div>
        <div>
          <div className="text-[10px] text-[#434844]/50 uppercase tracking-wide">Unlocks</div>
          <div className="font-semibold text-[#1b1c1a]">{fmtDate(raw.minUnlockTime)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#434844]/50 uppercase tracking-wide">Points</div>
          <div className="font-semibold text-[#434844]">
            {fmtPoints(raw.basePointsIssued + raw.bonusPointsIssued)} pts
          </div>
        </div>
        {raw.claimableRebateUSDC > 0n && (
          <div>
            <div className="text-[10px] text-[#434844]/50 uppercase tracking-wide">Claimable Rebate</div>
            <div className="font-semibold text-[#715a3e]">${fmtUSDC(raw.claimableRebateUSDC)} USDC</div>
          </div>
        )}
      </div>

      {/* Actions */}
      {!isFinished && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isReady && (
            <button
              onClick={doUnlock}
              disabled={busy}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #18281e, #2d3e33)' }}
            >
              {busy ? (confirming ? 'Confirming…' : 'Signing…') : 'Unlock'}
            </button>
          )}
          {canClaim && (
            <button
              onClick={doClaimRebate}
              disabled={busy}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-[#715a3e] disabled:opacity-50 transition-opacity"
              style={{ background: '#fdf8f3', border: '1px solid #715a3e40' }}
            >
              {busy ? 'Signing…' : `Claim $${fmtUSDC(raw.claimableRebateUSDC)} Rebate`}
            </button>
          )}
          {canEarlyExit && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-red-600 transition-opacity"
              style={{ background: '#fff1f1', border: '1px solid #f8707040' }}
            >
              Early Exit
            </button>
          )}
        </div>
      )}

      {/* Early exit expanded panel — V21: no points approval needed */}
      {expanded && canEarlyExit && (
        <div className="mt-3 rounded-xl p-3 space-y-2" style={{ background: '#fff8f8', border: '1px solid #fca5a540' }}>
          <div className="text-[11px] text-red-600 font-semibold">Early Exit</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>
              <span className="text-[#434844]/50">Points forfeited</span>
              <div className="font-mono font-semibold text-red-600">
                {fmtPoints(raw.basePointsIssued + raw.bonusPointsIssued)} pts
              </div>
            </div>
            <div>
              <span className="text-[#434844]/50">Days remaining</span>
              <div className="font-semibold text-[#434844]">{daysLeft(raw.minUnlockTime)}d</div>
            </div>
            <div>
              <span className="text-[#434844]/50">Rebate lost</span>
              <div className="font-semibold text-red-600">${fmtUSDC(raw.claimableRebateUSDC)}</div>
            </div>
            <div>
              <span className="text-[#434844]/50">yrUSDC returned</span>
              <div className="font-semibold text-[#18281e]">{fmtYrUSDC(raw.yrUSDCAmount)}</div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={doEarlyExit}
              disabled={busy}
              className="text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-50 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #7f1d1d, #b91c1c)' }}
            >
              {isPending ? 'Signing…' : confirming ? 'Confirming…' : 'Confirm Exit'}
            </button>
          </div>
        </div>
      )}

      {txErr && (
        <div className="mt-2 text-[11px] text-red-500 bg-red-50 rounded-lg px-2 py-1.5">
          {txErr}
        </div>
      )}
    </div>
  )
}

// ── Main Locks page ────────────────────────────────────────────────────────
export default function Locks() {
  const { address } = useAccount()
  const [selectedTier, setSelectedTier] = useState(0)
  const [amount, setAmount]             = useState('')
  const [txErr, setTxErr]                   = useState('')
  const [approveTxHash, setApproveTxHash]   = useState<`0x${string}` | undefined>()
  const [lockTxHash, setLockTxHash]         = useState<`0x${string}` | undefined>()
  const [refreshSig, setRefreshSig]         = useState(0)

  const tier = TIERS[selectedTier as 0 | 1 | 2]
  const parsedShares = safeParse(amount)
  const unlockDate = useMemo(() => {
    if (!parsedShares || parsedShares === 0n) return null
    const ts = Math.floor(Date.now() / 1000) + tier.duration
    return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }, [tier, parsedShares])

  // ── User yrUSDC balance & allowance to LockManagerV21 ───────────────────
  const { data: balData, refetch: refetchBal } = useReadContracts({
    contracts: [
      { address: ADDR.YearRingCoreVaultV21 as Address, abi: VAULT_ABI, functionName: 'balanceOf', args: [address as Address] },
      { address: ADDR.YearRingCoreVaultV21 as Address, abi: VAULT_ABI, functionName: 'allowance', args: [address as Address, ADDR.LockManagerV21 as Address] },
    ],
    query: { enabled: !!address, refetchInterval: 15_000 },
  })
  const yrUSDCBalance  = (balData?.[0]?.result as bigint | undefined) ?? 0n
  const yrUSDCAllowance = (balData?.[1]?.result as bigint | undefined) ?? 0n

  // ── Points balance ───────────────────────────────────────────────────────
  const { data: pointsBalRaw } = useReadContract({
    address: ADDR.PointsLedgerV01 as Address, abi: POINTS_ABI,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address, refetchInterval: 15_000 },
  })
  const pointsBalance = (pointsBalRaw as bigint | undefined) ?? 0n

  // ── Lock IDs (paginated) ─────────────────────────────────────────────────
  const { data: lockIdsRaw, isLoading: idsLoading, error: idsError, refetch: refetchIds } = useReadContract({
    address: ADDR.LockManagerV21 as Address,
    abi: LOCK_MGR_ABI,
    functionName: 'getUserLockIds',
    args: [address as Address, 0n, 1000n],
    query: { enabled: !!address },
  })
  // Returns (uint256[] lockIds, uint256 total)
  const lockIds = ((lockIdsRaw as [bigint[], bigint] | undefined)?.[0]) ?? []

  // ── Per-lock reads (getLock only — all data is in the struct) ────────────
  const lockContracts = useMemo(() => lockIds.map(id => ({
    address: ADDR.LockManagerV21 as Address, abi: LOCK_MGR_ABI,
    functionName: 'getLock' as const, args: [id],
  })), [lockIds.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  const { data: lockBatch, isLoading: batchLoading, error: batchError, refetch: refetchBatch } = useReadContracts({
    contracts: lockContracts,
    query: { enabled: lockIds.length > 0 },
  })

  const locks: LockInfo[] = useMemo(() => {
    if (!lockBatch || lockBatch.length === 0) return []
    return lockIds.map((id, i) => {
      const raw = lockBatch[i]?.result as V21LockRaw | undefined
      if (!raw) return null
      return { lockId: id, raw }
    }).filter(Boolean) as LockInfo[]
  }, [lockBatch, lockIds])

  // Computed locked shares (Active locks only)
  const lockedYrUSDC = useMemo(() =>
    locks.filter(l => l.raw.status === 1).reduce((s, l) => s + l.raw.yrUSDCAmount, 0n),
    [locks]
  )
  // Available yrUSDC = total vault balance (wallet holds yrUSDC; locked shares are held by LockManager)
  const freeBalance = yrUSDCBalance

  // ── Step logic ──────────────────────────────────────────────────────────
  const needsApprove = parsedShares > 0n && yrUSDCAllowance < parsedShares
  const step = needsApprove ? 1 : 2

  // ── Write contract ──────────────────────────────────────────────────────
  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash })
  const { isLoading: lockConfirming,   isSuccess: lockSuccess    } = useWaitForTransactionReceipt({ hash: lockTxHash })
  const busy = isPending || approveConfirming || lockConfirming

  useEffect(() => { if (approveSuccess) refetchBal() }, [approveSuccess])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (lockSuccess) { setAmount(''); handleRefresh() }
  }, [lockSuccess])  // eslint-disable-line react-hooks/exhaustive-deps

  function handleRefresh() {
    refetchIds()
    refetchBatch()
    setRefreshSig(s => s + 1)
  }

  async function doApprove() {
    setTxErr('')
    try {
      const h = await writeContractAsync({
        address: ADDR.YearRingCoreVaultV21 as Address,
        abi: VAULT_ABI,
        functionName: 'approve',
        args: [ADDR.LockManagerV21 as Address, parsedShares],
      })
      setApproveTxHash(h)
    } catch (e) { setTxErr(parseTxError(e)) }
  }

  async function doLock() {
    setTxErr('')
    try {
      const h = await writeContractAsync({
        address: ADDR.LockManagerV21 as Address,
        abi: LOCK_MGR_ABI,
        functionName: 'createLock',
        args: [parsedShares, BigInt(tier.duration)],
      })
      setLockTxHash(h)
    } catch (e) { setTxErr(parseTxError(e)) }
  }

  const overBalance = parsedShares > 0n && parsedShares > freeBalance
  const canSubmit = !!address && parsedShares > 0n && !overBalance && !busy

  const locksLoading  = idsLoading || (lockIds.length > 0 && batchLoading)
  const locksError    = idsError ?? batchError
  const activeLocks   = locks.filter(l => l.raw.status === 1)
  const finishedLocks = locks.filter(l => l.raw.status === 2 || l.raw.status === 3)

  if (!address) {
    return (
      <div className="max-w-2xl mx-auto px-5 md:px-6 py-8 space-y-4">
        <div className="rounded-2xl p-5 space-y-4" style={{ background: '#f5f5f0' }}>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#715a3e]">lock</span>
            <span className="text-xs font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>
              What locking does
            </span>
          </div>
          <p className="text-xs text-[#434844]/70 leading-relaxed">
            Locking commits yrUSDC shares for a fixed term. In exchange you receive a management fee rebate for the duration of the lock, plus Points that represent your contribution to the protocol.
          </p>
          <div className="grid grid-cols-1 gap-2">
            {([
              ['token',             'Bronze · 30 days — 20% fee rebate · 1.0× Points'],
              ['workspace_premium', 'Silver · 90 days — 40% fee rebate · 1.3× Points'],
              ['military_tech',     'Gold · 180 days — 60% fee rebate · 1.8× Points'],
            ] as const).map(([icon, text]) => (
              <div key={icon} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #e8e8e2' }}>
                <span className="material-symbols-outlined text-base text-[#715a3e] flex-shrink-0 mt-0.5">{icon}</span>
                <span className="text-[11px] text-[#434844]/70 leading-relaxed">{text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl flex flex-col items-center justify-center py-8 text-center"
          style={{ background: '#fff', border: '1px solid #e8e8e2' }}>
          <span className="material-symbols-outlined text-2xl text-[#c3c8c2] mb-2">account_balance_wallet</span>
          <p className="text-xs font-semibold text-[#434844]/60">Connect your wallet to manage locks.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-5 md:px-6 py-8 space-y-8">

      {/* ── Points balance strip ───────────────────────────────────────────── */}
      {pointsBalance > 0n && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#f5f5f0' }}>
          <span className="material-symbols-outlined text-base text-[#715a3e]">stars</span>
          <span className="text-xs text-[#434844]/60">Your Points</span>
          <span className="text-sm font-bold text-[#1b1c1a] ml-auto" style={{ fontFamily: "'Noto Serif', serif" }}>
            {fmtPoints(pointsBalance)}
          </span>
        </div>
      )}

      {/* ── Lock mechanism summary ─────────────────────────────────────────── */}
      <div className="rounded-xl px-4 py-3 flex flex-wrap gap-x-6 gap-y-1.5" style={{ background: '#f5f5f0' }}>
        {[
          ['Fee rebate', 'Applied for the full lock duration — starts immediately'],
          ['Points reward', 'Credited at each checkpoint and at unlock.'],
          ['Early exit', 'Available at any time — rebate and Points are forfeited'],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-[#434844]/50">{k}</span>
            <span className="text-[10px] text-[#434844]/40">{v}</span>
          </div>
        ))}
      </div>

      {/* ── Section: New Lock ──────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-bold text-[#1b1c1a] mb-4" style={{ fontFamily: "'Noto Serif', serif" }}>
          New Lock
        </h2>

        <div className="flex gap-3 overflow-x-auto pb-1 md:overflow-visible scrollbar-none">
          {TIERS.map(t => (
            <TierCard
              key={t.id}
              tier={t}
              selected={selectedTier === t.id}
              onSelect={() => setSelectedTier(t.id)}
            />
          ))}
        </div>

        {/* Amount input */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-[#434844]">Amount to lock</label>
            <span className="text-[11px] text-[#434844]/50">
              Available: <span className="font-mono">{fmtYrUSDC(freeBalance)}</span> yrUSDC
            </span>
          </div>
          <div className="relative">
            <input
              type="number"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.0000"
              className="w-full bg-transparent text-base font-mono text-[#1b1c1a] placeholder-[#434844]/30
                         pb-2 pt-1 pr-16 focus:outline-none transition-colors"
              style={{ borderBottom: '1.5px solid #715a3e' }}
            />
            <button
              onClick={() => freeBalance > 0n && setAmount(formatUnits(freeBalance, 18))}
              disabled={freeBalance === 0n}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#715a3e]
                         px-2 py-0.5 rounded-md hover:bg-[#715a3e]/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Lock preview */}
        {parsedShares > 0n && (
          <div className="mt-4 rounded-xl p-4 space-y-2" style={{ background: '#f5f5f0' }}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/50 mb-2">
              Lock Preview
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <div className="text-[10px] text-[#434844]/50">Tier</div>
                <div className="font-semibold text-[#1b1c1a]">{tier.name} · {tier.durationLabel}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#434844]/50">Unlocks on</div>
                <div className="font-semibold text-[#1b1c1a]">{unlockDate}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#434844]/50">Fee Rebate</div>
                <div className="font-semibold text-[#715a3e]">{tier.feeRebatePct}% off mgmt fee</div>
              </div>
              <div>
                <div className="text-[10px] text-[#434844]/50">Points Reward</div>
                <div className="font-semibold text-[#434844]">
                  {fmtPoints(parsedShares * BigInt(tier.multiplierBps) / 10000n)} pts (est.)
                </div>
              </div>
            </div>
          </div>
        )}

        {overBalance && (
          <p className="mt-2 text-[11px] text-red-500 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">error</span>
            Amount exceeds available balance
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            {parsedShares > 0n && (
              <StepDots steps={['Approve', 'Lock']} current={step} />
            )}
          </div>
          <button
            onClick={needsApprove ? doApprove : doLock}
            disabled={!canSubmit}
            className="px-6 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-40 transition-all"
            style={{ background: 'linear-gradient(135deg, #18281e, #2d3e33)' }}
          >
            {isPending
              ? 'Signing…'
              : (approveConfirming || lockConfirming)
                ? 'Confirming…'
                : needsApprove
                  ? 'Approve yrUSDC'
                  : 'Lock'}
          </button>
        </div>

        {approveSuccess && needsApprove === false && !lockSuccess && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-[#715a3e] bg-[#fdf8f3] rounded-xl px-3 py-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            Approved — now confirm the lock.
          </div>
        )}

        {lockSuccess && lockTxHash && (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            Lock created.{' '}
            <a href={`https://basescan.org/tx/${lockTxHash}`} target="_blank" rel="noreferrer" className="underline">
              View on BaseScan
            </a>
          </div>
        )}

        {txErr && (
          <div className="mt-3 text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">
            {txErr}
          </div>
        )}
      </div>

      {/* ── Section: Active Locks ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>
            Active Locks
          </h2>
          {activeLocks.length > 0 && (
            <span className="text-xs text-[#434844]/50">
              {activeLocks.length} lock{activeLocks.length > 1 ? 's' : ''} · {fmtYrUSDC(lockedYrUSDC)} yrUSDC
            </span>
          )}
        </div>

        {locksError && !locksLoading ? (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs text-red-600"
            style={{ background: '#fff1f1', border: '1px solid #fca5a530' }}>
            <span className="material-symbols-outlined text-base flex-shrink-0">cloud_off</span>
            <span className="flex-1">{parseReadError(locksError)}</span>
            <button onClick={() => { refetchIds(); refetchBatch() }} className="font-semibold underline flex-shrink-0">Retry</button>
          </div>
        ) : locksLoading ? (
          <div className="space-y-3">
            {[0, 1].map(i => (
              <div key={i} className="rounded-xl p-4" style={{ border: '1px solid #e8e8e2' }}>
                <div className="flex items-center justify-between mb-3">
                  <Sk className="h-5 w-20" />
                  <Sk className="h-4 w-16" />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Sk className="h-4 w-24" />
                  <Sk className="h-4 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : activeLocks.length === 0 ? (
          <div className="rounded-2xl flex flex-col items-center justify-center py-8 text-center"
            style={{ background: '#fff', border: '1px solid #e8e8e2' }}>
            <span className="material-symbols-outlined text-2xl text-[#c3c8c2] mb-2">lock_open</span>
            <p className="text-xs font-semibold text-[#434844]/60">No active locks</p>
            <p className="text-[11px] text-[#434844]/35 mt-1">Choose a tier above and lock yrUSDC shares to start earning rebates and Points.</p>
          </div>
        ) : (
          <div className="space-y-3" key={refreshSig}>
            {activeLocks.map(l => (
              <LockRow key={l.lockId.toString()} lock={l} onRefresh={handleRefresh} />
            ))}
          </div>
        )}
      </div>

      {/* ── Section: Past Locks ───────────────────────────────────────────── */}
      {finishedLocks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#434844]/50 mb-3">
            Past Locks ({finishedLocks.length})
          </h2>
          <div className="space-y-3">
            {finishedLocks.map(l => (
              <LockRow key={l.lockId.toString()} lock={l} onRefresh={handleRefresh} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
