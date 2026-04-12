import { useState, useEffect } from 'react'
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { ADDR, VAULT_ABI, USDC_ABI, STRAT_MGR_ABI, AAVE_POOL_ABI, AAVE_V3_POOL_BASE } from '../lib/contracts'
import { formatUSDC, formatShares } from '../lib/format'
import { parseTxError } from '../lib/txError'

type Tab = 'deposit' | 'redeem'

// ── Emergency Exit Panel ──────────────────────────────────────────────────────
type ExitRound = {
  snapshotId: bigint
  snapshotTotalSupply: bigint
  availableAssets: bigint
  totalClaimed: bigint
  isOpen: boolean
  snapshotTimestamp: bigint
}

function EmergencyExitPanel({ userShares }: { userShares: bigint }) {
  const { address } = useAccount()
  const [burnAmount, setBurnAmount] = useState('')
  const [txHash, setTxHash]   = useState<`0x${string}` | undefined>()
  const [txError, setTxError] = useState('')

  const { data: roundId, refetch: refetchRoundId, isLoading: roundIdLoading } = useReadContract({
    address: ADDR.FundVaultV01 as Address,
    abi: VAULT_ABI,
    functionName: 'currentRoundId',
  })

  const { data: roundData, refetch: refetchRound } = useReadContract({
    address: ADDR.FundVaultV01 as Address,
    abi: VAULT_ABI,
    functionName: 'exitRounds',
    args: [roundId as bigint],
    query: { enabled: !!roundId && (roundId as bigint) > 0n },
  })

  const { data: alreadyClaimed, refetch: refetchClaimed } = useReadContract({
    address: ADDR.FundVaultV01 as Address,
    abi: VAULT_ABI,
    functionName: 'roundSharesClaimed',
    args: [roundId as bigint, address as Address],
    query: { enabled: !!roundId && (roundId as bigint) > 0n && !!address },
  })

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isTxPending, isSuccess: isTxSuccess } =
    useWaitForTransactionReceipt({ hash: txHash })

  const round = roundData as ExitRound | undefined
  const claimed = (alreadyClaimed as bigint | undefined) ?? 0n
  const parsedBurn: bigint = (() => {
    try { return burnAmount && Number(burnAmount) > 0 ? parseUnits(burnAmount, 18) : 0n }
    catch { return 0n }
  })()

  // Estimated USDC out for this burn amount
  const estimatedOut = round && round.snapshotTotalSupply > 0n
    ? (parsedBurn * round.availableAssets) / round.snapshotTotalSupply
    : 0n

  const handleClaim = async () => {
    if (!roundId || parsedBurn === 0n) return
    setTxError('')
    try {
      const hash = await writeContractAsync({
        address: ADDR.FundVaultV01 as Address,
        abi: VAULT_ABI,
        functionName: 'claimExitAssets',
        args: [roundId as bigint, parsedBurn],
      })
      setTxHash(hash)
      setBurnAmount('')
      refetchRoundId()
      refetchRound()
      refetchClaimed()
    } catch (e) {
      setTxError(parseTxError(e))
    }
  }

  const noRound = !roundId || (roundId as bigint) === 0n
  const roundClosed = round && !round.isOpen

  return (
    <div className="border-2 border-error rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-error px-5 py-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-on-error text-xl">emergency</span>
        <span className="text-on-error font-bold text-sm tracking-wide uppercase">
          Emergency Exit Mode
        </span>
      </div>

      <div className="bg-error-container/30 px-5 py-4 space-y-4">
        <p className="text-sm text-on-error-container leading-relaxed">
          The protocol is in Emergency Exit mode. Normal deposits and redeems are disabled.
          Burn your fbUSDC shares below to claim a pro-rata share of the available USDC.
        </p>

        {roundIdLoading ? (
          <div className="bg-surface-container rounded-lg px-4 py-3 text-sm text-on-surface-variant flex items-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-on-surface-variant border-t-transparent animate-spin shrink-0" />
            Loading exit round status…
          </div>
        ) : noRound ? (
          <div className="bg-surface-container rounded-lg px-4 py-3 text-sm text-on-surface-variant">
            No exit round has been opened yet. The admin must call{' '}
            <code className="font-mono text-xs bg-surface-container-high px-1 rounded">openExitModeRound()</code>{' '}
            first to make USDC available for claims.
          </div>
        ) : roundClosed ? (
          <div className="bg-surface-container rounded-lg px-4 py-3 text-sm text-on-surface-variant">
            Round #{(roundId as bigint).toString()} is closed. Wait for the admin to open a new round.
          </div>
        ) : round ? (
          <div className="space-y-4">
            {/* Round stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-surface-container-lowest rounded-lg px-3 py-2.5">
                <p className="text-xs text-on-surface-variant mb-0.5">Round</p>
                <p className="font-bold text-on-surface text-sm">#{(roundId as bigint).toString()}</p>
              </div>
              <div className="bg-surface-container-lowest rounded-lg px-3 py-2.5">
                <p className="text-xs text-on-surface-variant mb-0.5">Available USDC</p>
                <p className="font-bold text-on-surface text-sm">${formatUSDC(round.availableAssets)}</p>
              </div>
              <div className="bg-surface-container-lowest rounded-lg px-3 py-2.5">
                <p className="text-xs text-on-surface-variant mb-0.5">Already Claimed (you)</p>
                <p className="font-bold text-on-surface text-sm">{formatShares(claimed)} fbUSDC</p>
              </div>
            </div>

            {/* Burn input */}
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">
                Shares to Burn (fbUSDC)
              </label>
              <div className="flex items-center gap-2 bg-surface-container-lowest rounded-xl px-4 py-3 border border-outline-variant/60 focus-within:border-error transition-colors">
                <input
                  type="number"
                  min="0"
                  placeholder="0.0000"
                  value={burnAmount}
                  onChange={e => setBurnAmount(e.target.value)}
                  className="flex-1 bg-transparent text-on-surface text-lg font-semibold outline-none placeholder:text-on-surface-variant/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-on-surface-variant text-sm font-medium">fbUSDC</span>
                <button
                  onClick={() => userShares > 0n && setBurnAmount(formatUnits(userShares, 18))}
                  className="text-xs font-bold text-error bg-error-container px-2 py-1 rounded-lg hover:bg-error hover:text-on-error transition-colors"
                >
                  MAX
                </button>
              </div>
              {parsedBurn > 0n && estimatedOut > 0n && (
                <p className="text-xs text-on-surface-variant mt-1.5">
                  Estimated receive: <span className="font-semibold">${formatUSDC(estimatedOut)} USDC</span>
                  <span className="ml-2 text-on-surface-variant/60">(pro-rata, before any rounding)</span>
                </p>
              )}
            </div>

            {/* Error */}
            {txError && (
              <div className="flex items-start gap-2 text-xs bg-error-container text-on-error-container rounded-xl px-3 py-2">
                <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">error</span>
                <span>{txError}</span>
              </div>
            )}

            {/* Tx hash */}
            {txHash && (
              <div className="flex items-center gap-2 text-xs bg-primary-fixed text-on-primary-container rounded-xl px-3 py-2">
                <span className="material-symbols-outlined text-sm">
                  {isTxPending ? 'progress_activity' : 'check_circle'}
                </span>
                {isTxSuccess ? 'Claimed successfully' : 'Confirming…'}
                <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" className="ml-auto underline">
                  View
                </a>
              </div>
            )}

            {/* Claim button */}
            <button
              disabled={parsedBurn === 0n || parsedBurn > userShares || isPending}
              onClick={handleClaim}
              className="w-full py-3 rounded-xl text-sm font-bold bg-error text-on-error hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {isPending ? 'Submitting…' : 'Claim Exit Assets'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Step stepper ─────────────────────────────────────────────────────────────
type StepStatus = 'idle' | 'active' | 'done'

interface Step {
  label: string
  status: StepStatus
}

function Stepper({ steps }: { steps: Step[] }) {
  return (
    <div className="flex items-center gap-0 w-full">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div
              className={[
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                step.status === 'done'
                  ? 'bg-primary text-on-primary'
                  : step.status === 'active'
                  ? 'bg-primary-container text-on-primary-container ring-2 ring-primary'
                  : 'bg-surface-container text-on-surface-variant',
              ].join(' ')}
            >
              {step.status === 'done' ? (
                <span className="material-symbols-outlined text-base">check</span>
              ) : (
                i + 1
              )}
            </div>
            <span
              className={[
                'text-xs font-medium whitespace-nowrap',
                step.status === 'active'
                  ? 'text-primary'
                  : step.status === 'done'
                  ? 'text-on-surface'
                  : 'text-on-surface-variant',
              ].join(' ')}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={[
                'flex-1 h-0.5 mx-2 rounded transition-colors',
                step.status === 'done' ? 'bg-primary' : 'bg-outline-variant',
              ].join(' ')}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: string
  label: string
  value: React.ReactNode
  sub?: string
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-4 flex flex-col gap-2 border border-outline-variant/40">
      <div className="flex items-center gap-2 text-on-surface-variant">
        <span className="material-symbols-outlined text-lg">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-bold text-on-surface leading-tight">{value}</div>
      {sub && <div className="text-xs text-on-surface-variant">{sub}</div>}
    </div>
  )
}

// ── System mode badge ─────────────────────────────────────────────────────────
function ModeBadge({ mode }: { mode: number | undefined }) {
  if (mode === undefined) return <span className="text-on-surface-variant text-sm">—</span>
  const cfg =
    mode === 0
      ? { label: 'Normal', cls: 'bg-primary-fixed text-on-primary-container' }
      : mode === 1
      ? { label: 'Paused', cls: 'bg-error-container text-on-error-container' }
      : { label: 'Emergency', cls: 'bg-error text-on-error' }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${mode === 0 ? 'bg-primary' : 'bg-error'}`}
      />
      {cfg.label}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Vault() {
  const { address, isConnected } = useAccount()

  const [tab, setTab] = useState<Tab>('deposit')
  const [amount, setAmount] = useState('')

  // Derived parsed amounts
  const parsedDepositAmount: bigint = (() => {
    try {
      return amount && Number(amount) > 0 ? parseUnits(amount, 6) : 0n
    } catch {
      return 0n
    }
  })()

  const parsedSharesAmount: bigint = (() => {
    try {
      return amount && Number(amount) > 0 ? parseUnits(amount, 18) : 0n
    } catch {
      return 0n
    }
  })()

  // ── Batch reads ─────────────────────────────────────────────────────────────
  const { data: reads, refetch: refetchReads, isLoading: readsLoading } = useReadContracts({
    contracts: [
      {
        address: ADDR.USDC as Address,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [address ?? '0x0000000000000000000000000000000000000000'],
      },
      {
        address: ADDR.FundVaultV01 as Address,
        abi: VAULT_ABI,
        functionName: 'balanceOf',
        args: [address ?? '0x0000000000000000000000000000000000000000'],
      },
      {
        address: ADDR.USDC as Address,
        abi: USDC_ABI,
        functionName: 'allowance',
        args: [
          address ?? '0x0000000000000000000000000000000000000000',
          ADDR.FundVaultV01 as Address,
        ],
      },
      {
        address: ADDR.FundVaultV01 as Address,
        abi: VAULT_ABI,
        functionName: 'depositsPaused',
        args: [],
      },
      {
        address: ADDR.FundVaultV01 as Address,
        abi: VAULT_ABI,
        functionName: 'redeemsPaused',
        args: [],
      },
      {
        address: ADDR.FundVaultV01 as Address,
        abi: VAULT_ABI,
        functionName: 'isAllowed',
        args: [address ?? '0x0000000000000000000000000000000000000000'],
      },
    ],
    query: { enabled: true },
  })

  const usdcBalance: bigint = (reads?.[0]?.result as bigint) ?? 0n
  const fbUsdcBalance: bigint = (reads?.[1]?.result as bigint) ?? 0n
  const usdcAllowance: bigint = (reads?.[2]?.result as bigint) ?? 0n
  const depositsPaused: boolean = (reads?.[3]?.result as boolean) ?? false
  const redeemsPaused: boolean = (reads?.[4]?.result as boolean) ?? false
  const isAllowed: boolean = isConnected ? ((reads?.[5]?.result as boolean) ?? false) : false

  // ── Preview deposit ─────────────────────────────────────────────────────────
  const { data: previewDepositShares, refetch: refetchPreviewDeposit } = useReadContract({
    address: ADDR.FundVaultV01 as Address,
    abi: VAULT_ABI,
    functionName: 'previewDeposit',
    args: [parsedDepositAmount],
    query: { enabled: tab === 'deposit' && parsedDepositAmount > 0n },
  })

  // ── Preview redeem ──────────────────────────────────────────────────────────
  const { data: previewRedeemAssets, refetch: refetchPreviewRedeem } = useReadContract({
    address: ADDR.FundVaultV01 as Address,
    abi: VAULT_ABI,
    functionName: 'previewRedeem',
    args: [parsedSharesAmount],
    query: { enabled: tab === 'redeem' && parsedSharesAmount > 0n },
  })

  // ── Total assets + system mode (left panel stats) ───────────────────────────
  const { data: totalAssets } = useReadContract({
    address: ADDR.FundVaultV01 as Address,
    abi: VAULT_ABI,
    functionName: 'totalAssets',
    args: [],
  })

  const { data: systemMode } = useReadContract({
    address: ADDR.FundVaultV01 as Address,
    abi: VAULT_ABI,
    functionName: 'systemMode',
    args: [],
  })

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
    // rate is in Ray (1e27). Convert to basis points via BigInt to avoid Number precision loss
    // (rate values like 5e25 exceed Number.MAX_SAFE_INTEGER ~9e15).
    const bps = Number((rate * 10000n) / 1_000_000_000_000_000_000_000_000_000n)
    return (bps / 100).toFixed(2)
  })()

  // ── Strategy address ────────────────────────────────────────────────────────
  const { data: strategyAddr } = useReadContract({
    address: ADDR.StrategyManagerV01 as Address,
    abi: STRAT_MGR_ABI,
    functionName: 'strategy',
  })

  // ── Write: approve USDC ─────────────────────────────────────────────────────
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: approvePending,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract()

  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTxHash })

  // ── Write: deposit ──────────────────────────────────────────────────────────
  const {
    writeContract: writeDeposit,
    data: depositTxHash,
    isPending: depositPending,
    error: depositError,
    reset: resetDeposit,
  } = useWriteContract()

  const { isLoading: depositConfirming, isSuccess: depositSuccess } =
    useWaitForTransactionReceipt({ hash: depositTxHash })

  // ── Write: redeem ───────────────────────────────────────────────────────────
  const {
    writeContract: writeRedeem,
    data: redeemTxHash,
    isPending: redeemPending,
    error: redeemError,
    reset: resetRedeem,
  } = useWriteContract()

  const { isLoading: redeemConfirming, isSuccess: redeemSuccess } =
    useWaitForTransactionReceipt({ hash: redeemTxHash })

  // Refetch after success
  useEffect(() => {
    if (approveSuccess) {
      refetchReads()
    }
  }, [approveSuccess])

  useEffect(() => {
    if (depositSuccess) {
      refetchReads()
      refetchPreviewDeposit()
      setAmount('')
    }
  }, [depositSuccess])

  useEffect(() => {
    if (redeemSuccess) {
      refetchReads()
      refetchPreviewRedeem()
      setAmount('')
    }
  }, [redeemSuccess])

  // ── Derived booleans ────────────────────────────────────────────────────────
  const needsApproval = isConnected && parsedDepositAmount > 0n && usdcAllowance < parsedDepositAmount
  const approveInFlight = approvePending || approveConfirming
  const depositInFlight = depositPending || depositConfirming
  const redeemInFlight = redeemPending || redeemConfirming

  // ── Stepper state ───────────────────────────────────────────────────────────
  const depositSteps: Step[] = [
    {
      label: 'Approve USDC',
      status: approveSuccess || !needsApproval
        ? 'done'
        : approveInFlight
        ? 'active'
        : 'idle',
    },
    {
      label: 'Deposit',
      status: depositSuccess
        ? 'done'
        : depositInFlight
        ? 'active'
        : !needsApproval && !depositSuccess
        ? 'active'
        : 'idle',
    },
    {
      label: 'Success',
      status: depositSuccess ? 'done' : 'idle',
    },
  ]

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleApprove() {
    if (!address || !parsedDepositAmount) return
    resetApprove()
    writeApprove({
      address: ADDR.USDC as Address,
      abi: USDC_ABI,
      functionName: 'approve',
      args: [ADDR.FundVaultV01 as Address, parsedDepositAmount],
    })
  }

  function handleDeposit() {
    if (!address || !parsedDepositAmount) return
    resetDeposit()
    writeDeposit({
      address: ADDR.FundVaultV01 as Address,
      abi: VAULT_ABI,
      functionName: 'deposit',
      args: [parsedDepositAmount, address],
    })
  }

  function handleRedeem() {
    if (!address || !parsedSharesAmount) return
    resetRedeem()
    writeRedeem({
      address: ADDR.FundVaultV01 as Address,
      abi: VAULT_ABI,
      functionName: 'redeem',
      args: [parsedSharesAmount, address, address],
    })
  }

  function handleMaxDeposit() {
    if (usdcBalance > 0n) {
      setAmount(formatUnits(usdcBalance, 6))
    }
  }

  function handleMaxRedeem() {
    if (fbUsdcBalance > 0n) {
      setAmount(formatUnits(fbUsdcBalance, 18))
    }
  }

  function handleTabChange(t: Tab) {
    setTab(t)
    setAmount('')
    resetApprove()
    resetDeposit()
    resetRedeem()
  }

  const systemModeNum = systemMode !== undefined ? Number(systemMode) : undefined

  // ── Deposit button state ────────────────────────────────────────────────────
  function getDepositButtonProps(): { label: string; disabled: boolean; onClick?: () => void; variant?: 'primary' | 'warn' } {
    if (!isConnected) return { label: 'Connect Wallet', disabled: true }
    if (readsLoading) return { label: 'Loading…', disabled: true }
    if (systemModeNum === 2) return { label: 'Emergency Mode — Deposits Closed', disabled: true, variant: 'warn' }
    if (systemModeNum === 1) return { label: 'Protocol Paused — Deposits Disabled', disabled: true, variant: 'warn' }
    if (!isAllowed) return { label: 'Not Allowlisted', disabled: true, variant: 'warn' }
    if (depositsPaused) return { label: 'Deposits Paused', disabled: true, variant: 'warn' }
    if (!amount || Number(amount) <= 0) return { label: 'Enter Amount', disabled: true }
    if (parsedDepositAmount > usdcBalance) return { label: 'Insufficient USDC', disabled: true, variant: 'warn' }
    if (approveInFlight) return { label: 'Approving…', disabled: true }
    if (depositInFlight) return { label: 'Depositing…', disabled: true }
    if (needsApproval) return { label: 'Approve USDC', disabled: false, onClick: handleApprove }
    return { label: 'Deposit USDC', disabled: false, onClick: handleDeposit }
  }

  function getRedeemButtonProps(): { label: string; disabled: boolean; onClick?: () => void; variant?: 'warn' } {
    if (!isConnected) return { label: 'Connect Wallet', disabled: true }
    if (readsLoading) return { label: 'Loading…', disabled: true }
    if (systemModeNum === 2) return { label: 'Emergency Mode — Use Claim Exit Below', disabled: true, variant: 'warn' }
    if (!isAllowed) return { label: 'Not Allowlisted', disabled: true, variant: 'warn' }
    if (redeemsPaused) return { label: 'Redeems Paused', disabled: true, variant: 'warn' }
    if (!amount || Number(amount) <= 0) return { label: 'Enter Amount', disabled: true }
    if (parsedSharesAmount > fbUsdcBalance) return { label: 'Insufficient fbUSDC', disabled: true, variant: 'warn' }
    if (redeemInFlight) return { label: 'Redeeming…', disabled: true }
    return { label: 'Redeem fbUSDC', disabled: false, onClick: handleRedeem }
  }

  const depositBtn = getDepositButtonProps()
  const redeemBtn = getRedeemButtonProps()

  // Short tx hash display
  function shortHash(hash: string) {
    return `${hash.slice(0, 10)}…${hash.slice(-8)}`
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-on-surface">Vault</h2>
          <p className="text-on-surface-variant text-sm mt-1">
            Deposit USDC to receive fbUSDC shares representing your fund allocation.
          </p>
        </div>
        <a
          href={`https://basescan.org/address/${ADDR.FundVaultV01}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors shrink-0 mt-1"
          title="FundVaultV01 on Basescan"
        >
          <span className="font-mono">{ADDR.FundVaultV01.slice(0, 6)}…{ADDR.FundVaultV01.slice(-4)}</span>
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
        </a>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ── Left column: Fund info ─────────────────────────────────────────── */}
        <div className="lg:col-span-5 flex flex-col gap-5">

          {/* Fund identity card */}
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-on-primary-container text-xl">
                  account_balance
                </span>
              </div>
              <div>
                <div className="font-bold text-on-surface text-base leading-tight">
                  YearRing Fund USDC
                </div>
                <div className="text-xs text-on-surface-variant">
                  fbUSDC · ERC-4626 Vault
                </div>
              </div>
            </div>
            <div className="text-xs text-on-surface-variant leading-relaxed space-y-2">
              <p>
                A 100% reserve institutional vault with active yield strategy. All assets
                remain on-chain and redeemable at the current Price Per Share (PPS).
              </p>
              <p>
                Yield is generated via non-custodial <strong>Aave V3 on Base</strong> smart
                contracts, while the protocol retains administrative controls such as pausing
                and emergency actions. Redemptions are available when the vault is in Normal
                mode and redeems are not paused by the fund manager.
                Management fees are accrued monthly and distributed to the protocol treasury.
              </p>
              {strategyAddr && strategyAddr !== '0x0000000000000000000000000000000000000000' && (
                <a
                  href={`https://basescan.org/address/${strategyAddr}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  Strategy contract on Basescan
                </a>
              )}
            </div>
          </div>

          {/* Stats bento grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon="trending_up"
              label="Current APR"
              value={aaveApyPct !== undefined ? `${aaveApyPct}%` : '—'}
              sub="Aave V3 USDC supply rate (APR)"
            />
            <StatCard
              icon="account_balance_wallet"
              label="TVL"
              value={
                totalAssets !== undefined
                  ? `$${formatUSDC(totalAssets as bigint)}`
                  : '—'
              }
              sub="USDC"
            />
            <StatCard
              icon="pie_chart"
              label="Your Balance"
              value={
                isConnected
                  ? `${formatShares(fbUsdcBalance)} fbUSDC`
                  : '—'
              }
              sub={isConnected ? `USDC balance: ${formatUSDC(usdcBalance)}` : 'Not connected'}
            />
            <StatCard
              icon="verified_user"
              label="Status"
              value={<ModeBadge mode={systemModeNum} />}
              sub={depositsPaused ? 'Deposits paused' : redeemsPaused ? 'Redeems paused' : undefined}
            />
          </div>

          {/* Contract address */}
          <div className="bg-surface-container rounded-xl px-4 py-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant text-base">
              contract
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-on-surface-variant">Vault Contract</span>
              <span className="text-xs font-mono text-on-surface truncate">
                {ADDR.FundVaultV01}
              </span>
            </div>
          </div>
        </div>

        {/* ── Right column: Transaction module ──────────────────────────────── */}
        <div className="lg:col-span-7">
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl overflow-hidden">

            {/* Tabs */}
            <div className="flex border-b border-outline-variant/40">
              {(['deposit', 'redeem'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => handleTabChange(t)}
                  className={[
                    'flex-1 py-4 text-sm font-semibold capitalize transition-colors',
                    tab === t
                      ? 'text-primary border-b-2 border-primary bg-primary-fixed/30'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low',
                  ].join(' ')}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-5">

              {/* ── DEPOSIT TAB ──────────────────────────────────────────────── */}
              {tab === 'deposit' && (
                <>
                  {/* Amount input */}
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">
                      Amount (USDC)
                    </label>
                    <div className="flex items-center gap-2 bg-surface-container rounded-xl px-4 py-3 border border-outline-variant/60 focus-within:border-primary transition-colors">
                      <input
                        type="number"
                        min="0"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="flex-1 bg-transparent text-on-surface text-lg font-semibold outline-none placeholder:text-on-surface-variant/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-on-surface-variant text-sm font-medium">USDC</span>
                      <button
                        onClick={handleMaxDeposit}
                        className="text-xs font-bold text-primary bg-primary-fixed px-2 py-1 rounded-lg hover:bg-primary hover:text-on-primary transition-colors"
                      >
                        MAX
                      </button>
                    </div>
                    {isConnected && (
                      <div className="text-xs text-on-surface-variant mt-1.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
                        Balance: {formatUSDC(usdcBalance)} USDC
                      </div>
                    )}
                  </div>

                  {/* Preview */}
                  <div className="bg-surface-container rounded-xl p-4 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-on-surface-variant">Estimated Shares (fbUSDC)</span>
                      <span className="font-semibold text-on-surface">
                        {parsedDepositAmount > 0n && previewDepositShares !== undefined
                          ? formatShares(previewDepositShares as bigint)
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-on-surface-variant">Deposit Fee</span>
                      <span className="font-semibold text-on-surface">0.00%</span>
                    </div>
                    {depositsPaused && (
                      <div className="flex items-center gap-2 text-error text-xs pt-1 border-t border-outline-variant/30 mt-1">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        Deposits are currently paused by the fund manager.
                      </div>
                    )}
                  </div>

                  {/* Stepper */}
                  <div className="py-2">
                    <Stepper steps={depositSteps} />
                  </div>

                  {/* Action button */}
                  <button
                    disabled={depositBtn.disabled}
                    onClick={depositBtn.onClick}
                    className={[
                      'w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all',
                      depositBtn.disabled
                        ? depositBtn.variant === 'warn'
                          ? 'bg-error-container text-on-error-container cursor-not-allowed opacity-80'
                          : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                        : 'bg-primary text-on-primary hover:bg-primary-dim active:scale-[0.99] shadow-sm',
                    ].join(' ')}
                  >
                    {depositBtn.label}
                  </button>

                  {/* Allowlist status */}
                  {isConnected && (
                    <div
                      className={[
                        'flex items-center gap-2 text-xs rounded-xl px-3 py-2',
                        isAllowed
                          ? 'bg-primary-fixed text-on-primary-container'
                          : 'bg-error-container text-on-error-container',
                      ].join(' ')}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {isAllowed ? 'verified' : 'block'}
                      </span>
                      {isAllowed
                        ? `Your wallet ${address?.slice(0, 6)}…${address?.slice(-4)} is allowlisted`
                        : 'Your wallet is not on the allowlist. Contact the fund manager.'}
                    </div>
                  )}

                  {/* Tx error */}
                  {(approveError || depositError) && (
                    <div className="flex items-start gap-2 text-xs bg-error-container text-on-error-container rounded-xl px-3 py-2">
                      <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">error</span>
                      <span>{parseTxError(approveError ?? depositError)}</span>
                    </div>
                  )}

                  {/* Tx success */}
                  {depositSuccess && depositTxHash && (
                    <div className="flex items-center gap-2 text-xs bg-primary-fixed text-on-primary-container rounded-xl px-3 py-2">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      Transaction confirmed:{' '}
                      <a
                        href={`https://basescan.org/tx/${depositTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline font-mono"
                      >
                        {shortHash(depositTxHash)}
                      </a>
                    </div>
                  )}
                </>
              )}

              {/* ── REDEEM TAB ──────────────────────────────────────────────── */}
              {tab === 'redeem' && (
                <>
                  {/* Amount input */}
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">
                      Amount (fbUSDC Shares)
                    </label>
                    <div className="flex items-center gap-2 bg-surface-container rounded-xl px-4 py-3 border border-outline-variant/60 focus-within:border-primary transition-colors">
                      <input
                        type="number"
                        min="0"
                        placeholder="0.0000"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="flex-1 bg-transparent text-on-surface text-lg font-semibold outline-none placeholder:text-on-surface-variant/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-on-surface-variant text-sm font-medium">fbUSDC</span>
                      <button
                        onClick={handleMaxRedeem}
                        className="text-xs font-bold text-primary bg-primary-fixed px-2 py-1 rounded-lg hover:bg-primary hover:text-on-primary transition-colors"
                      >
                        MAX
                      </button>
                    </div>
                    {isConnected && (
                      <div className="text-xs text-on-surface-variant mt-1.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
                        Balance: {formatShares(fbUsdcBalance)} fbUSDC
                      </div>
                    )}
                  </div>

                  {/* Preview */}
                  <div className="bg-surface-container rounded-xl p-4 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-on-surface-variant">You will receive (USDC)</span>
                      <span className="font-semibold text-on-surface">
                        {parsedSharesAmount > 0n && previewRedeemAssets !== undefined
                          ? formatUSDC(previewRedeemAssets as bigint)
                          : '—'}
                      </span>
                    </div>
                    {redeemsPaused && (
                      <div className="flex items-center gap-2 text-error text-xs pt-1 border-t border-outline-variant/30 mt-1">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        Redeems are currently paused by the fund manager.
                      </div>
                    )}
                  </div>

                  {/* Action button */}
                  <button
                    disabled={redeemBtn.disabled}
                    onClick={redeemBtn.onClick}
                    className={[
                      'w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all',
                      redeemBtn.disabled
                        ? redeemBtn.variant === 'warn'
                          ? 'bg-error-container text-on-error-container cursor-not-allowed opacity-80'
                          : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                        : 'bg-primary text-on-primary hover:bg-primary-dim active:scale-[0.99] shadow-sm',
                    ].join(' ')}
                  >
                    {redeemBtn.label}
                  </button>

                  {/* Allowlist status */}
                  {isConnected && (
                    <div
                      className={[
                        'flex items-center gap-2 text-xs rounded-xl px-3 py-2',
                        isAllowed
                          ? 'bg-primary-fixed text-on-primary-container'
                          : 'bg-error-container text-on-error-container',
                      ].join(' ')}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {isAllowed ? 'verified' : 'block'}
                      </span>
                      {isAllowed
                        ? `Your wallet ${address?.slice(0, 6)}…${address?.slice(-4)} is allowlisted`
                        : 'Your wallet is not on the allowlist. Contact the fund manager.'}
                    </div>
                  )}

                  {/* Tx error */}
                  {redeemError && (
                    <div className="flex items-start gap-2 text-xs bg-error-container text-on-error-container rounded-xl px-3 py-2">
                      <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">error</span>
                      <span>{parseTxError(redeemError)}</span>
                    </div>
                  )}

                  {/* Tx success */}
                  {redeemSuccess && redeemTxHash && (
                    <div className="flex items-center gap-2 text-xs bg-primary-fixed text-on-primary-container rounded-xl px-3 py-2">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      Transaction confirmed:{' '}
                      <a
                        href={`https://basescan.org/tx/${redeemTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline font-mono"
                      >
                        {shortHash(redeemTxHash)}
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Emergency Exit Panel (only visible in EmergencyExit mode) ─────── */}
      {systemModeNum === 2 && (
        <EmergencyExitPanel userShares={fbUsdcBalance} />
      )}
    </div>
  )
}
