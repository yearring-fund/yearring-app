import { useState, useEffect } from 'react'
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { parseUnits, formatUnits, isAddress, type Address } from 'viem'
import {
  ADDR,
  VAULT_ABI,
  CORE_SM_ABI,
  SystemMode,
  type SystemModeKey,
} from '../lib/contracts'
import { formatUSDC } from '../lib/format'
import { parseTxError } from '../lib/txError'

// DEFAULT_ADMIN_ROLE = bytes32(0)
const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000' as const

// ── Reusable action row ───────────────────────────────────────────────────────
function ActionRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-4 border-b border-outline-variant/40 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-on-surface">{label}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  )
}

// ── Tx result banner ──────────────────────────────────────────────────────────
function TxBanner({
  hash,
  isPending,
  isSuccess,
}: {
  hash: `0x${string}` | undefined
  isPending: boolean
  isSuccess: boolean
}) {
  if (!hash && !isPending) return null
  return (
    <div
      className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 mt-2 ${
        isSuccess
          ? 'bg-primary-fixed text-on-primary-container'
          : 'bg-surface-container text-on-surface-variant'
      }`}
    >
      <span className="material-symbols-outlined text-sm">
        {isSuccess ? 'check_circle' : 'pending'}
      </span>
      {isSuccess ? (
        <>
          Confirmed{' '}
          <a
            href={`https://basescan.org/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="underline font-mono truncate max-w-[180px]"
          >
            {hash?.slice(0, 10)}…{hash?.slice(-6)}
          </a>
        </>
      ) : (
        'Waiting for confirmation…'
      )}
    </div>
  )
}

// ── Section card wrapper ──────────────────────────────────────────────────────
function Section({
  icon,
  title,
  children,
}: {
  icon: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-primary">{icon}</span>
        <h2 className="text-base font-bold text-on-surface">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ── Admin gate (outer) ────────────────────────────────────────────────────────
export default function Admin() {
  const { address, isConnected } = useAccount()

  const { data: isAdmin, isLoading: isAdminLoading } = useReadContract({
    address: ADDR.YearRingCoreVaultV21,
    abi: VAULT_ABI,
    functionName: 'hasRole',
    args: [DEFAULT_ADMIN_ROLE, address as Address],
    query: { enabled: !!address },
  })

  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto mt-24 flex flex-col items-center gap-4 text-center">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant/40">lock</span>
        <p className="text-base font-semibold text-on-surface">Wallet not connected</p>
        <p className="text-sm text-on-surface-variant">Connect your wallet to access the admin console.</p>
      </div>
    )
  }

  if (isAdminLoading) {
    return (
      <div className="max-w-md mx-auto mt-24 flex flex-col items-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-on-surface-variant">Checking permissions…</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-24 flex flex-col items-center gap-4 text-center">
        <span className="material-symbols-outlined text-5xl text-error/60">gpp_bad</span>
        <p className="text-base font-semibold text-on-surface">Access Denied</p>
        <p className="text-sm text-on-surface-variant">
          Connected address does not hold{' '}
          <span className="font-mono text-xs bg-surface-container px-1.5 py-0.5 rounded">DEFAULT_ADMIN_ROLE</span>{' '}
          on YearRingCoreVaultV21.
        </p>
        <p className="font-mono text-xs text-on-surface-variant/60 break-all">{address}</p>
      </div>
    )
  }

  return <AdminConsole />
}

// ── Admin console (inner — only rendered when isAdmin is confirmed) ───────────
function AdminConsole() {
  // ── State for inputs ────────────────────────────────────────────────────────
  const [investAmt, setInvestAmt] = useState('')
  const [divestAmt, setDivestAmt] = useState('')
  const [allowlistAddr, setAllowlistAddr] = useState('')

  // ── Read protocol state ─────────────────────────────────────────────────────
  const { data, refetch } = useReadContracts({
    contracts: [
      // [0] vault totalAssets
      { address: ADDR.YearRingCoreVaultV21, abi: VAULT_ABI, functionName: 'totalAssets' },
      // [1] vault systemMode
      { address: ADDR.YearRingCoreVaultV21, abi: VAULT_ABI, functionName: 'systemMode' },
      // [2] vault allowlistEnabled
      { address: ADDR.YearRingCoreVaultV21, abi: VAULT_ABI, functionName: 'allowlistEnabled' },
      // [3] CoreSM totalManagedAssets
      { address: ADDR.CoreStrategyManagerV21, abi: CORE_SM_ABI, functionName: 'totalManagedAssets' },
      // [4] CoreSM vaultManagedAssets (USDC under CoreSM on behalf of vault)
      { address: ADDR.CoreStrategyManagerV21, abi: CORE_SM_ABI, functionName: 'vaultManagedAssets' },
      // [5] CoreSM strategy address
      { address: ADDR.CoreStrategyManagerV21, abi: CORE_SM_ABI, functionName: 'strategy' },
      // [6] CoreSM feeReceiver
      { address: ADDR.CoreStrategyManagerV21, abi: CORE_SM_ABI, functionName: 'feeReceiver' },
      // [7] CoreSM FEE_BPS
      { address: ADDR.CoreStrategyManagerV21, abi: CORE_SM_ABI, functionName: 'FEE_BPS' },
      // [8] vault coreStrategyManager (verify link)
      { address: ADDR.YearRingCoreVaultV21, abi: VAULT_ABI, functionName: 'coreStrategyManager' },
    ],
  })

  const totalAssets       = data?.[0]?.result as bigint | undefined
  const systemModeRaw     = data?.[1]?.result !== undefined ? Number(data[1].result) : undefined
  const allowlistEnabled  = data?.[2]?.result as boolean | undefined
  const totalManaged      = data?.[3]?.result as bigint | undefined
  const vaultManaged      = data?.[4]?.result as bigint | undefined
  const strategyAddr      = data?.[5]?.result as string | undefined
  const feeReceiver       = data?.[6]?.result as string | undefined
  const feeBps            = data?.[7]?.result as bigint | undefined
  const coreSmAddr        = data?.[8]?.result as string | undefined

  const systemModeKey     = (systemModeRaw ?? 0) as SystemModeKey
  const systemModeLabel   = SystemMode[systemModeKey] ?? '—'

  // Vault idle = totalAssets - what CoreSM is managing on vault's behalf
  const vaultIdle = totalAssets !== undefined && vaultManaged !== undefined
    ? (totalAssets > vaultManaged ? totalAssets - vaultManaged : 0n)
    : undefined

  // ── Treasury yrUSDC balance ──────────────────────────────────────────────────
  const { data: treasurySharesData, refetch: refetchTreasury } = useReadContract({
    address: ADDR.YearRingCoreVaultV21,
    abi: VAULT_ABI,
    functionName: 'balanceOf',
    args: [ADDR.TreasuryV21],
  })
  const treasuryShares = treasurySharesData as bigint | undefined

  const { data: treasuryUsdc } = useReadContract({
    address: ADDR.YearRingCoreVaultV21,
    abi: VAULT_ABI,
    functionName: 'convertToAssets',
    args: [treasuryShares ?? 0n],
    query: { enabled: treasuryShares !== undefined },
  })

  // ── Write hook ───────────────────────────────────────────────────────────────
  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract()

  const [lastAction, setLastAction] = useState<string>('')
  const [actionHash, setActionHash] = useState<`0x${string}` | undefined>()

  const { isLoading: txPending, isSuccess: txSuccess } = useWaitForTransactionReceipt({
    hash: actionHash,
  })

  async function send(action: string, fn: () => void) {
    reset()
    setLastAction(action)
    setActionHash(undefined)
    fn()
  }

  useEffect(() => {
    if (txHash && txHash !== actionHash) {
      setActionHash(txHash)
      refetch()
      refetchTreasury()
    }
  }, [txHash])

  const isLoading = isPending || txPending

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Admin Console</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Protocol management — YearRingCoreVaultV21 &amp; CoreStrategyManagerV21
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 mt-1">
          {([
            { label: 'YearRingCoreVaultV21',     addr: ADDR.YearRingCoreVaultV21 },
            { label: 'CoreStrategyManagerV21',   addr: ADDR.CoreStrategyManagerV21 },
            { label: 'LockManagerV21',           addr: ADDR.LockManagerV21 },
            { label: 'TreasuryV21',              addr: ADDR.TreasuryV21 },
          ] as const).map(({ label, addr }) => (
            <a
              key={addr}
              href={`https://basescan.org/address/${addr}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors"
              title={`${label} on Basescan`}
            >
              <span className="font-mono">{addr.slice(0, 6)}…{addr.slice(-4)}</span>
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            </a>
          ))}
        </div>
      </div>

      {/* Tx error */}
      {writeError && (
        <div className="flex items-start gap-2 text-sm bg-error-container text-on-error-container rounded-xl px-4 py-3">
          <span className="material-symbols-outlined shrink-0 mt-0.5">error</span>
          <span>{parseTxError(writeError)}</span>
        </div>
      )}

      {/* ── Status overview ──────────────────────────────────────────────────── */}
      <Section icon="monitoring" title="Protocol Status">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Assets',    value: totalAssets !== undefined ? `$${formatUSDC(totalAssets)}` : '—' },
            { label: 'CoreSM Managed',  value: totalManaged !== undefined ? `$${formatUSDC(totalManaged)}` : '—' },
            { label: 'Vault Idle',      value: vaultIdle !== undefined ? `$${formatUSDC(vaultIdle)}` : '—' },
            { label: 'System Mode',     value: systemModeLabel },
            { label: 'Allowlist',       value: allowlistEnabled === undefined ? '—' : allowlistEnabled ? 'ENABLED' : 'OPEN' },
            { label: 'Mgmt Fee',        value: feeBps !== undefined ? `${feeBps} bps/yr` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-surface-container rounded-xl px-4 py-3">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1">
                {label}
              </p>
              <p className="text-sm font-bold text-on-surface font-mono">{value}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Vault mode controls ───────────────────────────────────────────────── */}
      <Section icon="toggle_on" title="Vault Mode Controls">
        <ActionRow
          label="Pause"
          description="Set systemMode = 1 (Paused) — blocks deposits and redeems"
        >
          <button
            disabled={isLoading || systemModeRaw === 1}
            onClick={() => send('pause', () => writeContract({ address: ADDR.YearRingCoreVaultV21, abi: VAULT_ABI, functionName: 'pause' }))}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-error text-on-error hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Pause Vault
          </button>
        </ActionRow>
        <ActionRow
          label="Unpause"
          description="Set systemMode = 0 (Normal) — re-enables deposits and redeems"
        >
          <button
            disabled={isLoading || systemModeRaw === 0}
            onClick={() => send('unpause', () => writeContract({ address: ADDR.YearRingCoreVaultV21, abi: VAULT_ABI, functionName: 'unpause' }))}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Unpause Vault
          </button>
        </ActionRow>
        {(lastAction === 'pause' || lastAction === 'unpause') && (
          <TxBanner hash={actionHash} isPending={txPending} isSuccess={txSuccess} />
        )}
      </Section>

      {/* ── Allowlist ─────────────────────────────────────────────────────────── */}
      <Section icon="person_check" title="Allowlist">
        <ActionRow
          label="Allowlist Gate"
          description="Enable or disable the allowlist requirement for deposits"
        >
          <button
            disabled={isLoading || allowlistEnabled === true}
            onClick={() => send('enableAllowlist', () => writeContract({ address: ADDR.YearRingCoreVaultV21, abi: VAULT_ABI, functionName: 'setAllowlistEnabled', args: [true] }))}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Enable
          </button>
          <button
            disabled={isLoading || allowlistEnabled === false}
            onClick={() => send('disableAllowlist', () => writeContract({ address: ADDR.YearRingCoreVaultV21, abi: VAULT_ABI, functionName: 'setAllowlistEnabled', args: [false] }))}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-secondary text-on-secondary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Disable
          </button>
        </ActionRow>
        <ActionRow
          label="Manage Address"
          description="Grant or revoke allowlist for a specific address"
        >
          <input
            type="text"
            placeholder="0x…"
            spellCheck={false}
            value={allowlistAddr}
            onChange={(e) => setAllowlistAddr(e.target.value)}
            className={`w-64 font-mono px-3 py-2 rounded-lg border text-sm bg-surface-container text-on-surface outline-none focus:ring-2 focus:ring-primary/30 ${
              allowlistAddr && !isAddress(allowlistAddr)
                ? 'border-error'
                : 'border-outline-variant'
            }`}
          />
          <button
            disabled={isLoading || !isAddress(allowlistAddr)}
            onClick={() =>
              send('allowlistAdd', () =>
                writeContract({
                  address: ADDR.YearRingCoreVaultV21,
                  abi: VAULT_ABI,
                  functionName: 'setAllowlist',
                  args: [allowlistAddr as Address, true],
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Allow
          </button>
          <button
            disabled={isLoading || !isAddress(allowlistAddr)}
            onClick={() =>
              send('allowlistRemove', () =>
                writeContract({
                  address: ADDR.YearRingCoreVaultV21,
                  abi: VAULT_ABI,
                  functionName: 'setAllowlist',
                  args: [allowlistAddr as Address, false],
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-error text-on-error hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Revoke
          </button>
        </ActionRow>
        {(lastAction === 'enableAllowlist' || lastAction === 'disableAllowlist' || lastAction === 'allowlistAdd' || lastAction === 'allowlistRemove') && (
          <TxBanner hash={actionHash} isPending={txPending} isSuccess={txSuccess} />
        )}
      </Section>

      {/* ── Fee Collection ────────────────────────────────────────────────────── */}
      <Section icon="payments" title="Fee Collection">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-surface-container rounded-xl px-4 py-3">
            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1">Treasury Address</p>
            <a
              href={`https://basescan.org/address/${ADDR.TreasuryV21}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono text-primary hover:underline"
            >
              {ADDR.TreasuryV21.slice(0, 6)}…{ADDR.TreasuryV21.slice(-4)}
            </a>
          </div>
          <div className="bg-surface-container rounded-xl px-4 py-3">
            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1">Treasury yrUSDC</p>
            <p className="text-sm font-bold text-on-surface font-mono">
              {treasuryShares !== undefined ? parseFloat(formatUnits(treasuryShares, 18)).toFixed(4) : '—'}
            </p>
          </div>
          <div className="bg-surface-container rounded-xl px-4 py-3">
            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1">Redeemable USDC</p>
            <p className="text-sm font-bold text-on-surface font-mono">
              {treasuryUsdc !== undefined ? `$${formatUSDC(treasuryUsdc as bigint)}` : '—'}
            </p>
          </div>
        </div>
        <ActionRow
          label="Accrue Fee"
          description="Trigger fee accrual on CoreStrategyManagerV21 — mints fee units to feeReceiver"
        >
          <button
            disabled={isLoading}
            onClick={() =>
              send('accrueFee', () =>
                writeContract({
                  address: ADDR.CoreStrategyManagerV21,
                  abi: CORE_SM_ABI,
                  functionName: 'accrueFee',
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-secondary text-on-secondary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Accrue Fee
          </button>
        </ActionRow>
        <ActionRow
          label="Collect Treasury Fees"
          description="Redeem all treasury yrUSDC shares to USDC. Must be signed by the treasury wallet."
        >
          <button
            disabled={isLoading || !treasuryShares || treasuryShares === 0n}
            onClick={() =>
              send('collectFees', () =>
                writeContract({
                  address: ADDR.YearRingCoreVaultV21,
                  abi: VAULT_ABI,
                  functionName: 'redeem',
                  args: [treasuryShares!, ADDR.TreasuryV21, ADDR.TreasuryV21],
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Collect All Fees
          </button>
        </ActionRow>
        {(lastAction === 'accrueFee' || lastAction === 'collectFees') && (
          <TxBanner hash={actionHash} isPending={txPending} isSuccess={txSuccess} />
        )}
      </Section>

      {/* ── Strategy Management ───────────────────────────────────────────────── */}
      <Section icon="moving" title="Strategy Management">
        <ActionRow
          label="Manual Rebalance"
          description="Trigger vault auto-rebalance — moves USDC to/from CoreStrategyManagerV21 per reserve targets"
        >
          <button
            disabled={isLoading}
            onClick={() =>
              send('rebalance', () =>
                writeContract({
                  address: ADDR.YearRingCoreVaultV21,
                  abi: VAULT_ABI,
                  functionName: 'rebalance',
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-secondary text-on-secondary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Rebalance
          </button>
        </ActionRow>
        <ActionRow
          label="Invest"
          description="Deploy idle USDC from CoreStrategyManagerV21 into the active Aave strategy"
        >
          <input
            type="number"
            min="0"
            placeholder="USDC"
            value={investAmt}
            onChange={(e) => setInvestAmt(e.target.value)}
            className="w-28 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
          />
          <button
            disabled={isLoading || !investAmt || Number(investAmt) <= 0}
            onClick={() =>
              send('invest', () =>
                writeContract({
                  address: ADDR.CoreStrategyManagerV21,
                  abi: CORE_SM_ABI,
                  functionName: 'invest',
                  args: [parseUnits(investAmt, 6)],
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Invest
          </button>
        </ActionRow>
        <ActionRow
          label="Divest from Strategy"
          description="Withdraw USDC from Aave strategy back to CoreStrategyManagerV21"
        >
          <input
            type="number"
            min="0"
            placeholder="USDC"
            value={divestAmt}
            onChange={(e) => setDivestAmt(e.target.value)}
            className="w-28 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
          />
          <button
            disabled={isLoading || !divestAmt || Number(divestAmt) <= 0}
            onClick={() =>
              send('divest', () =>
                writeContract({
                  address: ADDR.CoreStrategyManagerV21,
                  abi: CORE_SM_ABI,
                  functionName: 'divestFromStrategy',
                  args: [parseUnits(divestAmt, 6)],
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-secondary text-on-secondary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Divest
          </button>
        </ActionRow>
        {(lastAction === 'rebalance' || lastAction === 'invest' || lastAction === 'divest') && (
          <TxBanner hash={actionHash} isPending={txPending} isSuccess={txSuccess} />
        )}
      </Section>

      {/* ── Emergency ─────────────────────────────────────────────────────────── */}
      <Section icon="emergency" title="Emergency">
        <ActionRow
          label="Emergency Exit Vault"
          description="Set systemMode = 2 (EmergencyExit) — irreversible. Blocks all deposits and redeems until resolved by admin."
        >
          <button
            disabled={isLoading || systemModeRaw === 2}
            onClick={() =>
              send('setEmergencyExit', () =>
                writeContract({
                  address: ADDR.YearRingCoreVaultV21,
                  abi: VAULT_ABI,
                  functionName: 'setEmergencyExit',
                })
              )
            }
            className="px-5 py-2.5 rounded-lg text-sm font-bold bg-error text-on-error hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">warning</span>
              Set Emergency Exit
            </span>
          </button>
        </ActionRow>
        <ActionRow
          label="Emergency Exit Strategy"
          description="Force-exit Aave strategy via CoreStrategyManagerV21 — withdraws all funds back to CoreSM"
        >
          <button
            disabled={isLoading}
            onClick={() =>
              send('emergencyExitStrategy', () =>
                writeContract({
                  address: ADDR.CoreStrategyManagerV21,
                  abi: CORE_SM_ABI,
                  functionName: 'emergencyExitStrategy',
                })
              )
            }
            className="px-5 py-2.5 rounded-lg text-sm font-bold bg-error text-on-error hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">warning</span>
              Exit Strategy
            </span>
          </button>
        </ActionRow>
        {(lastAction === 'setEmergencyExit' || lastAction === 'emergencyExitStrategy') && (
          <TxBanner hash={actionHash} isPending={txPending} isSuccess={txSuccess} />
        )}
      </Section>

      {/* ── Pre-launch Verification ───────────────────────────────────────────── */}
      <Section icon="checklist" title="Deployment Verification">
        <div className="space-y-3">
          <p className="text-xs text-on-surface-variant mb-4">
            Verify critical on-chain parameters and contract links.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* coreStrategyManager link */}
            <div className="bg-surface-container rounded-xl px-4 py-3">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1.5">
                Vault → CoreSM Link
              </p>
              {coreSmAddr === undefined ? (
                <p className="text-sm font-mono text-on-surface-variant">Loading…</p>
              ) : coreSmAddr.toLowerCase() === ADDR.CoreStrategyManagerV21.toLowerCase() ? (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                  <span className="text-xs font-mono text-primary">{coreSmAddr.slice(0, 8)}…{coreSmAddr.slice(-6)}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-error">error</span>
                  <span className="text-sm font-semibold text-error">Mismatch — {coreSmAddr.slice(0, 8)}…</span>
                </div>
              )}
            </div>

            {/* Active Strategy */}
            <div className="bg-surface-container rounded-xl px-4 py-3">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1.5">
                Active Strategy
              </p>
              {strategyAddr === undefined ? (
                <p className="text-sm font-mono text-on-surface-variant">Loading…</p>
              ) : strategyAddr === '0x0000000000000000000000000000000000000000' ? (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-amber-500">warning</span>
                  <span className="text-sm font-semibold text-amber-600">No strategy set</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                  <a
                    href={`https://basescan.org/address/${strategyAddr}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-primary hover:underline"
                  >
                    {strategyAddr.slice(0, 8)}…{strategyAddr.slice(-6)}
                  </a>
                </div>
              )}
            </div>

            {/* Fee Receiver */}
            <div className="bg-surface-container rounded-xl px-4 py-3">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1.5">
                Fee Receiver
              </p>
              {feeReceiver === undefined ? (
                <p className="text-sm font-mono text-on-surface-variant">Loading…</p>
              ) : feeReceiver === '0x0000000000000000000000000000000000000000' ? (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-amber-500">warning</span>
                  <span className="text-sm font-semibold text-amber-600">Not set (zero address)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                  <a
                    href={`https://basescan.org/address/${feeReceiver}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-primary hover:underline"
                  >
                    {feeReceiver.slice(0, 8)}…{feeReceiver.slice(-6)}
                  </a>
                </div>
              )}
            </div>

            {/* Allowlist gate */}
            <div className="bg-surface-container rounded-xl px-4 py-3">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1.5">
                Allowlist Gate
              </p>
              {allowlistEnabled === undefined ? (
                <p className="text-sm font-mono text-on-surface-variant">Loading…</p>
              ) : allowlistEnabled ? (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                  <span className="text-sm font-semibold text-primary">Enabled — deposits gated</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-on-surface-variant">info</span>
                  <span className="text-sm text-on-surface-variant">Disabled — open to all</span>
                </div>
              )}
            </div>

          </div>
        </div>
      </Section>

    </div>
  )
}
