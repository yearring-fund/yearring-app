import { useState } from 'react'
import {
  useAccount, useReadContract, useReadContracts,
  useWriteContract, useWaitForTransactionReceipt,
  useConnect, useDisconnect,
} from 'wagmi'
import { useNavigate, useLocation } from 'react-router-dom'
import { injected } from 'wagmi/connectors'
import { parseUnits, formatUnits, isAddress, type Address } from 'viem'
import { ADDR, VAULT_ABI, STRAT_MGR_ABI } from '../lib/contracts'
import { parseTxError, parseReadError } from '../lib/txError'

const ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000' as const

const NAV = [
  { label: 'Home',       path: '/'           },
  { label: 'Portfolio',  path: '/portfolio'  },
  { label: 'Governance', path: '/governance' },
  { label: 'Settings',   path: '/settings'   },
] as const

// ── Formatters ────────────────────────────────────────────────────────────
function fmtU(n: bigint) { return Number(formatUnits(n, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtS(n: bigint) { return Number(formatUnits(n, 18)).toFixed(6) }
function trunc(a: string) { return a.slice(0, 6) + '…' + a.slice(-4) }

// ── UI primitives ─────────────────────────────────────────────────────────
function Section({ icon, title, children, defaultOpen = true }: {
  icon: string; title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#f5f5f0' }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[#ededea] transition-colors">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-[#18281e]">{icon}</span>
          <span className="text-sm font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>{title}</span>
        </div>
        <span className="material-symbols-outlined text-base text-[#434844]/40 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
      </button>
      {open && <div className="px-5 pb-5 space-y-1" style={{ borderTop: '1px solid #e8e8e2' }}>{children}</div>}
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 last:pb-0" style={{ borderBottom: '1px solid #e8e8e230' }}>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-[#1b1c1a]">{label}</div>
        {hint && <div className="text-[10px] text-[#434844]/50 mt-0.5">{hint}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function Inp({ value, onChange, placeholder, w = 'w-28' }: { value: string; onChange: (v: string) => void; placeholder?: string; w?: string }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={`${w} px-3 py-1.5 rounded-lg text-xs font-mono text-[#1b1c1a] focus:outline-none`}
      style={{ background: 'white', border: '1px solid #e8e8e2' }} />
  )
}

function Btn({ onClick, disabled, children, red }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; red?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="px-3.5 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40 transition-all"
      style={red
        ? { background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a540' }
        : { background: 'linear-gradient(135deg, #18281e, #2d3e33)', color: 'white' }}>
      {children}
    </button>
  )
}

function TxFb({ hash, ok, err }: { hash?: string; ok: boolean; err: string }) {
  if (!hash && !err) return null
  if (err) return <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-1.5 mt-1">{err}</div>
  if (ok) return (
    <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5 mt-1">
      <span className="material-symbols-outlined text-sm">check_circle</span>
      Confirmed · <a href={`https://basescan.org/tx/${hash}`} target="_blank" rel="noreferrer" className="underline">BaseScan</a>
    </div>
  )
  return (
    <div className="flex items-center gap-1.5 text-xs text-[#434844]/50 bg-[#f0f0ec] rounded-lg px-3 py-1.5 mt-1">
      <div className="w-3 h-3 rounded-full border border-[#434844]/30 border-t-[#434844] animate-spin" />
      Waiting…
    </div>
  )
}

// ── Section components (each owns its write hooks) ─────────────────────────

function VaultControls({ depositsPaused, redeemsPaused, onDone }: {
  depositsPaused: boolean; redeemsPaused: boolean; onDone: () => void
}) {
  const [mode, setMode] = useState<'0'|'1'|'2'>('0')
  const { writeContractAsync, isPending } = useWriteContract()
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [err, setErr] = useState('')
  const { isLoading: wait, isSuccess } = useWaitForTransactionReceipt({ hash })
  const busy = isPending || wait

  async function tx(fn: string, args?: unknown[]) {
    setErr(''); setHash(undefined)
    try {
      setHash(await writeContractAsync({
        address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
        functionName: fn as never, args: args as never,
      }))
      setTimeout(onDone, 3000)
    } catch (e) { setErr(parseTxError(e)) }
  }

  return (
    <Section icon="toggle_on" title="Vault Controls">
      <Row label="Deposits" hint={depositsPaused ? '⚠ Currently paused' : 'Currently open'}>
        <Btn onClick={() => tx('pauseDeposits')}   disabled={busy || depositsPaused}  red>Pause</Btn>
        <Btn onClick={() => tx('unpauseDeposits')} disabled={busy || !depositsPaused}>Unpause</Btn>
      </Row>
      <Row label="Redeems" hint={redeemsPaused ? '⚠ Currently paused' : 'Currently open'}>
        <Btn onClick={() => tx('pauseRedeems')}   disabled={busy || redeemsPaused}  red>Pause</Btn>
        <Btn onClick={() => tx('unpauseRedeems')} disabled={busy || !redeemsPaused}>Unpause</Btn>
      </Row>
      <Row label="System Mode" hint="0=Normal · 1=Paused · 2=EmergencyExit">
        <select value={mode} onChange={e => setMode(e.target.value as '0'|'1'|'2')}
          className="px-3 py-1.5 rounded-lg text-xs font-mono bg-white text-[#1b1c1a] focus:outline-none"
          style={{ border: '1px solid #e8e8e2' }}>
          <option value="0">0 — Normal</option>
          <option value="1">1 — Paused</option>
          <option value="2">2 — Emergency Exit</option>
        </select>
        <Btn onClick={() => tx('setMode', [Number(mode)])} disabled={busy}>{busy ? '…' : 'Apply'}</Btn>
      </Row>
      <TxFb hash={hash} ok={isSuccess} err={err} />
    </Section>
  )
}

function FeeControls({ mgmtFeeBps, reserveBps, treasuryAddr, treasuryShares, feeUSDC, onDone }: {
  mgmtFeeBps: bigint; reserveBps: bigint
  treasuryAddr?: Address; treasuryShares?: bigint; feeUSDC?: bigint
  onDone: () => void
}) {
  const [mgmtFee, setMgmtFee] = useState('')
  const [reserve, setReserve] = useState('')
  const { writeContractAsync, isPending } = useWriteContract()
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [err,  setErr]  = useState('')
  const { isLoading: wait, isSuccess } = useWaitForTransactionReceipt({ hash })
  const busy = isPending || wait

  async function tx(fn: string, args?: unknown[]) {
    setErr(''); setHash(undefined)
    try {
      setHash(await writeContractAsync({
        address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
        functionName: fn as never, args: args as never,
      }))
      setTimeout(onDone, 3000)
    } catch (e) { setErr(parseTxError(e)) }
  }

  return (
    <Section icon="percent" title="Fee Management" defaultOpen={false}>
      {/* Treasury balance */}
      <div className="grid grid-cols-3 gap-2 py-3">
        {[
          { label: 'Treasury',        value: treasuryAddr ? trunc(treasuryAddr) : '—', link: treasuryAddr ? `https://basescan.org/address/${treasuryAddr}` : undefined },
          { label: 'Accrued Shares',  value: treasuryShares ? fmtS(treasuryShares) : '—' },
          { label: 'Redeemable USDC', value: feeUSDC ? `$${fmtU(feeUSDC)}` : '—' },
        ].map(({ label, value, link }) => (
          <div key={label} className="bg-white/60 rounded-xl px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-widest text-[#434844]/50">{label}</div>
            {link
              ? <a href={link} target="_blank" rel="noreferrer" className="text-xs font-mono text-[#18281e] underline">{value}</a>
              : <div className="text-xs font-mono font-bold text-[#1b1c1a] mt-0.5">{value}</div>
            }
          </div>
        ))}
      </div>
      <Row label="Management Fee" hint={`Current: ${mgmtFeeBps} bps/mo · max 200`}>
        <Inp value={mgmtFee} onChange={setMgmtFee} placeholder="bps" w="w-20" />
        <Btn onClick={() => tx('setMgmtFeeBpsPerMonth', [BigInt(mgmtFee)])} disabled={busy || !mgmtFee}>Set</Btn>
      </Row>
      <Row label="Reserve Ratio" hint={`Current: ${(Number(reserveBps)/100).toFixed(1)}% · in bps`}>
        <Inp value={reserve} onChange={setReserve} placeholder="bps" w="w-20" />
        <Btn onClick={() => tx('setReserveRatioBps', [BigInt(reserve)])} disabled={busy || !reserve}>Set</Btn>
      </Row>
      <Row label="Accrue Management Fee" hint="Manually trigger fee accrual">
        <Btn onClick={() => tx('accrueManagementFee')} disabled={busy}>Accrue Now</Btn>
      </Row>
      <Row label="Collect All Fees" hint="Redeem treasury shares to USDC">
        <Btn onClick={() => tx('redeem', [treasuryShares, treasuryAddr, treasuryAddr])}
          disabled={busy || !treasuryShares || treasuryShares === 0n || !treasuryAddr}>
          Collect All
        </Btn>
      </Row>
      <TxFb hash={hash} ok={isSuccess} err={err} />
    </Section>
  )
}

function AllowlistControls({ onDone }: { onDone: () => void }) {
  const [addr, setAddr] = useState('')
  const { writeContractAsync, isPending } = useWriteContract()
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [err,  setErr]  = useState('')
  const { isLoading: wait, isSuccess } = useWaitForTransactionReceipt({ hash })
  const busy = isPending || wait
  const valid = isAddress(addr)

  async function tx(fn: string) {
    setErr(''); setHash(undefined)
    try {
      setHash(await writeContractAsync({
        address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
        functionName: fn as never, args: [addr as Address],
      }))
      setTimeout(onDone, 3000)
    } catch (e) { setErr(parseTxError(e)) }
  }

  return (
    <Section icon="person_check" title="Allowlist" defaultOpen={false}>
      <Row label="Address" hint="Add or remove from vault allowlist">
        <Inp value={addr} onChange={setAddr} placeholder="0x…" w="w-52" />
        <Btn onClick={() => tx('addToAllowlist')}      disabled={busy || !valid}>Add</Btn>
        <Btn onClick={() => tx('removeFromAllowlist')} disabled={busy || !valid} red>Remove</Btn>
      </Row>
      {addr && !valid && <div className="text-[11px] text-red-500 pl-1">Invalid address</div>}
      <TxFb hash={hash} ok={isSuccess} err={err} />
    </Section>
  )
}

function StrategyControls({ totalAssets, stratManaged, stratIdle, onDone }: {
  totalAssets: bigint; stratManaged: bigint; stratIdle: bigint; onDone: () => void
}) {
  const [transferAmt, setTransferAmt] = useState('')
  const [investAmt,   setInvestAmt]   = useState('')
  const [divestAmt,   setDivestAmt]   = useState('')
  const [returnAmt,   setReturnAmt]   = useState('')

  const { writeContractAsync, isPending } = useWriteContract()
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [err,  setErr]  = useState('')
  const { isLoading: wait, isSuccess } = useWaitForTransactionReceipt({ hash })
  const busy = isPending || wait

  async function vaultTx(fn: string, args: unknown[]) {
    setErr(''); setHash(undefined)
    try {
      setHash(await writeContractAsync({ address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI, functionName: fn as never, args: args as never }))
      setTimeout(onDone, 3000)
    } catch (e) { setErr(parseTxError(e)) }
  }
  async function stratTx(fn: string, args: unknown[]) {
    setErr(''); setHash(undefined)
    try {
      setHash(await writeContractAsync({ address: ADDR.StrategyManagerV01 as Address, abi: STRAT_MGR_ABI, functionName: fn as never, args: args as never }))
      setTimeout(onDone, 3000)
    } catch (e) { setErr(parseTxError(e)) }
  }

  const reserveInVault = totalAssets > stratManaged ? totalAssets - stratManaged : 0n

  return (
    <Section icon="moving" title="Strategy" defaultOpen={false}>
      <div className="grid grid-cols-3 gap-2 py-3">
        {[
          { label: 'Vault Reserve', value: `$${fmtU(reserveInVault)}` },
          { label: 'Deployed',      value: `$${fmtU(stratManaged)}`   },
          { label: 'Strat Idle',    value: `$${fmtU(stratIdle)}`      },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white/60 rounded-xl px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-widest text-[#434844]/50">{label}</div>
            <div className="text-xs font-mono font-bold text-[#1b1c1a] mt-0.5">{value}</div>
          </div>
        ))}
      </div>
      <Row label="Transfer to StrategyManager" hint="Vault → StrategyManagerV01">
        <Inp value={transferAmt} onChange={setTransferAmt} placeholder="USDC" />
        <Btn onClick={() => vaultTx('transferToStrategyManager', [parseUnits(transferAmt || '0', 6)])}
          disabled={busy || !transferAmt || Number(transferAmt) <= 0}>Transfer</Btn>
      </Row>
      <Row label="Invest" hint="Idle → Aave V3">
        <Inp value={investAmt} onChange={setInvestAmt} placeholder="USDC" />
        <Btn onClick={() => stratTx('invest', [parseUnits(investAmt || '0', 6)])}
          disabled={busy || !investAmt || Number(investAmt) <= 0}>Invest</Btn>
      </Row>
      <Row label="Divest" hint="Aave V3 → Idle">
        <Inp value={divestAmt} onChange={setDivestAmt} placeholder="USDC" />
        <Btn onClick={() => stratTx('divest', [parseUnits(divestAmt || '0', 6)])}
          disabled={busy || !divestAmt || Number(divestAmt) <= 0}>Divest</Btn>
      </Row>
      <Row label="Return to Vault" hint="Idle → Vault">
        <Inp value={returnAmt} onChange={setReturnAmt} placeholder="USDC" />
        <Btn onClick={() => stratTx('returnToVault', [parseUnits(returnAmt || '0', 6)])}
          disabled={busy || !returnAmt || Number(returnAmt) <= 0}>Return</Btn>
      </Row>
      <Row label="Emergency Exit Strategy" hint="Pulls all funds back to StrategyManager">
        <Btn onClick={() => stratTx('emergencyExit', [])} disabled={busy} red>Emergency Exit</Btn>
      </Row>
      <TxFb hash={hash} ok={isSuccess} err={err} />
    </Section>
  )
}

function EmergencyControls({ systemMode, totalAssets, stratManaged, currentRoundId, roundOpen, onDone }: {
  systemMode: number; totalAssets: bigint; stratManaged: bigint
  currentRoundId: bigint; roundOpen: boolean; onDone: () => void
}) {
  const [exitAmt, setExitAmt] = useState('')
  const { writeContractAsync, isPending } = useWriteContract()
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [err,  setErr]  = useState('')
  const { isLoading: wait, isSuccess } = useWaitForTransactionReceipt({ hash })
  const busy = isPending || wait

  const maxAvail = totalAssets > stratManaged ? totalAssets - stratManaged : 0n

  async function tx(fn: string, args?: unknown[]) {
    setErr(''); setHash(undefined)
    try {
      setHash(await writeContractAsync({
        address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
        functionName: fn as never, args: (args ?? []) as never,
      }))
      setTimeout(onDone, 3000)
    } catch (e) { setErr(parseTxError(e)) }
  }

  const notEmergency = systemMode !== 2

  return (
    <Section icon="emergency" title="Emergency" defaultOpen={false}>
      {notEmergency && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
          <span className="material-symbols-outlined text-sm">warning</span>
          System mode must be EmergencyExit (2) to open a round.
        </div>
      )}
      <Row label="Open Exit Round" hint={`Max available: $${fmtU(maxAvail)} USDC · Round ${currentRoundId.toString()}`}>
        <Inp value={exitAmt} onChange={setExitAmt} placeholder="USDC" />
        <button onClick={() => setExitAmt(formatUnits(maxAvail, 6))}
          className="text-[10px] font-bold text-[#715a3e] px-2 py-1 rounded hover:bg-[#715a3e]/10">
          MAX
        </button>
        <Btn onClick={() => tx('openExitModeRound', [parseUnits(exitAmt || '0', 6)])}
          disabled={busy || !exitAmt || Number(exitAmt) <= 0 || notEmergency}>
          Open Round
        </Btn>
      </Row>
      <Row label="Close Exit Round" hint={roundOpen ? `Round ${currentRoundId.toString()} is open` : 'No open round'}>
        <Btn onClick={() => tx('closeExitModeRound')} disabled={busy || !roundOpen} red>Close Round</Btn>
      </Row>
      <TxFb hash={hash} ok={isSuccess} err={err} />
    </Section>
  )
}

// ── Admin console ──────────────────────────────────────────────────────────
function AdminConsole() {
  const { data, error: dataError, refetch } = useReadContracts({
    contracts: [
      { address: ADDR.FundVaultV01 as Address,       abi: VAULT_ABI,     functionName: 'totalAssets'             },
      { address: ADDR.FundVaultV01 as Address,       abi: VAULT_ABI,     functionName: 'systemMode'              },
      { address: ADDR.FundVaultV01 as Address,       abi: VAULT_ABI,     functionName: 'depositsPaused'          },
      { address: ADDR.FundVaultV01 as Address,       abi: VAULT_ABI,     functionName: 'redeemsPaused'           },
      { address: ADDR.FundVaultV01 as Address,       abi: VAULT_ABI,     functionName: 'mgmtFeeBpsPerMonth'      },
      { address: ADDR.FundVaultV01 as Address,       abi: VAULT_ABI,     functionName: 'reserveRatioBps'         },
      { address: ADDR.FundVaultV01 as Address,       abi: VAULT_ABI,     functionName: 'treasury'                },
      { address: ADDR.FundVaultV01 as Address,       abi: VAULT_ABI,     functionName: 'currentRoundId'          },
      { address: ADDR.StrategyManagerV01 as Address, abi: STRAT_MGR_ABI, functionName: 'totalManagedAssets'      },
      { address: ADDR.StrategyManagerV01 as Address, abi: STRAT_MGR_ABI, functionName: 'idleUnderlying'          },
      { address: ADDR.StrategyManagerV01 as Address, abi: STRAT_MGR_ABI, functionName: 'paused'                  },
    ],
    query: { refetchInterval: 15_000 },
  })

  const totalAssets    = (data?.[0]?.result as bigint  | undefined) ?? 0n
  const systemMode     = data?.[1]?.result !== undefined ? Number(data[1].result) : 0
  const depositsPaused = (data?.[2]?.result as boolean | undefined) ?? false
  const redeemsPaused  = (data?.[3]?.result as boolean | undefined) ?? false
  const mgmtFeeBps     = (data?.[4]?.result as bigint  | undefined) ?? 0n
  const reserveBps     = (data?.[5]?.result as bigint  | undefined) ?? 0n
  const treasuryAddr   = (data?.[6]?.result as Address | undefined)
  const roundId        = (data?.[7]?.result as bigint  | undefined) ?? 0n
  const stratManaged   = (data?.[8]?.result as bigint  | undefined) ?? 0n
  const stratIdle      = (data?.[9]?.result as bigint  | undefined) ?? 0n
  const stratPaused    = (data?.[10]?.result as boolean| undefined) ?? false

  const MODE_LABEL: Record<number, string> = { 0: 'Normal', 1: 'Paused', 2: 'Emergency Exit' }
  const MODE_COLOR: Record<number, string> = { 0: 'text-emerald-600', 1: 'text-amber-600', 2: 'text-red-600' }

  const { data: tShares } = useReadContract({
    address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
    functionName: 'balanceOf', args: [treasuryAddr ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!treasuryAddr },
  })
  const { data: tUSDC } = useReadContract({
    address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
    functionName: 'convertToAssets', args: [(tShares as bigint | undefined) ?? 0n],
    query: { enabled: (tShares as bigint | undefined) !== undefined },
  })
  const { data: exitRound } = useReadContract({
    address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
    functionName: 'exitRounds', args: [roundId],
    query: { enabled: roundId > 0n },
  })
  const roundOpen = (exitRound as { isOpen: boolean } | undefined)?.isOpen ?? false

  const stats = [
    { label: 'Total Assets',  value: `$${fmtU(totalAssets)}` },
    { label: 'Deployed',      value: `$${fmtU(stratManaged)}` },
    { label: 'Strategy Idle', value: `$${fmtU(stratIdle)}` },
    { label: 'System Mode',   value: MODE_LABEL[systemMode] ?? '—', c: MODE_COLOR[systemMode] },
    { label: 'Deposits',      value: depositsPaused ? 'PAUSED' : 'OPEN', c: depositsPaused ? 'text-red-500' : 'text-emerald-600' },
    { label: 'Redeems',       value: redeemsPaused  ? 'PAUSED' : 'OPEN', c: redeemsPaused  ? 'text-red-500' : 'text-emerald-600' },
    { label: 'Mgmt Fee',      value: `${mgmtFeeBps} bps/mo` },
    { label: 'Reserve Target',value: `${(Number(reserveBps)/100).toFixed(1)}%` },
    { label: 'Strat Paused',  value: stratPaused ? 'YES' : 'NO', c: stratPaused ? 'text-red-500' : '' },
  ]

  return (
    <div className="space-y-4">
      {/* Read error */}
      {dataError && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs text-red-600"
          style={{ background: '#fff1f1', border: '1px solid #fca5a530' }}>
          <span className="material-symbols-outlined text-base flex-shrink-0">cloud_off</span>
          <span className="flex-1">{parseReadError(dataError)}</span>
          <button onClick={() => refetch()} className="font-semibold underline flex-shrink-0">Retry</button>
        </div>
      )}

      {/* Status */}
      <Section icon="monitoring" title="Protocol Status">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
          {stats.map(({ label, value, c }) => (
            <div key={label} className="bg-white/60 rounded-xl px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-[#434844]/50 mb-1">{label}</div>
              <div className={`text-xs font-bold font-mono ${c ?? 'text-[#1b1c1a]'}`}>{value}</div>
            </div>
          ))}
        </div>
      </Section>

      <VaultControls depositsPaused={depositsPaused} redeemsPaused={redeemsPaused} onDone={refetch} />
      <FeeControls
        mgmtFeeBps={mgmtFeeBps} reserveBps={reserveBps}
        treasuryAddr={treasuryAddr}
        treasuryShares={tShares as bigint | undefined}
        feeUSDC={tUSDC as bigint | undefined}
        onDone={refetch}
      />
      <AllowlistControls onDone={refetch} />
      <StrategyControls totalAssets={totalAssets} stratManaged={stratManaged} stratIdle={stratIdle} onDone={refetch} />
      <EmergencyControls
        systemMode={systemMode} totalAssets={totalAssets} stratManaged={stratManaged}
        currentRoundId={roundId} roundOpen={roundOpen} onDone={refetch}
      />
    </div>
  )
}

// ── Gate + page shell ──────────────────────────────────────────────────────
export default function Console() {
  const { address, isConnected } = useAccount()
  const { connect }    = useConnect()
  const { disconnect } = useDisconnect()
  const navigate  = useNavigate()
  const location  = useLocation()

  const { data: isAdmin, isLoading } = useReadContract({
    address: ADDR.FundVaultV01 as Address, abi: VAULT_ABI,
    functionName: 'hasRole',
    args: [ADMIN_ROLE, address as Address],
    query: { enabled: !!address },
  })

  const BOTTOM_NAV = [
    { icon: 'home',       label: 'Home',       path: '/'           },
    { icon: 'cases',      label: 'Portfolio',  path: '/portfolio'  },
    { icon: 'how_to_vote',label: 'Governance', path: '/governance' },
    { icon: 'settings',   label: 'Settings',   path: '/settings'   },
  ] as const

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ background: '#fbf9f5' }}>
      {/* Top nav */}
      <nav className="fixed top-0 w-full z-50 bg-[#fbf9f5]/85 backdrop-blur-xl border-b border-[#c3c8c2]/15">
        <div className="flex justify-between items-center px-5 md:px-8 py-4">
          <div className="flex items-center gap-8">
            <span className="text-xl font-bold text-[#18281e] cursor-pointer"
              style={{ fontFamily: "'Noto Serif', serif" }} onClick={() => navigate('/')}>
              YearRing Fund
            </span>
            <div className="hidden md:flex gap-6">
              {NAV.map(({ label, path }) => {
                const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
                return (
                  <button key={label} onClick={() => navigate(path)}
                    className={`text-sm font-medium tracking-tight pb-0.5 transition-colors ${
                      active ? 'text-[#18281e] border-b-2 border-[#715a3e]' : 'text-[#434844] hover:text-[#18281e]'
                    }`} style={{ fontFamily: "'Noto Serif', serif" }}>
                    {label}
                  </button>
                )
              })}
              <span className="text-sm font-medium text-[#434844]/40 border-l border-[#c3c8c2]/30 pl-6">
                Admin Console
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#c3c8c2]/30 text-xs font-semibold text-[#434844] bg-[#f5f3ef]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#715a3e]" />
              Base Mainnet
            </div>
            {isConnected && address ? (
              <button onClick={() => disconnect()}
                className="bg-[#18281e] text-white px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90">
                {trunc(address)}
              </button>
            ) : (
              <button onClick={() => connect({ connector: injected() })}
                className="bg-[#18281e] text-white px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90">
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-5 md:px-6 pt-24 pb-8">
        <div className="mb-6">
          <h2 className="text-base font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>
            Admin Console
          </h2>
          <p className="mt-1 text-xs text-[#434844]/60">
            Protocol management — FundVaultV01 &amp; StrategyManagerV01
          </p>
        </div>

        {!isConnected ? (
          <div className="rounded-2xl flex flex-col items-center py-16 text-center space-y-3" style={{ background: '#f5f5f0' }}>
            <span className="material-symbols-outlined text-4xl text-[#c3c8c2]">lock</span>
            <p className="text-sm text-[#434844]">Connect your wallet to access the admin console.</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-[#18281e]/20 border-t-[#18281e] animate-spin" />
            <span className="text-xs text-[#434844]/50">Checking permissions…</span>
          </div>
        ) : !isAdmin ? (
          <div className="rounded-2xl flex flex-col items-center py-16 text-center space-y-3" style={{ background: '#f5f5f0' }}>
            <span className="material-symbols-outlined text-4xl text-red-300">gpp_bad</span>
            <p className="text-sm font-semibold text-[#1b1c1a]">Access Denied</p>
            <p className="text-xs text-[#434844]/60 max-w-xs">
              Connected address does not hold <code className="font-mono bg-white px-1 rounded">DEFAULT_ADMIN_ROLE</code> on FundVaultV01.
            </p>
            <p className="font-mono text-[10px] text-[#434844]/40 break-all max-w-xs">{address}</p>
          </div>
        ) : (
          <AdminConsole />
        )}
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 w-full md:hidden flex justify-around items-center px-6 py-3 bg-[#fbf9f5]/85 backdrop-blur-xl border-t border-[#c3c8c2]/15 z-50">
        {BOTTOM_NAV.map(({ icon, label, path }) => {
          const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
          return (
            <button key={path} onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center p-2.5 rounded-xl transition-all ${
                active ? 'bg-[#2d3e33] text-white scale-95' : 'text-[#434844] hover:bg-[#f5f3ef]'
              }`}>
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
}
