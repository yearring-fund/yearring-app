import { useMemo, useState } from 'react'
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { type Address } from 'viem'
import { ADDR, GOVERNANCE_ABI } from '../lib/contracts'
import { parseTxError } from '../lib/txError'

// ── Constants ─────────────────────────────────────────────────────────────────
const PROPOSAL_TYPE_LABELS = ['Reward Rate', 'Fee Discount', 'Inactivity Threshold', 'General']
const VOTE_TYPE = { For: 0, Against: 1, Abstain: 2 } as const

type ProposalData = {
  proposer: Address
  title: string
  description: string
  proposalType: number
  startTime: bigint
  endTime: bigint
  forVotes: bigint
  againstVotes: bigint
  abstainVotes: bigint
  snapshotId: bigint
}

function proposalState(p: ProposalData, now: number): 'Active' | 'Succeeded' | 'Defeated' {
  if (now < Number(p.endTime)) return 'Active'
  return p.forVotes > p.againstVotes ? 'Succeeded' : 'Defeated'
}

function fmt(n: bigint): string {
  const whole = n / BigInt(1e18)
  return whole.toLocaleString()
}

function timeLeft(endTime: bigint, now: number): string {
  const secs = Number(endTime) - now
  if (secs <= 0) return 'Ended'
  const days  = Math.floor(secs / 86400)
  const hours = Math.floor((secs % 86400) / 3600)
  if (days > 0) return `${days}d ${hours}h left`
  const mins = Math.floor((secs % 3600) / 60)
  if (hours > 0) return `${hours}h ${mins}m left`
  return `${mins}m left`
}

// ── StateBadge ────────────────────────────────────────────────────────────────
function StateBadge({ state }: { state: 'Active' | 'Succeeded' | 'Defeated' }) {
  if (state === 'Active')
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        Active
      </span>
    )
  if (state === 'Succeeded')
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Succeeded</span>
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">Defeated</span>
}

// ── VoteBars ──────────────────────────────────────────────────────────────────
function VoteBars({ p }: { p: ProposalData }) {
  const total = p.forVotes + p.againstVotes + p.abstainVotes
  const pct = (n: bigint) => (total > 0n ? Number((n * 10000n) / total) / 100 : 0)
  const forPct     = pct(p.forVotes)
  const againstPct = pct(p.againstVotes)
  const abstainPct = pct(p.abstainVotes)

  return (
    <div className="space-y-1.5">
      {([
        { label: 'For',     pct: forPct,     color: 'bg-green-400',  votes: p.forVotes     },
        { label: 'Against', pct: againstPct, color: 'bg-red-400',    votes: p.againstVotes },
        { label: 'Abstain', pct: abstainPct, color: 'bg-slate-300',  votes: p.abstainVotes },
      ] as const).map(({ label, pct: p2, color, votes }) => (
        <div key={label} className="flex items-center gap-2 text-xs">
          <span className="w-12 text-slate-500 shrink-0">{label}</span>
          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${p2}%` }} />
          </div>
          <span className="w-14 text-right text-slate-500 shrink-0">{fmt(votes)} RWT</span>
        </div>
      ))}
    </div>
  )
}

// ── ProposalCard ──────────────────────────────────────────────────────────────
function ProposalCard({
  id,
  p,
  voted,
  myPower,
  threshold,
  onVote,
  votingFor,
}: {
  id: number
  p: ProposalData
  voted: boolean
  myPower: bigint
  threshold: bigint
  onVote: (id: number, voteType: number) => void
  votingFor: number | null
}) {
  const now   = Math.floor(Date.now() / 1000)
  const state = proposalState(p, now)
  const canVote = state === 'Active' && !voted && myPower >= threshold

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <StateBadge state={state} />
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
              {PROPOSAL_TYPE_LABELS[p.proposalType] ?? 'Unknown'}
            </span>
            <span className="text-xs text-slate-400">#{id}</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-800">{p.title}</h3>
        </div>
        {state === 'Active' && (
          <span className="text-xs text-slate-400 shrink-0 mt-1">{timeLeft(p.endTime, now)}</span>
        )}
      </div>

      {/* Description */}
      {p.description && (
        <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap">{p.description}</p>
      )}

      {/* Vote bars */}
      <VoteBars p={p} />

      {/* Vote buttons or status */}
      {state === 'Active' && (
        <div className="pt-1">
          {voted ? (
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px] text-green-500">check_circle</span>
              You have voted on this proposal
            </p>
          ) : myPower < threshold ? (
            <p className="text-xs text-slate-400">
              Need ≥ {fmt(threshold)} RWT to vote (you have {fmt(myPower)} RWT)
            </p>
          ) : (
            <div className="flex gap-2">
              {(['For', 'Against', 'Abstain'] as const).map((label) => (
                <button
                  key={label}
                  disabled={votingFor === id}
                  onClick={() => onVote(id, VOTE_TYPE[label])}
                  className={[
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50',
                    label === 'For'     ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                    label === 'Against' ? 'bg-red-100 text-red-600 hover:bg-red-200' :
                                          'bg-slate-100 text-slate-500 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {votingFor === id ? '...' : label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── GovernanceConsole ─────────────────────────────────────────────────────────
function GovernanceConsole({
  proposalCount,
  myPower,
  threshold,
  isProposer,
}: {
  proposalCount: number
  myPower: bigint
  threshold: bigint
  isProposer: boolean
}) {
  const { address } = useAccount()
  const [txHash, setTxHash]   = useState<`0x${string}` | undefined>()
  const [txError, setTxError] = useState('')
  const [votingFor, setVotingFor] = useState<number | null>(null)

  // Create proposal form
  const [cTitle,  setCTitle]  = useState('')
  const [cDesc,   setCDesc]   = useState('')
  const [cType,   setCType]   = useState(0)

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isTxPending, isSuccess: isTxSuccess } =
    useWaitForTransactionReceipt({ hash: txHash })

  // Batch: all proposals
  const proposalContracts = useMemo(
    () =>
      Array.from({ length: proposalCount }, (_, i) => ({
        address: ADDR.GovernanceSignalV02 as Address,
        abi: GOVERNANCE_ABI,
        functionName: 'getProposal' as const,
        args: [BigInt(i)] as [bigint],
      })),
    [proposalCount],
  )

  // Batch: hasVoted for connected user
  const hasVotedContracts = useMemo(
    () =>
      address
        ? Array.from({ length: proposalCount }, (_, i) => ({
            address: ADDR.GovernanceSignalV02 as Address,
            abi: GOVERNANCE_ABI,
            functionName: 'hasVoted' as const,
            args: [BigInt(i), address] as [bigint, Address],
          }))
        : [],
    [proposalCount, address],
  )

  const { data: proposalResults, refetch: refetchProposals } = useReadContracts({
    contracts: proposalContracts,
    query: { enabled: proposalCount > 0 },
  })
  const { data: hasVotedResults, refetch: refetchHasVoted } = useReadContracts({
    contracts: hasVotedContracts,
    query: { enabled: !!address && proposalCount > 0 },
  })

  const proposals = proposalResults?.map(r => r.result as ProposalData | undefined) ?? []
  const hasVoteds = hasVotedResults?.map(r => r.result as boolean | undefined) ?? []

  // Newest first
  const indexed = proposals
    .map((p, i) => ({ p, i, voted: !!hasVoteds[i] }))
    .filter(({ p }) => !!p)
    .reverse()

  const handleVote = async (proposalId: number, voteType: number) => {
    setTxError('')
    setVotingFor(proposalId)
    try {
      const hash = await writeContractAsync({
        address: ADDR.GovernanceSignalV02,
        abi: GOVERNANCE_ABI,
        functionName: 'castVote',
        args: [BigInt(proposalId), voteType],
      })
      setTxHash(hash)
      refetchProposals()
      refetchHasVoted()
    } catch (e) {
      setTxError(parseTxError(e))
    } finally {
      setVotingFor(null)
    }
  }

  const handleCreate = async () => {
    if (!cTitle.trim()) return
    setTxError('')
    try {
      const hash = await writeContractAsync({
        address: ADDR.GovernanceSignalV02,
        abi: GOVERNANCE_ABI,
        functionName: 'createProposal',
        args: [cTitle.trim(), cDesc.trim(), cType],
      })
      setTxHash(hash)
      setCTitle('')
      setCDesc('')
      setCType(0)
      refetchProposals()
    } catch (e) {
      setTxError(parseTxError(e))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[180px] bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-400 mb-1">My Voting Power</p>
          <p className="text-xl font-bold text-blue-700">{fmt(myPower)} RWT</p>
        </div>
        <div className="flex-1 min-w-[180px] bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-400 mb-1">Voting Threshold</p>
          <p className="text-xl font-bold text-slate-700">{fmt(threshold)} RWT</p>
        </div>
        <div className="flex-1 min-w-[180px] bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-400 mb-1">Total Proposals</p>
          <p className="text-xl font-bold text-slate-700">{proposalCount}</p>
        </div>
      </div>

      {/* Error / tx feedback */}
      {txError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          {txError}
        </div>
      )}
      {txHash && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
          {isTxPending ? (
            <>
              <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
              Confirming…
            </>
          ) : isTxSuccess ? (
            <>
              <span className="material-symbols-outlined text-[16px] text-green-600">check_circle</span>
              Transaction confirmed
            </>
          ) : null}
          <a
            href={`https://basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs underline"
          >
            View on Basescan
          </a>
        </div>
      )}

      {/* Proposals */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Proposals</h2>
        {indexed.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-10 text-center text-sm text-slate-400">
            No proposals yet.
          </div>
        ) : (
          <div className="space-y-4">
            {indexed.map(({ p, i, voted }) => (
              <ProposalCard
                key={i}
                id={i}
                p={p!}
                voted={voted}
                myPower={myPower}
                threshold={threshold}
                onVote={handleVote}
                votingFor={votingFor}
              />
            ))}
          </div>
        )}
      </div>

      {/* Admin: Create Proposal */}
      {isProposer && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Create Proposal</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Title</label>
              <input
                type="text"
                value={cTitle}
                onChange={e => setCTitle(e.target.value)}
                placeholder="Short proposal title"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Description</label>
              <textarea
                value={cDesc}
                onChange={e => setCDesc(e.target.value)}
                rows={3}
                placeholder="Full proposal description…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Type</label>
              <select
                value={cType}
                onChange={e => setCType(Number(e.target.value))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {PROPOSAL_TYPE_LABELS.map((label, i) => (
                  <option key={i} value={i}>{label}</option>
                ))}
              </select>
            </div>
            <button
              disabled={!cTitle.trim() || isPending}
              onClick={handleCreate}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Submitting…' : 'Submit Proposal'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Governance (gate) ─────────────────────────────────────────────────────────
export default function Governance() {
  const { address, isConnected } = useAccount()

  const { data: nextId }    = useReadContract({ address: ADDR.GovernanceSignalV02, abi: GOVERNANCE_ABI, functionName: 'nextProposalId' })
  const { data: threshold } = useReadContract({ address: ADDR.GovernanceSignalV02, abi: GOVERNANCE_ABI, functionName: 'votingThreshold' })
  const { data: myPower }   = useReadContract({ address: ADDR.GovernanceSignalV02, abi: GOVERNANCE_ABI, functionName: 'votingPowerOf', args: [address as Address], query: { enabled: !!address } })
  const { data: proposerRole } = useReadContract({ address: ADDR.GovernanceSignalV02, abi: GOVERNANCE_ABI, functionName: 'PROPOSER_ROLE' })
  const { data: isProposer }   = useReadContract({ address: ADDR.GovernanceSignalV02, abi: GOVERNANCE_ABI, functionName: 'hasRole', args: [proposerRole as `0x${string}`, address as Address], query: { enabled: !!address && !!proposerRole } })

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">Governance</h1>
        <p className="text-xs text-slate-400 mt-0.5">Signal-only on-chain voting · RWT voting power</p>
      </div>

      {!isConnected ? (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-10 text-center text-sm text-slate-400">
          Connect your wallet to participate in governance.
        </div>
      ) : nextId === undefined || threshold === undefined ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : (
        <GovernanceConsole
          proposalCount={Number(nextId)}
          myPower={(myPower as bigint | undefined) ?? 0n}
          threshold={threshold as bigint}
          isProposer={!!isProposer}
        />
      )}
    </div>
  )
}
