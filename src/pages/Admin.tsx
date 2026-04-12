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
  STRAT_MGR_ABI,
  SystemMode,
  type SystemModeKey,
} from '../lib/contracts'
import { formatUSDC, bpsToPercent } from '../lib/format'
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
    address: ADDR.FundVaultV01,
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
          on FundVaultV01.
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
  const [returnAmt, setReturnAmt] = useState('')
  const [transferAmt, setTransferAmt] = useState('')
  const [newMgmtFee, setNewMgmtFee] = useState('')
  const [newReserveRatio, setNewReserveRatio] = useState('')
  const [allowlistAddr, setAllowlistAddr] = useState('')
  const [newMode, setNewMode] = useState<'0' | '1' | '2'>('0')
  const [exitRoundAmt, setExitRoundAmt] = useState('')

  // ── Read protocol state ─────────────────────────────────────────────────────
  const { data, refetch } = useReadContracts({
    contracts: [
      { address: ADDR.FundVaultV01, abi: VAULT_ABI, functionName: 'totalAssets' },
      { address: ADDR.FundVaultV01, abi: VAULT_ABI, functionName: 'systemMode' },
      { address: ADDR.FundVaultV01, abi: VAULT_ABI, functionName: 'depositsPaused' },
      { address: ADDR.FundVaultV01, abi: VAULT_ABI, functionName: 'redeemsPaused' },
      { address: ADDR.FundVaultV01, abi: VAULT_ABI, functionName: 'mgmtFeeBpsPerMonth' },
      { address: ADDR.FundVaultV01, abi: VAULT_ABI, functionName: 'reserveRatioBps' },
      { address: ADDR.StrategyManagerV01, abi: STRAT_MGR_ABI, functionName: 'totalManagedAssets' },
      { address: ADDR.StrategyManagerV01, abi: STRAT_MGR_ABI, functionName: 'idleUnderlying' },
      { address: ADDR.StrategyManagerV01, abi: STRAT_MGR_ABI, functionName: 'paused' },
      // 9 — lockLedger
      { address: ADDR.FundVaultV01, abi: VAULT_ABI, functionName: 'lockLedger' },
      // 10 — externalTransfersEnabled
      { address: ADDR.FundVaultV01, abi: VAULT_ABI, functionName: 'externalTransfersEnabled' },
      // 11 — strategy address
      { address: ADDR.StrategyManagerV01, abi: STRAT_MGR_ABI, functionName: 'strategy' },
    ],
  })

  const totalAssets      = data?.[0]?.result as bigint | undefined
  const systemModeRaw    = data?.[1]?.result as number | undefined
  const depositsPaused   = data?.[2]?.result as boolean | undefined
  const redeemsPaused    = data?.[3]?.result as boolean | undefined
  const mgmtFeeBps       = data?.[4]?.result as bigint | undefined
  const reserveRatioBps  = data?.[5]?.result as bigint | undefined
  const totalManaged     = data?.[6]?.result as bigint | undefined
  const idleUnderlying   = data?.[7]?.result as bigint | undefined
  const stratPaused      = data?.[8]?.result as boolean | undefined
  const lockLedger       = data?.[9]?.result as string | undefined
  const externalTransfersEnabled = data?.[10]?.result as boolean | undefined
  const strategyAddr     = data?.[11]?.result as string | undefined

  const systemModeKey = (systemModeRaw ?? 0) as SystemModeKey
  const systemModeLabel = SystemMode[systemModeKey] ?? '—'

  // ── Write hook (single shared instance per action group) ────────────────────
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

  // Helper: send tx
  async function send(action: string, fn: () => void) {
    reset()
    setLastAction(action)
    setActionHash(undefined)
    fn()
  }

  // Track hash when it arrives — moved into useEffect to avoid render-phase side effects
  useEffect(() => {
    if (txHash && txHash !== actionHash) {
      setActionHash(txHash)
      refetch()
    }
  }, [txHash])

  const isLoading = isPending || txPending

  // ── Derived ─────────────────────────────────────────────────────────────────
  const fmtBool = (v: boolean | undefined, trueLabel: string, falseLabel: string) =>
    v === undefined ? '—' : v ? trueLabel : falseLabel

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Admin Console</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Protocol management — FundVaultV01 &amp; StrategyManagerV01
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 mt-1">
          {([
            { label: 'FundVaultV01',      addr: ADDR.FundVaultV01      },
            { label: 'StrategyManagerV01', addr: ADDR.StrategyManagerV01 },
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
            { label: 'Strategy Managed',value: totalManaged !== undefined ? `$${formatUSDC(totalManaged)}` : '—' },
            { label: 'Strategy Idle',   value: idleUnderlying !== undefined ? `$${formatUSDC(idleUnderlying)}` : '—' },
            { label: 'System Mode',     value: systemModeLabel },
            { label: 'Deposits',        value: fmtBool(depositsPaused, 'PAUSED', 'OPEN') },
            { label: 'Redeems',         value: fmtBool(redeemsPaused, 'PAUSED', 'OPEN') },
            { label: 'Mgmt Fee',        value: mgmtFeeBps !== undefined ? `${mgmtFeeBps} bps/mo` : '—' },
            { label: 'Reserve Target',  value: reserveRatioBps !== undefined ? bpsToPercent(reserveRatioBps) : '—' },
            { label: 'Strategy Paused', value: fmtBool(stratPaused, 'YES', 'NO') },
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

      {/* ── Deposit / Redeem controls ─────────────────────────────────────────── */}
      <Section icon="toggle_on" title="Deposit &amp; Redeem Toggles">
        <ActionRow label="Deposits" description="Pause or unpause new deposits into the vault">
          <button
            disabled={isLoading}
            onClick={() => send('pauseDeposits', () => writeContract({ address: ADDR.FundVaultV01, abi: VAULT_ABI, functionName: 'pauseDeposits' }))}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-error text-on-error hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Pause
          </button>
          <button
            disabled={isLoading}
            onClick={() => send('unpauseDeposits', () => writeContract({ address: ADDR.FundVaultV01, abi: VAULT_ABI, functionName: 'unpauseDeposits' }))}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Unpause
          </button>
        </ActionRow>
        <ActionRow label="Redeems" description="Pause or unpause redemptions from the vault">
          <button
            disabled={isLoading}
            onClick={() => send('pauseRedeems', () => writeContract({ address: ADDR.FundVaultV01, abi: VAULT_ABI, functionName: 'pauseRedeems' }))}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-error text-on-error hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Pause
          </button>
          <button
            disabled={isLoading}
            onClick={() => send('unpauseRedeems', () => writeContract({ address: ADDR.FundVaultV01, abi: VAULT_ABI, functionName: 'unpauseRedeems' }))}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Unpause
          </button>
        </ActionRow>
        {lastAction.includes('ause') && (
          <TxBanner hash={actionHash} isPending={txPending} isSuccess={txSuccess} />
        )}
      </Section>

      {/* ── System mode ───────────────────────────────────────────────────────── */}
      <Section icon="shield" title="System Mode">
        <ActionRow label="Set Mode" description="0 = Normal · 1 = Paused · 2 = EmergencyExit">
          <select
            value={newMode}
            onChange={(e) => setNewMode(e.target.value as '0' | '1' | '2')}
            className="px-3 py-2 rounded-lg border border-outline-variant text-sm bg-surface-container text-on-surface outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="0">0 — Normal</option>
            <option value="1">1 — Paused</option>
            <option value="2">2 — EmergencyExit</option>
          </select>
          <button
            disabled={isLoading}
            onClick={() =>
              send('setMode', () =>
                writeContract({
                  address: ADDR.FundVaultV01,
                  abi: VAULT_ABI,
                  functionName: 'setMode',
                  args: [Number(newMode)],
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Apply
          </button>
        </ActionRow>
        {lastAction === 'setMode' && (
          <TxBanner hash={actionHash} isPending={txPending} isSuccess={txSuccess} />
        )}
      </Section>

      {/* ── Fee parameters ────────────────────────────────────────────────────── */}
      <Section icon="percent" title="Fee Parameters">
        <ActionRow
          label="Management Fee"
          description={`Current: ${mgmtFeeBps !== undefined ? `${mgmtFeeBps} bps/mo` : '—'} · Max 200 bps/mo`}
        >
          <input
            type="number"
            min="0"
            max="200"
            placeholder="bps"
            value={newMgmtFee}
            onChange={(e) => setNewMgmtFee(e.target.value)}
            className="w-24 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
          />
          <button
            disabled={isLoading || !newMgmtFee}
            onClick={() =>
              send('setMgmtFee', () =>
                writeContract({
                  address: ADDR.FundVaultV01,
                  abi: VAULT_ABI,
                  functionName: 'setMgmtFeeBpsPerMonth',
                  args: [BigInt(newMgmtFee)],
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Set
          </button>
        </ActionRow>
        <ActionRow
          label="Reserve Ratio"
          description={`Current: ${reserveRatioBps !== undefined ? bpsToPercent(reserveRatioBps) : '—'} · Basis points`}
        >
          <input
            type="number"
            min="0"
            max="10000"
            placeholder="bps"
            value={newReserveRatio}
            onChange={(e) => setNewReserveRatio(e.target.value)}
            className="w-24 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
          />
          <button
            disabled={isLoading || !newReserveRatio}
            onClick={() =>
              send('setReserveRatio', () =>
                writeContract({
                  address: ADDR.FundVaultV01,
                  abi: VAULT_ABI,
                  functionName: 'setReserveRatioBps',
                  args: [BigInt(newReserveRatio)],
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Set
          </button>
        </ActionRow>
        <ActionRow label="Accrue Management Fee" description="Manually trigger fee accrual on the vault">
          <button
            disabled={isLoading}
            onClick={() =>
              send('accrueManagementFee', () =>
                writeContract({
                  address: ADDR.FundVaultV01,
                  abi: VAULT_ABI,
                  functionName: 'accrueManagementFee',
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-secondary text-on-secondary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Accrue Now
          </button>
        </ActionRow>
        {(lastAction === 'setMgmtFee' || lastAction === 'setReserveRatio' || lastAction === 'accrueManagementFee') && (
          <TxBanner hash={actionHash} isPending={txPending} isSuccess={txSuccess} />
        )}
      </Section>

      {/* ── Allowlist ─────────────────────────────────────────────────────────── */}
      <Section icon="person_check" title="Allowlist">
        <ActionRow
          label="Address"
          description="Add or remove an address from the vault allowlist"
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
              send('addToAllowlist', () =>
                writeContract({
                  address: ADDR.FundVaultV01,
                  abi: VAULT_ABI,
                  functionName: 'addToAllowlist',
                  args: [allowlistAddr as Address],
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Add
          </button>
          <button
            disabled={isLoading || !isAddress(allowlistAddr)}
            onClick={() =>
              send('removeFromAllowlist', () =>
                writeContract({
                  address: ADDR.FundVaultV01,
                  abi: VAULT_ABI,
                  functionName: 'removeFromAllowlist',
                  args: [allowlistAddr as Address],
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-error text-on-error hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Remove
          </button>
        </ActionRow>
        {(lastAction === 'addToAllowlist' || lastAction === 'removeFromAllowlist') && (
          <TxBanner hash={actionHash} isPending={txPending} isSuccess={txSuccess} />
        )}
      </Section>

      {/* ── Strategy management ───────────────────────────────────────────────── */}
      <Section icon="moving" title="Strategy Management">
        <ActionRow
          label="Transfer to Strategy Manager"
          description="Move USDC from vault to StrategyManagerV01"
        >
          <input
            type="number"
            min="0"
            placeholder="USDC"
            value={transferAmt}
            onChange={(e) => setTransferAmt(e.target.value)}
            className="w-28 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
          />
          <button
            disabled={isLoading || !transferAmt || Number(transferAmt) <= 0}
            onClick={() =>
              send('transferToStrategyManager', () =>
                writeContract({
                  address: ADDR.FundVaultV01,
                  abi: VAULT_ABI,
                  functionName: 'transferToStrategyManager',
                  args: [parseUnits(transferAmt, 6)],
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-secondary text-on-secondary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Transfer
          </button>
        </ActionRow>
        <ActionRow
          label="Invest"
          description="Deploy idle USDC from StrategyManagerV01 into the active strategy"
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
                  address: ADDR.StrategyManagerV01,
                  abi: STRAT_MGR_ABI,
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
          label="Divest"
          description="Withdraw USDC from active strategy back to StrategyManagerV01"
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
                  address: ADDR.StrategyManagerV01,
                  abi: STRAT_MGR_ABI,
                  functionName: 'divest',
                  args: [parseUnits(divestAmt, 6)],
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-secondary text-on-secondary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Divest
          </button>
        </ActionRow>
        <ActionRow
          label="Return to Vault"
          description="Send idle USDC from StrategyManagerV01 back to the vault"
        >
          <input
            type="number"
            min="0"
            placeholder="USDC"
            value={returnAmt}
            onChange={(e) => setReturnAmt(e.target.value)}
            className="w-28 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
          />
          <button
            disabled={isLoading || !returnAmt || Number(returnAmt) <= 0}
            onClick={() =>
              send('returnToVault', () =>
                writeContract({
                  address: ADDR.StrategyManagerV01,
                  abi: STRAT_MGR_ABI,
                  functionName: 'returnToVault',
                  args: [parseUnits(returnAmt, 6)],
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-secondary text-on-secondary hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Return
          </button>
        </ActionRow>
        {(lastAction === 'transferToStrategyManager' ||
          lastAction === 'invest' ||
          lastAction === 'divest' ||
          lastAction === 'returnToVault') && (
          <TxBanner hash={actionHash} isPending={txPending} isSuccess={txSuccess} />
        )}
      </Section>

      {/* ── Emergency ─────────────────────────────────────────────────────────── */}
      <Section icon="emergency" title="Emergency">
        <ActionRow
          label="Emergency Exit (Strategy)"
          description="Trigger emergency exit on StrategyManagerV01 — irreversible"
        >
          <button
            disabled={isLoading}
            onClick={() =>
              send('emergencyExit', () =>
                writeContract({
                  address: ADDR.StrategyManagerV01,
                  abi: STRAT_MGR_ABI,
                  functionName: 'emergencyExit',
                })
              )
            }
            className="px-5 py-2.5 rounded-lg text-sm font-bold bg-error text-on-error hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">warning</span>
              Emergency Exit
            </span>
          </button>
        </ActionRow>
        {lastAction === 'emergencyExit' && (
          <TxBanner hash={actionHash} isPending={txPending} isSuccess={txSuccess} />
        )}

        {/* Open Exit Round — with vault free balance display */}
        {(() => {
          // Issue #2: clamp to 0n — BigInt subtraction can go negative if data is transiently stale
          const vaultFreeUSDC = totalAssets !== undefined && totalManaged !== undefined
            ? (totalAssets > totalManaged ? totalAssets - totalManaged : 0n)
            : undefined
          const parsedExitAmt = exitRoundAmt && Number(exitRoundAmt) > 0
            ? parseUnits(exitRoundAmt, 6)
            : 0n
          const overFree = vaultFreeUSDC !== undefined && parsedExitAmt > vaultFreeUSDC
          // Issue #4: openExitModeRound requires EmergencyExit mode (contract reverts otherwise)
          const notEmergencyMode = systemModeRaw !== undefined && systemModeRaw !== 2
          return (
            <div className="py-4 border-b border-outline-variant/40 last:border-0 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-on-surface">Open Exit Round</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Open a new exit round — specify USDC available for pro-rata claims
                  </p>
                  {vaultFreeUSDC !== undefined && (
                    <div className="mt-2 inline-flex items-center gap-1.5 bg-surface-container rounded-lg px-3 py-1.5">
                      <span className="material-symbols-outlined text-sm text-on-surface-variant">
                        account_balance_wallet
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        Vault free USDC:{' '}
                        <strong className="text-on-surface font-mono">
                          ${formatUSDC(vaultFreeUSDC)}
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setExitRoundAmt(formatUnits(vaultFreeUSDC, 6))}
                        className="ml-1 text-xs font-bold text-primary bg-primary-fixed px-2 py-0.5 rounded-md hover:bg-primary hover:text-on-primary transition-colors"
                      >
                        MAX
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min="0"
                    placeholder="USDC amount"
                    value={exitRoundAmt}
                    onChange={e => setExitRoundAmt(e.target.value)}
                    className={`w-40 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                      overFree ? 'border-error' : 'border-outline-variant'
                    }`}
                  />
                  {/* Issue #3: add isLoading guard; Issue #4: disable when not in EmergencyExit */}
                  <button
                    disabled={isLoading || notEmergencyMode || !exitRoundAmt || Number(exitRoundAmt) <= 0}
                    onClick={() =>
                      send('openExitRound', () =>
                        writeContract({
                          address: ADDR.FundVaultV01,
                          abi: VAULT_ABI,
                          functionName: 'openExitModeRound',
                          args: [parseUnits(exitRoundAmt, 6)],
                        })
                      )
                    }
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    Open Round
                  </button>
                </div>
              </div>
              {/* Issue #4: explain why button is disabled when mode is wrong */}
              {notEmergencyMode && (
                <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  Requires <strong className="mx-0.5">EmergencyExit</strong> mode — current mode is{' '}
                  <strong className="ml-0.5">{systemModeLabel}</strong>. Set mode to EmergencyExit first.
                </div>
              )}
              {overFree && (
                <div className="flex items-center gap-2 text-xs bg-error-container text-on-error-container rounded-lg px-3 py-2">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  Amount exceeds vault free balance (${formatUSDC(vaultFreeUSDC!)}). Transaction will likely revert.
                </div>
              )}
            </div>
          )
        })()}
        {lastAction === 'openExitRound' && (
          <TxBanner hash={actionHash} isPending={txPending} isSuccess={txSuccess} />
        )}

        <ActionRow
          label="Close Exit Round"
          description="Close the current exit round — no further claims allowed after this"
        >
          <button
            disabled={isLoading}
            onClick={() =>
              send('closeExitRound', () =>
                writeContract({
                  address: ADDR.FundVaultV01,
                  abi: VAULT_ABI,
                  functionName: 'closeExitModeRound',
                })
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-error-container text-on-error-container hover:bg-error hover:text-on-error disabled:opacity-40 transition-colors"
          >
            Close Round
          </button>
        </ActionRow>
        {lastAction === 'closeExitRound' && (
          <TxBanner hash={actionHash} isPending={txPending} isSuccess={txSuccess} />
        )}
      </Section>

      {/* ── Pre-launch Verification ───────────────────────────────────────────── */}
      <Section icon="checklist" title="Pre-launch Verification">
        <div className="space-y-3">
          <p className="text-xs text-on-surface-variant mb-4">
            Verify critical on-chain parameters before opening the vault to users.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* lockLedger */}
            <div className="bg-surface-container rounded-xl px-4 py-3">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1.5">
                Lock Ledger
              </p>
              {lockLedger === undefined ? (
                <p className="text-sm font-mono text-on-surface-variant">Loading…</p>
              ) : lockLedger === '0x0000000000000000000000000000000000000000' ? (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-amber-500">warning</span>
                  <span className="text-sm font-semibold text-amber-600">Not set (zero address)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                  <a
                    href={`https://basescan.org/address/${lockLedger}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-primary hover:underline"
                  >
                    {lockLedger.slice(0, 8)}…{lockLedger.slice(-6)}
                  </a>
                </div>
              )}
            </div>

            {/* externalTransfersEnabled */}
            <div className="bg-surface-container rounded-xl px-4 py-3">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1.5">
                External Transfers
              </p>
              {externalTransfersEnabled === undefined ? (
                <p className="text-sm font-mono text-on-surface-variant">Loading…</p>
              ) : externalTransfersEnabled ? (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                  <span className="text-sm font-semibold text-primary">Enabled</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-amber-500">warning</span>
                  <span className="text-sm font-semibold text-amber-600">Disabled — strategy invest blocked</span>
                </div>
              )}
            </div>

            {/* mgmtFeeBpsPerMonth */}
            <div className="bg-surface-container rounded-xl px-4 py-3">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1.5">
                Mgmt Fee / Month
              </p>
              {mgmtFeeBps === undefined ? (
                <p className="text-sm font-mono text-on-surface-variant">Loading…</p>
              ) : mgmtFeeBps === 0n ? (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-amber-500">warning</span>
                  <span className="text-sm font-semibold text-amber-600">0 bps — fee not configured</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                  <span className="text-sm font-bold text-on-surface font-mono">{mgmtFeeBps.toString()} bps/mo</span>
                </div>
              )}
            </div>

            {/* strategy address */}
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

          </div>
        </div>
      </Section>

    </div>
  )
}
