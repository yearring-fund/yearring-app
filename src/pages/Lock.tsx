import { useState, useEffect } from 'react'
import {
  useAccount,
  useReadContracts,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { parseUnits, formatUnits,  type Address } from 'viem'
import {
  ADDR,
  VAULT_ABI,
  LEDGER_ABI,
  LOCK_MGR_ABI,
  BENEFIT_ABI,
  RWT_ABI,
} from '../lib/contracts'
import {
  formatShares,
  formatRWT,
  formatDate,
  secondsToDuration,
} from '../lib/format'
import { parseTxError } from '../lib/txError'

// ── Tier config ───────────────────────────────────────────────────────────────
// Source of truth: LockBenefitV02.sol constants
// BRONZE_DISCOUNT_BPS=2000, SILVER_DISCOUNT_BPS=4000, GOLD_DISCOUNT_BPS=6000
// BRONZE_MULTIPLIER_BPS=10000 (1.0×), SILVER=13000 (1.3×), GOLD=18000 (1.8×)
const TIERS = [
  {
    id: 0,
    label: 'Standard',
    name: 'Bronze',
    duration: 2592000,    // 30 days (BRONZE_MIN)
    feeDiscountBps: 2000, // 20%
    multiplierBps: 10000, // 1.0×
    icon: 'token',
    badge: null,
  },
  {
    id: 1,
    label: 'Enhanced',
    name: 'Silver',
    duration: 7776000,    // 90 days (SILVER_MIN)
    feeDiscountBps: 4000, // 40%
    multiplierBps: 13000, // 1.3×
    icon: 'workspace_premium',
    badge: 'Most Popular',
  },
  {
    id: 2,
    label: 'Premium',
    name: 'Gold',
    duration: 15552000,   // 180 days (GOLD_MIN)
    feeDiscountBps: 6000, // 60%
    multiplierBps: 18000, // 1.8×
    icon: 'military_tech',
    badge: null,
  },
] as const

type TierId = 0 | 1 | 2

// ── Maturity date helper ──────────────────────────────────────────────────────
function maturityDate(durationSeconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  return formatDate(now + durationSeconds)
}

// ── Lock row type ─────────────────────────────────────────────────────────────
interface LockData {
  lockId: bigint
  owner: Address
  shares: bigint
  lockedAt: bigint
  unlockAt: bigint
  unlocked: boolean
  earlyExited: boolean
}

// ── Tier badge chip ───────────────────────────────────────────────────────────
function TierChip({ tierId }: { tierId: number }) {
  const tier = TIERS[tierId as TierId]
  if (!tier) return <span className="text-on-surface-variant text-xs">—</span>
  const colors: Record<number, string> = {
    0: 'bg-secondary-container text-on-secondary-container',
    1: 'bg-surface-container-high text-on-surface',
    2: 'bg-primary-fixed text-on-primary-container',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${colors[tierId] ?? colors[0]}`}
    >
      <span className="material-symbols-outlined text-sm">{tier.icon}</span>
      {tier.name}
    </span>
  )
}

// ── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ lock }: { lock: LockData }) {
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (lock.earlyExited)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-error-container text-on-error-container">
        <span className="material-symbols-outlined text-sm">logout</span>
        Early Exit
      </span>
    )
  if (lock.unlocked)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-secondary-container text-on-secondary-container">
        <span className="material-symbols-outlined text-sm">lock_open</span>
        Unlocked
      </span>
    )
  if (lock.unlockAt <= now)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-fixed text-on-primary-container">
        <span className="material-symbols-outlined text-sm">lock_open_right</span>
        Ready
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-tertiary-container text-on-tertiary-container">
      <span className="material-symbols-outlined text-sm">lock</span>
      Locked
    </span>
  )
}

// ── Active positions table ────────────────────────────────────────────────────
function PositionsTable({
  lockIds,
  onRefetch,
}: {
  lockIds: readonly bigint[]
  onRefetch: () => void
}) {
  const displayIds = lockIds.slice(0, 5)
  const now = BigInt(Math.floor(Date.now() / 1000))

  // Batch read getLock for each id
  const { data: lockReads, refetch: refetchLocks } = useReadContracts({
    contracts: displayIds.map((id) => ({
      address: ADDR.LockLedgerV02 as Address,
      abi: LEDGER_ABI,
      functionName: 'getLock',
      args: [id],
    })),
    query: { enabled: displayIds.length > 0 },
  })

  // Batch read tierOf for each id
  const { data: tierReads } = useReadContracts({
    contracts: displayIds.map((id) => ({
      address: ADDR.LockBenefitV02 as Address,
      abi: BENEFIT_ABI,
      functionName: 'tierOf',
      args: [id],
    })),
    query: { enabled: displayIds.length > 0 },
  })

  // Batch read previewRebate for each id
  const { data: rebateReads } = useReadContracts({
    contracts: displayIds.map((id) => ({
      address: ADDR.LockRewardManagerV02 as Address,
      abi: LOCK_MGR_ABI,
      functionName: 'previewRebate',
      args: [id],
    })),
    query: { enabled: displayIds.length > 0 },
  })

  // Batch read checkEarlyExit for each id
  const { data: earlyExitReads } = useReadContracts({
    contracts: displayIds.map((id) => ({
      address: ADDR.LockRewardManagerV02 as Address,
      abi: LOCK_MGR_ABI,
      functionName: 'checkEarlyExit',
      args: [id],
    })),
    query: { enabled: displayIds.length > 0 },
  })

  // Write: unlock
  const { writeContract: writeUnlock, data: unlockHash, isPending: unlockPending, error: unlockError } =
    useWriteContract()
  const { isLoading: unlockConfirming, isSuccess: unlockSuccess } = useWaitForTransactionReceipt({ hash: unlockHash })

  // Write: claimRebate
  const { writeContract: writeClaim, data: claimHash, isPending: claimPending, error: claimError } =
    useWriteContract()
  const { isSuccess: claimSuccess } = useWaitForTransactionReceipt({ hash: claimHash })

  // Write: approve RWT to LockRewardManagerV02 (required before earlyExitWithReturn)
  const { writeContract: writeApproveRwt, data: approveRwtHash, isPending: approveRwtPending, error: approveRwtError } =
    useWriteContract()
  const { isSuccess: approveRwtSuccess } = useWaitForTransactionReceipt({ hash: approveRwtHash })

  // Write: earlyExitWithReturn
  const { writeContract: writeEarlyExit, data: earlyExitHash, isPending: earlyExitPending, error: earlyExitError } =
    useWriteContract()
  const { isSuccess: earlyExitSuccess } = useWaitForTransactionReceipt({ hash: earlyExitHash })

  const positionError = unlockError ?? claimError ?? approveRwtError ?? earlyExitError

  // Refetch after any success
  useEffect(() => {
    if (unlockSuccess || claimSuccess || earlyExitSuccess) {
      refetchLocks()
      onRefetch()
    }
  }, [unlockSuccess, claimSuccess, earlyExitSuccess])

  // Refetch early exit reads after RWT approval so allowance updates
  useEffect(() => {
    if (approveRwtSuccess) refetchLocks()
  }, [approveRwtSuccess])

  if (displayIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined text-4xl">lock_open</span>
        <p className="font-semibold text-sm">No active locks</p>
        <p className="text-xs">Lock fbUSDC above to start earning fee rebates.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {positionError && (
        <div className="flex items-start gap-2 text-xs bg-error-container text-on-error-container rounded-xl px-3 py-2">
          <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">error</span>
          <span>{parseTxError(positionError)}</span>
        </div>
      )}
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-y-1">
        <thead>
          <tr className="text-xs text-on-surface-variant uppercase tracking-wider">
            <th className="text-left py-2 px-3 font-semibold">Lock ID</th>
            <th className="text-left py-2 px-3 font-semibold">Amount</th>
            <th className="text-left py-2 px-3 font-semibold">Locked At</th>
            <th className="text-left py-2 px-3 font-semibold">Unlocks At</th>
            <th className="text-left py-2 px-3 font-semibold">Tier</th>
            <th className="text-left py-2 px-3 font-semibold">Rebate</th>
            <th className="text-left py-2 px-3 font-semibold">Status</th>
            <th className="text-right py-2 px-3 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {displayIds.map((id, i) => {
            const rawResult = lockReads?.[i]?.result
            if (rawResult == null) return null

            // viem v2 returns named tuple components as an object: { owner, shares, lockedAt, ... }
            // Defensive: also support flat array form in case of viem version differences
            const ro = rawResult as Record<string, unknown>
            const ra = rawResult as unknown as readonly unknown[]
            const pick = (name: string, idx: number): unknown =>
              ro[name] !== undefined ? ro[name] : ra[idx]

            const lock: LockData = {
              lockId:      id,
              owner:       pick('owner', 0) as Address,
              shares:      typeof pick('shares', 1) === 'bigint' ? pick('shares', 1) as bigint : 0n,
              lockedAt:    typeof pick('lockedAt', 2) === 'bigint' ? pick('lockedAt', 2) as bigint : 0n,
              unlockAt:    typeof pick('unlockAt', 3) === 'bigint' ? pick('unlockAt', 3) as bigint : 0n,
              unlocked:    (pick('unlocked', 4) as boolean) ?? false,
              earlyExited: (pick('earlyExited', 5) as boolean) ?? false,
            }

            const tierId = (tierReads?.[i]?.result as number | undefined) ?? 0
            const rebate = (rebateReads?.[i]?.result as bigint | undefined) ?? 0n
            const canUnlock    = !lock.unlocked && !lock.earlyExited && lock.unlockAt <= now
            const canEarlyExit = !lock.unlocked && !lock.earlyExited && lock.unlockAt > now

            // checkEarlyExit: viem v2 returns named object or array — handle both
            const eeRaw = earlyExitReads?.[i]?.result
            const eeO = eeRaw as Record<string, unknown> | undefined
            const eeA = eeRaw as unknown as readonly bigint[] | undefined
            const eeP = (name: string, idx: number): bigint =>
              eeO && eeO[name] !== undefined ? eeO[name] as bigint : (eeA?.[idx] ?? 0n)
            const earlyExitInfo = eeRaw ? {
              rebateShares:           eeP('rebateShares', 0),
              tokensToReturn:         eeP('tokensToReturn', 1),
              treasuryShareBalance:   eeP('treasuryShareBalance', 2),
              treasuryShareAllowance: eeP('treasuryShareAllowance', 3),
              userTokenBalance:       eeP('userTokenBalance', 4),
              userTokenAllowance:     eeP('userTokenAllowance', 5),
            } : undefined
            // User needs to approve LockRewardManagerV02 to pull RWT before early exit
            const needsRwtApprove = canEarlyExit && earlyExitInfo != null &&
              earlyExitInfo.tokensToReturn > 0n &&
              earlyExitInfo.userTokenAllowance < earlyExitInfo.tokensToReturn
            // Remaining lock days
            const remainingDays = lock.unlockAt > now
              ? Math.ceil(Number(lock.unlockAt - now) / 86400)
              : 0

            return (
              <tr
                key={id.toString()}
                className="bg-surface-container-lowest hover:bg-surface-container rounded-xl transition-colors"
              >
                <td className="py-3 px-3 rounded-l-xl font-mono text-on-surface-variant text-xs">
                  #{id.toString()}
                </td>
                <td className="py-3 px-3 font-semibold text-on-surface">
                  {formatShares(lock.shares)} <span className="text-on-surface-variant font-normal">fbUSDC</span>
                </td>
                <td className="py-3 px-3 text-on-surface-variant text-xs">
                  {formatDate(Number(lock.lockedAt))}
                </td>
                <td className="py-3 px-3 text-on-surface-variant text-xs">
                  {formatDate(Number(lock.unlockAt))}
                </td>
                <td className="py-3 px-3">
                  <TierChip tierId={tierId} />
                </td>
                <td className="py-3 px-3 text-on-surface text-xs font-medium">
                  {formatShares(rebate)} <span className="text-on-surface-variant">fbUSDC</span>
                </td>
                <td className="py-3 px-3">
                  <StatusChip lock={lock} />
                </td>
                <td className="py-3 px-3 rounded-r-xl text-right">
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center justify-end gap-2">
                      {canUnlock && (
                        <button
                          disabled={unlockPending || unlockConfirming}
                          onClick={() =>
                            writeUnlock({
                              address: ADDR.LockLedgerV02 as Address,
                              abi: LEDGER_ABI,
                              functionName: 'unlock',
                              args: [id],
                            })
                          }
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-primary text-on-primary hover:bg-primary-dim transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {unlockPending
                            ? <><span className="w-3 h-3 rounded-full border-2 border-on-primary border-t-transparent animate-spin" />Signing…</>
                            : unlockConfirming
                            ? <><span className="w-3 h-3 rounded-full border-2 border-on-primary border-t-transparent animate-spin" />Confirming…</>
                            : 'Unlock'}
                        </button>
                      )}
                      {unlockSuccess && unlockHash && (
                        <a
                          href={`https://basescan.org/tx/${unlockHash}`}
                          target="_blank" rel="noreferrer"
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-primary-fixed text-on-primary-container flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          Done
                        </a>
                      )}
                      {!lock.unlocked && !lock.earlyExited && rebate > 0n && (
                        <button
                          disabled={claimPending}
                          onClick={() =>
                            writeClaim({
                              address: ADDR.LockRewardManagerV02 as Address,
                              abi: LOCK_MGR_ABI,
                              functionName: 'claimRebate',
                              args: [id],
                            })
                          }
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-primary-fixed text-on-primary-container hover:bg-primary-container transition-colors disabled:opacity-50"
                        >
                          Claim Rebate
                        </button>
                      )}
                      {/* Early exit: single button, two-step internally when RWT approval needed */}
                      {canEarlyExit && (
                        <div className="flex flex-col items-end gap-1">
                          {needsRwtApprove && earlyExitInfo && earlyExitInfo.tokensToReturn > 0n && (
                            <div className="flex items-center gap-1 text-[10px] text-on-surface-variant/70">
                              <span className="font-semibold text-primary">1</span>
                              <span>Authorize</span>
                              <span className="text-outline-variant">›</span>
                              <span className="text-on-surface-variant/40">2</span>
                              <span className="text-on-surface-variant/40">Exit</span>
                            </div>
                          )}
                          {!needsRwtApprove && earlyExitInfo && earlyExitInfo.tokensToReturn > 0n && !earlyExitSuccess && (
                            <div className="flex items-center gap-1 text-[10px] text-on-surface-variant/70">
                              <span className="text-on-surface-variant/40">1</span>
                              <span className="text-on-surface-variant/40">Authorize</span>
                              <span className="text-outline-variant">›</span>
                              <span className="font-semibold text-primary">2</span>
                              <span>Exit</span>
                            </div>
                          )}
                          <button
                            disabled={needsRwtApprove ? approveRwtPending : earlyExitPending}
                            onClick={() =>
                              needsRwtApprove
                                ? writeApproveRwt({
                                    address: ADDR.RewardToken as Address,
                                    abi: RWT_ABI,
                                    functionName: 'approve',
                                    args: [ADDR.LockRewardManagerV02 as Address, earlyExitInfo!.tokensToReturn],
                                  })
                                : writeEarlyExit({
                                    address: ADDR.LockRewardManagerV02 as Address,
                                    abi: LOCK_MGR_ABI,
                                    functionName: 'earlyExitWithReturn',
                                    args: [id],
                                  })
                            }
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-error-container text-on-error-container hover:bg-error hover:text-on-error transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {(needsRwtApprove ? approveRwtPending : earlyExitPending)
                              ? <><span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />Signing…</>
                              : 'Early Exit'}
                          </button>
                        </div>
                      )}
                      {lock.unlocked && (
                        <span className="text-xs text-on-surface-variant italic">Completed</span>
                      )}
                      {lock.earlyExited && (
                        <span className="text-xs text-error italic">Exited</span>
                      )}
                      {!canUnlock && !canEarlyExit && !lock.unlocked && !lock.earlyExited && rebate === 0n && (
                        <span className="text-xs text-on-surface-variant">—</span>
                      )}
                    </div>
                    {/* Early exit info hint */}
                    {canEarlyExit && earlyExitInfo && earlyExitInfo.tokensToReturn > 0n && (
                      <p className="text-[10px] text-error/70 text-right leading-tight">
                        Penalty: return {formatRWT(earlyExitInfo.tokensToReturn)} RWT ·{' '}
                        {remainingDays}d remaining
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {lockIds.length > 5 && (
        <p className="text-xs text-on-surface-variant text-center py-3">
          Showing 5 of {lockIds.length} locks.
        </p>
      )}
    </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Lock() {
  const { address, isConnected } = useAccount()

  const [selectedTier, setSelectedTier] = useState<TierId>(1)
  const [lockAmount, setLockAmount] = useState('')

  const tier = TIERS[selectedTier]

  const parsedLockAmount: bigint = (() => {
    try {
      return lockAmount && Number(lockAmount) > 0 ? parseUnits(lockAmount, 18) : 0n
    } catch {
      return 0n
    }
  })()

  // ── Read vault balance + allowance to lock manager ─────────────────────────
  const { data: vaultReads, refetch: refetchVaultReads } = useReadContracts({
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
        functionName: 'allowance',
        args: [
          address ?? '0x0000000000000000000000000000000000000000',
          ADDR.LockLedgerV02 as Address,
        ],
      },
    ],
    query: { enabled: true },
  })

  const fbUsdcBalance: bigint = (vaultReads?.[0]?.result as bigint) ?? 0n
  const lockMgrAllowance: bigint = (vaultReads?.[1]?.result as bigint) ?? 0n

  // ── Read user lock IDs ─────────────────────────────────────────────────────
  const { data: lockIdsRaw, refetch: refetchLockIds } = useReadContract({
    address: ADDR.LockLedgerV02 as Address,
    abi: LEDGER_ABI,
    functionName: 'userLockIds',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: isConnected },
  })

  const lockIds = (lockIdsRaw as bigint[] | undefined) ?? []

  // ── Batch read all lock data to compute truly free balance ─────────────────
  const { data: allLockReads } = useReadContracts({
    contracts: lockIds.map((id) => ({
      address: ADDR.LockLedgerV02 as Address,
      abi: LEDGER_ABI,
      functionName: 'getLock',
      args: [id],
    })),
    query: { enabled: lockIds.length > 0 },
  })

  const lockedShares: bigint = (allLockReads ?? []).reduce((sum, r) => {
    const rawResult = r.result
    if (rawResult == null) return sum
    // viem v2: named tuple → object; fallback to array index
    const ro = rawResult as Record<string, unknown>
    const ra = rawResult as unknown as readonly unknown[]
    const pick = (name: string, idx: number): unknown =>
      ro[name] !== undefined ? ro[name] : ra[idx]
    const unlocked    = pick('unlocked', 4) as boolean
    const earlyExited = pick('earlyExited', 5) as boolean
    if (unlocked || earlyExited) return sum
    const shares = pick('shares', 1)
    return sum + (typeof shares === 'bigint' ? shares : 0n)
  }, 0n)

  const freeBalance = fbUsdcBalance > lockedShares ? fbUsdcBalance - lockedShares : 0n

  // ── Write: approve vault shares to LockRewardManagerV02 ───────────────────
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: approvePending,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract()

  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTxHash })

  useEffect(() => {
    if (approveSuccess) {
      refetchVaultReads()
      resetApprove()
    }
  }, [approveSuccess])

  // ── Write: lockWithReward ──────────────────────────────────────────────────
  const {
    writeContract: writeLock,
    data: lockTxHash,
    isPending: lockPending,
    error: lockError,
    reset: resetLock,
  } = useWriteContract()

  const { isLoading: lockConfirming, isSuccess: lockSuccess } =
    useWaitForTransactionReceipt({ hash: lockTxHash })

  useEffect(() => {
    if (lockSuccess) {
      refetchVaultReads()
      refetchLockIds()
      setLockAmount('')
      resetLock()
    }
  }, [lockSuccess])

  // ── Derived ────────────────────────────────────────────────────────────────
  const needsApproval =
    isConnected && parsedLockAmount > 0n && lockMgrAllowance < parsedLockAmount

  const approveInFlight = approvePending || approveConfirming
  const lockInFlight = lockPending || lockConfirming

  // ── Lock button logic ──────────────────────────────────────────────────────
  function getLockButtonProps(): {
    label: string
    disabled: boolean
    onClick?: () => void
    isApprove?: boolean
  } {
    if (!isConnected) return { label: 'Connect Wallet', disabled: true }
    if (!lockAmount || Number(lockAmount) <= 0) return { label: 'Enter Amount', disabled: true }
    if (parsedLockAmount > freeBalance) return { label: 'Insufficient fbUSDC', disabled: true }
    if (approveInFlight) return { label: 'Approving…', disabled: true }
    if (lockInFlight) return { label: 'Locking…', disabled: true }
    if (needsApproval)
      return {
        label: 'Approve fbUSDC',
        disabled: false,
        isApprove: true,
        onClick: () =>
          writeApprove({
            address: ADDR.FundVaultV01 as Address,
            abi: VAULT_ABI,
            functionName: 'approve',
            args: [ADDR.LockLedgerV02 as Address, parsedLockAmount],
          }),
      }
    return {
      label: 'Lock fbUSDC',
      disabled: false,
      onClick: () =>
        writeLock({
          address: ADDR.LockRewardManagerV02 as Address,
          abi: LOCK_MGR_ABI,
          functionName: 'lockWithReward',
          args: [parsedLockAmount, BigInt(tier.duration)],
        }),
    }
  }

  const lockBtn = getLockButtonProps()

  function handleMaxLock() {
    if (freeBalance > 0n) {
      setLockAmount(formatUnits(freeBalance, 18))
    }
  }

  function shortHash(hash: string) {
    return `${hash.slice(0, 10)}…${hash.slice(-8)}`
  }

  return (
    <div className="space-y-8">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-on-surface">Lock & Rewards</h2>
        <p className="text-on-surface-variant text-sm mt-1">
          Commitment layer — lock fbUSDC shares to earn fee rebates and RWT issuance.
          Locked shares remain in your on-chain position and accrue NAV growth.
        </p>
      </div>

      {/* ── Tier selection ────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4">
          Select Tier
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TIERS.map((t) => {
            const isSelected = selectedTier === t.id
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTier(t.id as TierId)}
                className={[
                  'relative flex flex-col gap-4 p-5 rounded-xl border text-left transition-all',
                  isSelected
                    ? 'ring-2 ring-primary border-primary bg-primary-fixed/20 shadow-sm'
                    : 'border-outline-variant/50 bg-surface-container-lowest hover:bg-surface-container-low hover:border-outline-variant',
                ].join(' ')}
              >
                {/* Badge */}
                {t.badge && (
                  <div className="absolute top-3 right-3">
                    <span className="text-xs font-bold bg-primary text-on-primary px-2 py-0.5 rounded-full">
                      {t.badge}
                    </span>
                  </div>
                )}

                {/* Icon + tier name */}
                <div className="flex items-center gap-3">
                  <div
                    className={[
                      'w-10 h-10 rounded-xl flex items-center justify-center',
                      isSelected
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface-variant',
                    ].join(' ')}
                  >
                    <span className="material-symbols-outlined text-xl">{t.icon}</span>
                  </div>
                  <div>
                    <div className="font-bold text-on-surface">{t.name}</div>
                    <div className="text-xs text-on-surface-variant">{t.label}</div>
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Duration</span>
                    <span className="font-semibold text-on-surface">
                      {secondsToDuration(t.duration)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Reward Multiplier</span>
                    <span className="font-semibold text-on-surface">
                      {(t.multiplierBps / 10000).toFixed(1)}×
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Fee Rebate</span>
                    <span className="font-bold text-primary">
                      {(t.feeDiscountBps / 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Lock configuration + preview ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left: configuration panel */}
        <div className="lg:col-span-7 bg-surface-container-low rounded-xl p-8 space-y-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">lock</span>
            <h3 className="font-bold text-on-surface text-lg">Configuration</h3>
          </div>

          {/* Available balance */}
          <div className="flex items-center justify-between bg-surface-container rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-on-surface-variant text-sm">
              <span className="material-symbols-outlined text-base">account_balance_wallet</span>
              Available to Lock
            </div>
            <span className="font-bold text-on-surface text-sm">
              {isConnected ? `${formatShares(freeBalance)} fbUSDC` : '—'}
            </span>
          </div>

          {/* Amount input */}
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">
              Lock Amount (fbUSDC)
            </label>
            <div className="flex items-center gap-2 bg-surface-container-lowest rounded-xl px-4 py-3 border border-outline-variant/60 focus-within:border-primary transition-colors">
              <input
                type="number"
                min="0"
                placeholder="0.0000"
                value={lockAmount}
                onChange={(e) => setLockAmount(e.target.value)}
                className="flex-1 bg-transparent text-on-surface text-lg font-semibold outline-none placeholder:text-on-surface-variant/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-on-surface-variant text-sm font-medium">fbUSDC</span>
              <button
                onClick={handleMaxLock}
                className="text-xs font-bold text-primary bg-primary-fixed px-2 py-1 rounded-lg hover:bg-primary hover:text-on-primary transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Info box */}
          <div className="flex items-start gap-3 bg-primary-fixed/40 text-on-primary-container rounded-xl px-4 py-3">
            <span className="material-symbols-outlined text-base mt-0.5 shrink-0">info</span>
            <p className="text-xs leading-relaxed">
              Using <span className="font-semibold">lockWithReward</span>. RWT reward tokens
              will be issued at lock time proportional to the amount and duration selected.
              Approval of fbUSDC to the Lock Reward Manager is required before locking.
            </p>
          </div>

          {/* Step indicator */}
          {isConnected && lockAmount && Number(lockAmount) > 0 && (
            <div className="flex items-center gap-0">
              {[
                { label: 'Approve', done: !needsApproval, active: needsApproval || approveInFlight },
                { label: 'Lock',    done: lockSuccess,    active: !needsApproval && !lockSuccess },
                { label: 'Done',    done: lockSuccess,    active: lockSuccess },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <div className={[
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                      step.done
                        ? 'bg-primary text-on-primary'
                        : step.active
                        ? 'bg-secondary text-on-secondary ring-2 ring-secondary/40'
                        : 'bg-surface-container text-on-surface-variant',
                    ].join(' ')}>
                      {step.done
                        ? <span className="material-symbols-outlined text-sm">check</span>
                        : <span>{i + 1}</span>}
                    </div>
                    <span className={[
                      'text-[10px] font-semibold',
                      step.active ? 'text-secondary' : step.done ? 'text-primary' : 'text-on-surface-variant/50',
                    ].join(' ')}>{step.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div className={[
                      'h-0.5 flex-1 mb-4 transition-colors',
                      arr[i + 1].done || arr[i + 1].active ? 'bg-primary' : 'bg-outline-variant/40',
                    ].join(' ')} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Lock button */}
          <button
            disabled={lockBtn.disabled}
            onClick={lockBtn.onClick}
            className={[
              'w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all',
              lockBtn.disabled
                ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                : lockBtn.isApprove
                ? 'bg-secondary text-on-secondary hover:opacity-90 active:scale-[0.99] shadow-sm'
                : 'bg-primary text-on-primary hover:bg-primary-dim active:scale-[0.99] shadow-sm',
            ].join(' ')}
          >
            {lockBtn.label}
          </button>

          {/* Tx error */}
          {(approveError || lockError) && (
            <div className="flex items-start gap-2 text-xs bg-error-container text-on-error-container rounded-xl px-3 py-2">
              <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">error</span>
              <span>{parseTxError(approveError ?? lockError)}</span>
            </div>
          )}

          {/* Tx hash */}
          {lockTxHash && (
            <div className="flex items-center gap-2 text-xs bg-primary-fixed text-on-primary-container rounded-xl px-3 py-2">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              Lock confirmed:{' '}
              <a
                href={`https://basescan.org/tx/${lockTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="underline font-mono"
              >
                {shortHash(lockTxHash)}
              </a>
            </div>
          )}
        </div>

        {/* Right: lock preview */}
        <div className="lg:col-span-5 bg-surface-container-high rounded-xl p-8 space-y-5 flex flex-col">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant">
              preview
            </span>
            <h3 className="font-bold text-on-surface text-lg">Lock Preview</h3>
          </div>

          <div className="space-y-3 flex-1">
            {/* Tier + fee rebate combined */}
            <div className="flex justify-between items-center py-2 border-b border-outline-variant/30">
              <span className="text-sm text-on-surface-variant">Tier</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-on-surface text-sm">{tier.name}</span>
                <span className="text-xs font-bold text-primary bg-primary-fixed px-1.5 py-0.5 rounded-full">
                  {(tier.feeDiscountBps / 100).toFixed(0)}% rebate
                </span>
              </div>
            </div>

            {/* Maturity date */}
            <div className="flex justify-between items-center py-2 border-b border-outline-variant/30">
              <span className="text-sm text-on-surface-variant">Maturity Date</span>
              <span className="font-semibold text-on-surface text-sm">
                {maturityDate(tier.duration)}
              </span>
            </div>

            {/* Lock amount */}
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-on-surface-variant">Lock Amount</span>
              <span className="font-semibold text-on-surface text-sm">
                {lockAmount && Number(lockAmount) > 0
                  ? `${lockAmount} fbUSDC`
                  : '—'}
              </span>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 bg-error-container/30 text-on-error-container rounded-xl px-3 py-3 text-xs">
            <span className="material-symbols-outlined text-sm mt-0.5 shrink-0">warning</span>
            <span className="leading-relaxed">
              Non-redeemable before maturity. Early exit incurs RWT forfeiture and may be
              subject to additional protocol penalties.
            </span>
          </div>
        </div>
      </div>

      {/* ── Active positions ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-on-surface text-lg">Active Positions</h3>
            <p className="text-on-surface-variant text-xs mt-0.5">
              {isConnected
                ? lockIds.length > 0
                  ? `${lockIds.length} lock${lockIds.length > 1 ? 's' : ''} found`
                  : 'No locks found for this address'
                : 'Connect wallet to view positions'}
            </p>
          </div>
          {isConnected && lockIds.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant bg-surface-container px-3 py-1.5 rounded-full">
              <span className="material-symbols-outlined text-sm">info</span>
              Showing up to 5 most recent
            </div>
          )}
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-4">
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl">account_circle</span>
              <p className="font-semibold text-sm">Wallet not connected</p>
              <p className="text-xs">Connect your wallet to see your lock positions.</p>
            </div>
          ) : (
            <PositionsTable
              lockIds={lockIds as bigint[]}
              onRefetch={() => {
                refetchVaultReads()
                refetchLockIds()
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
