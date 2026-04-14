import { useState } from 'react'
import logoUrl from '../assets/logo.svg'
import {
  useAccount, useReadContract, useReadContracts,
  useWriteContract, useWaitForTransactionReceipt, useConnect, useDisconnect,
} from 'wagmi'
import { useNavigate, useLocation } from 'react-router-dom'
import { injected } from 'wagmi/connectors'
import { type Address } from 'viem'
import { ADDR, GOVERNANCE_ABI } from '../lib/contracts'
import { parseTxError, parseReadError } from '../lib/txError'
import { Sk } from '../components/ui/Skeleton'

// ── Constants ──────────────────────────────────────────────────────────────
const PROPOSAL_TYPES = ['Reward Rate', 'Fee Discount', 'Inactivity Threshold', 'General']
const NAV = [
  { label: 'Home',       path: '/'           },
  { label: 'Portfolio',  path: '/portfolio'  },
  { label: 'Governance', path: '/governance' },
  { label: 'Settings',   path: '/settings'   },
] as const
const BOTTOM_NAV = [
  { icon: 'home',       label: 'Home',       path: '/'           },
  { icon: 'cases',      label: 'Portfolio',  path: '/portfolio'  },
  { icon: 'how_to_vote',label: 'Governance', path: '/governance' },
  { icon: 'settings',   label: 'Settings',   path: '/settings'   },
] as const

type Proposal = {
  proposer: Address; title: string; description: string
  proposalType: number; startTime: bigint; endTime: bigint
  forVotes: bigint; againstVotes: bigint; abstainVotes: bigint; snapshotId: bigint
}

function truncate(addr: string) { return addr.slice(0, 6) + '…' + addr.slice(-4) }

function fmtRWT(n: bigint) {
  return (Number(n) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function timeLeft(endTime: bigint, now: number) {
  const secs = Number(endTime) - now
  if (secs <= 0) return 'Ended'
  const days = Math.floor(secs / 86400)
  const hrs  = Math.floor((secs % 86400) / 3600)
  const mins = Math.floor((secs % 3600) / 60)
  if (days > 0) return `${days}d ${hrs}h left`
  if (hrs  > 0) return `${hrs}h ${mins}m left`
  return `${mins}m left`
}

function proposalState(p: Proposal, now: number): 'Active' | 'Succeeded' | 'Defeated' {
  if (now < Number(p.endTime)) return 'Active'
  return p.forVotes > p.againstVotes ? 'Succeeded' : 'Defeated'
}

// ── State badge ────────────────────────────────────────────────────────────
function StateBadge({ state }: { state: 'Active' | 'Succeeded' | 'Defeated' }) {
  const cfg = {
    Active:    { dot: 'bg-blue-500 animate-pulse', text: 'text-blue-700',   bg: 'bg-blue-50'   },
    Succeeded: { dot: 'bg-emerald-500',             text: 'text-emerald-700',bg: 'bg-emerald-50'},
    Defeated:  { dot: 'bg-red-400',                 text: 'text-red-600',    bg: 'bg-red-50'    },
  }[state]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {state}
    </span>
  )
}

// ── Vote bar ───────────────────────────────────────────────────────────────
function VoteBar({ p }: { p: Proposal }) {
  const total = p.forVotes + p.againstVotes + p.abstainVotes
  const pct = (n: bigint) => total > 0n ? Number((n * 100n) / total) : 0
  const forPct     = pct(p.forVotes)
  const againstPct = pct(p.againstVotes)
  const abstainPct = pct(p.abstainVotes)
  return (
    <div className="space-y-1.5">
      <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-[#e8e8e2]">
        <div className="bg-emerald-400 transition-all" style={{ width: `${forPct}%` }} />
        <div className="bg-red-400 transition-all"     style={{ width: `${againstPct}%` }} />
        <div className="bg-[#c3c8c2] transition-all"  style={{ width: `${abstainPct}%` }} />
      </div>
      <div className="flex gap-4 text-[10px] text-[#434844]/60">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          For {fmtRWT(p.forVotes)} RWT
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          Against {fmtRWT(p.againstVotes)} RWT
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#c3c8c2]" />
          Abstain {fmtRWT(p.abstainVotes)} RWT
        </span>
      </div>
    </div>
  )
}

// ── Proposal card ──────────────────────────────────────────────────────────
function ProposalCard({
  id, p, votingPower, threshold, hasVoted,
}: {
  id: number; p: Proposal; votingPower: bigint; threshold: bigint; hasVoted: boolean
}) {
  const now   = Math.floor(Date.now() / 1000)
  const state = proposalState(p, now)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [txErr,  setTxErr]  = useState('')

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const busy = isPending || confirming

  const canVote = state === 'Active' && !hasVoted && votingPower >= threshold

  async function vote(voteType: 0 | 1 | 2) {
    setTxErr('')
    try {
      const h = await writeContractAsync({
        address: ADDR.GovernanceSignalV02 as Address,
        abi: GOVERNANCE_ABI,
        functionName: 'castVote',
        args: [BigInt(id), voteType],
      })
      setTxHash(h)
    } catch (e) { setTxErr(parseTxError(e)) }
  }

  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ background: '#f5f5f0' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-[#434844]/40 font-mono">#{id}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#18281e]/8 text-[#18281e] font-semibold">
              {PROPOSAL_TYPES[p.proposalType] ?? 'General'}
            </span>
            <StateBadge state={state} />
            {state === 'Active' && (
              <span className="text-[10px] text-[#434844]/50">{timeLeft(p.endTime, now)}</span>
            )}
          </div>
          <h3 className="text-sm font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>
            {p.title}
          </h3>
          {p.description && (
            <p className="text-xs text-[#434844]/60 mt-1 leading-relaxed line-clamp-2">
              {p.description}
            </p>
          )}
        </div>
      </div>

      {/* Vote bar */}
      <VoteBar p={p} />

      {/* Vote actions */}
      {canVote && !isSuccess && (
        <div className="flex gap-2 flex-wrap">
          {([['For', 0, '#16a34a', '#f0fdf4'], ['Against', 1, '#dc2626', '#fef2f2'], ['Abstain', 2, '#6b7280', '#f9fafb']] as const).map(
            ([label, type, color, bg]) => (
              <button
                key={label}
                onClick={() => vote(type as 0 | 1 | 2)}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-all"
                style={{ background: bg, color }}
              >
                {busy ? '…' : label}
              </button>
            )
          )}
        </div>
      )}

      {/* Already voted */}
      {hasVoted && state === 'Active' && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#18281e]/60">
          <span className="material-symbols-outlined text-sm">check_circle</span>
          You have voted on this proposal
        </div>
      )}

      {/* Insufficient power */}
      {!canVote && !hasVoted && state === 'Active' && (
        <div className="text-[11px] text-[#434844]/50">
          Need ≥ {fmtRWT(threshold)} RWT to vote · you have {fmtRWT(votingPower)} RWT
        </div>
      )}

      {/* Tx feedback */}
      {isSuccess && (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
          <span className="material-symbols-outlined text-sm">check_circle</span>
          Vote submitted.{' '}
          <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" className="underline">
            View
          </a>
        </div>
      )}
      {txErr && (
        <div className="text-[11px] text-red-500 bg-red-50 rounded-lg px-3 py-2">{txErr}</div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function GovernancePage() {
  const { address, isConnected } = useAccount()
  const { connect }    = useConnect()
  const { disconnect } = useDisconnect()
  const navigate  = useNavigate()
  const location  = useLocation()

  const [newTitle, setNewTitle] = useState('')
  const [newDesc,  setNewDesc]  = useState('')
  const [newType,  setNewType]  = useState(3)
  const [createErr, setCreateErr] = useState('')
  const [createHash, setCreateHash] = useState<`0x${string}` | undefined>()

  // ── Reads ────────────────────────────────────────────────────────────────
  const { data: govData, error: govError, refetch: refetchGov } = useReadContracts({
    contracts: [
      { address: ADDR.GovernanceSignalV02 as Address, abi: GOVERNANCE_ABI, functionName: 'nextProposalId' },
      { address: ADDR.GovernanceSignalV02 as Address, abi: GOVERNANCE_ABI, functionName: 'votingThreshold' },
      { address: ADDR.GovernanceSignalV02 as Address, abi: GOVERNANCE_ABI, functionName: 'votingPowerOf', args: [address as Address] },
      { address: ADDR.GovernanceSignalV02 as Address, abi: GOVERNANCE_ABI, functionName: 'PROPOSER_ROLE' },
    ],
    query: { enabled: !!address },
  })
  const nextId       = Number((govData?.[0]?.result as bigint | undefined) ?? 0n)
  const threshold    = (govData?.[1]?.result as bigint | undefined) ?? 0n
  const votingPower  = (govData?.[2]?.result as bigint | undefined) ?? 0n
  const proposerRole = govData?.[3]?.result as `0x${string}` | undefined

  const { data: isProposerRaw } = useReadContract({
    address: ADDR.GovernanceSignalV02 as Address, abi: GOVERNANCE_ABI,
    functionName: 'hasRole',
    args: [proposerRole as `0x${string}`, address as Address],
    query: { enabled: !!proposerRole && !!address },
  })
  const isProposer = isProposerRaw as boolean | undefined

  // Proposal reads
  const proposalIds = Array.from({ length: nextId }, (_, i) => i).reverse() // newest first
  const { data: proposalsRaw, isLoading: proposalsLoading } = useReadContracts({
    contracts: proposalIds.map(id => ({
      address: ADDR.GovernanceSignalV02 as Address, abi: GOVERNANCE_ABI,
      functionName: 'getProposal' as const, args: [BigInt(id)],
    })),
    query: { enabled: nextId > 0 },
  })

  // hasVoted per proposal
  const { data: hasVotedRaw } = useReadContracts({
    contracts: proposalIds.map(id => ({
      address: ADDR.GovernanceSignalV02 as Address, abi: GOVERNANCE_ABI,
      functionName: 'hasVoted' as const, args: [BigInt(id), address as Address],
    })),
    query: { enabled: nextId > 0 && !!address },
  })

  const proposals = proposalIds.map((id, i) => ({
    id,
    data: proposalsRaw?.[i]?.result as Proposal | undefined,
    voted: (hasVotedRaw?.[i]?.result as boolean | undefined) ?? false,
  })).filter(p => !!p.data)

  // ── Create proposal ──────────────────────────────────────────────────────
  const { writeContractAsync: writeCreate, isPending: createPending } = useWriteContract()
  const { isLoading: createConfirming, isSuccess: createSuccess } = useWaitForTransactionReceipt({ hash: createHash })
  const createBusy = createPending || createConfirming

  async function handleCreate() {
    if (!newTitle.trim()) return
    setCreateErr('')
    try {
      const h = await writeCreate({
        address: ADDR.GovernanceSignalV02 as Address,
        abi: GOVERNANCE_ABI,
        functionName: 'createProposal',
        args: [newTitle.trim(), newDesc.trim(), newType],
      })
      setCreateHash(h)
      setNewTitle(''); setNewDesc('')
    } catch (e) { setCreateErr(parseTxError(e)) }
  }

  return (
    <div className="min-h-screen pb-24 md:pb-0" style={{ background: '#fbf9f5' }}>

      {/* ── Top nav ─────────────────────────────────────────────────────── */}
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
            <div className="hidden md:flex gap-6">
              {NAV.map(({ label, path }) => {
                const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
                return (
                  <button key={label} onClick={() => navigate(path)}
                    className={`text-sm font-medium tracking-tight pb-0.5 transition-colors ${
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
              <button onClick={() => disconnect()}
                className="bg-[#18281e] text-white px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 transition-all">
                {truncate(address)}
              </button>
            ) : (
              <button onClick={() => connect({ connector: injected() })}
                className="bg-[#18281e] text-white px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 transition-all">
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-5 md:px-6 pt-24 pb-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>
              Governance
            </h2>
            <p className="mt-1 text-xs text-[#434844]/60">
              Signal your preferences. RWT holders shape protocol parameters.
            </p>
          </div>
          {isConnected && (
            <div className="text-right flex-shrink-0">
              <div className="text-[10px] text-[#434844]/50 uppercase tracking-wide">Your Voting Power</div>
              <div className="text-sm font-bold text-[#1b1c1a]">{fmtRWT(votingPower)} RWT</div>
              <div className="text-[10px] text-[#434844]/40">Threshold: {fmtRWT(threshold)} RWT</div>
            </div>
          )}
        </div>

        {/* Read error */}
        {govError && isConnected && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs text-red-600"
            style={{ background: '#fff1f1', border: '1px solid #fca5a530' }}>
            <span className="material-symbols-outlined text-base flex-shrink-0">cloud_off</span>
            <span className="flex-1">{parseReadError(govError)}</span>
            <button onClick={() => refetchGov()} className="font-semibold underline flex-shrink-0">Retry</button>
          </div>
        )}

        {/* Not connected */}
        {!isConnected && (
          <div className="space-y-4">
            <div className="rounded-2xl p-5 space-y-4" style={{ background: '#f5f5f0' }}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-[#715a3e]">how_to_vote</span>
                <span className="text-xs font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>
                  How governance works
                </span>
              </div>
              <p className="text-xs text-[#434844]/70 leading-relaxed">
                Governance on YearRing is a signal layer — not a multisig. RWT holders vote on protocol parameter proposals. Outcomes inform the core team's decisions; they do not execute autonomously. All admin operations still go through a 24-hour timelock.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {[
                  ['lock', 'Earn RWT by locking fbUSDC shares in the Locks tab. Longer locks earn more.'],
                  ['how_to_vote', 'Hold enough RWT to meet the voting threshold, then cast For / Against / Abstain.'],
                  ['tune', 'Proposal types: Reward Rate, Fee Discount, Inactivity Threshold, General.'],
                ].map(([icon, text]) => (
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
              <p className="text-xs font-semibold text-[#434844]/60">Connect your wallet to view proposals and vote.</p>
            </div>
          </div>
        )}

        {/* Proposals */}
        {isConnected && (
          <>
            {proposalsLoading && nextId > 0 ? (
              <div className="space-y-4">
                {Array.from({ length: Math.min(nextId, 3) }).map((_, i) => (
                  <div key={i} className="rounded-2xl p-5 space-y-4" style={{ background: '#f5f5f0' }}>
                    <div className="flex items-center gap-2">
                      <Sk className="h-4 w-8" />
                      <Sk className="h-4 w-20" />
                      <Sk className="h-4 w-14" />
                    </div>
                    <Sk className="h-5 w-3/4" />
                    <Sk className="h-3 w-full" />
                    <Sk className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : proposals.length === 0 ? (
              <div className="space-y-4">
                {/* Governance explainer */}
                <div className="rounded-2xl p-5 space-y-4" style={{ background: '#f5f5f0' }}>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-[#715a3e]">how_to_vote</span>
                    <span className="text-xs font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>
                      How governance works
                    </span>
                  </div>
                  <p className="text-xs text-[#434844]/70 leading-relaxed">
                    Governance on YearRing is a signal layer — not a multisig. RWT holders vote on protocol parameter proposals. Outcomes inform the core team's decisions; they do not execute autonomously. All admin operations on the protocol still go through a 24-hour timelock.
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      ['lock', 'Earn RWT by locking fbUSDC shares in the Locks tab. Longer locks earn more.'],
                      ['how_to_vote', `You need ≥ ${fmtRWT(threshold)} RWT to cast a vote on any active proposal.`],
                      ['tune', 'Proposal types: Reward Rate, Fee Discount, Inactivity Threshold, General.'],
                    ].map(([icon, text]) => (
                      <div key={icon} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #e8e8e2' }}>
                        <span className="material-symbols-outlined text-base text-[#715a3e] flex-shrink-0 mt-0.5">{icon}</span>
                        <span className="text-[11px] text-[#434844]/70 leading-relaxed">{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* No proposals CTA */}
                <div className="rounded-2xl flex flex-col items-center justify-center py-8 text-center"
                  style={{ background: '#fff', border: '1px solid #e8e8e2' }}>
                  <span className="material-symbols-outlined text-2xl text-[#c3c8c2] mb-2">inbox</span>
                  <p className="text-xs font-semibold text-[#434844]/60">No proposals on-chain yet</p>
                  <p className="text-[11px] text-[#434844]/35 mt-1">Proposals appear here once submitted by a credentialed proposer.</p>
                </div>
              </div>
            ) : null}
            <div className="space-y-4">
              {proposals.map(({ id, data, voted }) => (
                <ProposalCard
                  key={id}
                  id={id}
                  p={data!}
                  votingPower={votingPower}
                  threshold={threshold}
                  hasVoted={voted}
                />
              ))}
            </div>

            {/* Create proposal (proposer only) */}
            {isProposer && (
              <div className="rounded-2xl p-5 space-y-4" style={{ background: '#f5f5f0' }}>
                <h3 className="text-sm font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>
                  Create Proposal
                </h3>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/50 block mb-1.5">
                    Title
                  </label>
                  <input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Proposal title…"
                    className="w-full bg-transparent text-sm text-[#1b1c1a] placeholder-[#434844]/30 pb-2 pt-1 focus:outline-none"
                    style={{ borderBottom: '1.5px solid #715a3e' }}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/50 block mb-1.5">
                    Description
                  </label>
                  <textarea
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="Describe the proposal…"
                    rows={3}
                    className="w-full bg-white/60 text-sm text-[#1b1c1a] placeholder-[#434844]/30 px-3 py-2 rounded-lg focus:outline-none resize-none"
                    style={{ border: '1px solid #e8e8e2' }}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/50 block mb-1.5">
                    Type
                  </label>
                  <select
                    value={newType}
                    onChange={e => setNewType(Number(e.target.value))}
                    className="bg-white/60 text-sm text-[#1b1c1a] px-3 py-2 rounded-lg focus:outline-none"
                    style={{ border: '1px solid #e8e8e2' }}
                  >
                    {PROPOSAL_TYPES.map((t, i) => (
                      <option key={i} value={i}>{t}</option>
                    ))}
                  </select>
                </div>

                {createErr && (
                  <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{createErr}</div>
                )}
                {createSuccess && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    Proposal created.{' '}
                    <a href={`https://basescan.org/tx/${createHash}`} target="_blank" rel="noreferrer" className="underline">View</a>
                  </div>
                )}

                <button
                  onClick={handleCreate}
                  disabled={!newTitle.trim() || createBusy}
                  className="px-5 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-40 transition-all"
                  style={{ background: 'linear-gradient(135deg, #18281e, #2d3e33)' }}
                >
                  {createBusy ? 'Signing…' : 'Submit Proposal'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Mobile bottom nav ───────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 w-full md:hidden flex justify-around items-center px-6 py-3 bg-[#fbf9f5]/85 backdrop-blur-xl border-t border-[#c3c8c2]/15 z-50">
        {BOTTOM_NAV.map(({ icon, label, path }) => {
          const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
          return (
            <button key={path} onClick={() => navigate(path)} className="flex flex-col items-center gap-0.5">
              <span className="material-symbols-outlined text-2xl transition-colors"
                style={{ color: active ? '#18281e' : '#434844', fontVariationSettings: active ? "'FILL' 1" : undefined }}>
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
