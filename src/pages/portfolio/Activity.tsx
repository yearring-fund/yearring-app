import { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { formatUnits, type Address } from 'viem'
import { ADDR } from '../../lib/contracts'
import { Sk } from '../../components/ui/Skeleton'

// ── Types ─────────────────────────────────────────────────────────────────
type TxType = 'Deposit' | 'Redeem' | 'Lock' | 'Unlock'

interface ActivityItem {
  type: TxType
  shares: bigint
  txHash: string
  blockNumber: bigint
  timestamp: number | null
}

// ── Constants ──────────────────────────────────────────────────────────────
const TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as `0x${string}`
const ZERO_TOPIC   = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
const DEFAULT_RANGE = 50_000n    // ~1 day on Base (2s/block)
const STEP_RANGE    = 100_000n   // load more: +~2 days

// ── Type config ────────────────────────────────────────────────────────────
const TYPE_CFG: Record<TxType, { label: string; icon: string; color: string; bg: string }> = {
  Deposit: { label: 'Deposit',  icon: 'add_circle',      color: '#16a34a', bg: '#f0fdf4' },
  Redeem:  { label: 'Redeem',   icon: 'remove_circle',   color: '#dc2626', bg: '#fef2f2' },
  Lock:    { label: 'Lock',     icon: 'lock',             color: '#715a3e', bg: '#fdf8f3' },
  Unlock:  { label: 'Unlock',   icon: 'lock_open',        color: '#18281e', bg: '#f0f4f0' },
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtShares(n: bigint) {
  return Number(formatUnits(n, 18)).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

function fmtDate(ts: number) {
  const d = new Date(ts * 1000)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400_000)
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (day.getTime() === today.getTime()) return 'Today'
  if (day.getTime() === yesterday.getTime()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function shortHash(h: string) { return h.slice(0, 8) + '…' + h.slice(-6) }

function padTopic(addr: string): `0x${string}` {
  return ('0x000000000000000000000000' + addr.slice(2).toLowerCase()) as `0x${string}`
}

// ── Group items by date ────────────────────────────────────────────────────
function groupByDate(items: ActivityItem[]): { label: string; items: ActivityItem[] }[] {
  const groups: Map<string, ActivityItem[]> = new Map()
  for (const item of items) {
    const key = item.timestamp ? fmtDate(item.timestamp) : 'Unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
}

// ── Activity row ───────────────────────────────────────────────────────────
function ActivityRow({ item }: { item: ActivityItem }) {
  const cfg = TYPE_CFG[item.type]
  return (
    <div className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid #f0f0ec' }}>
      {/* Icon */}
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: cfg.bg }}>
        <span className="material-symbols-outlined text-base" style={{ color: cfg.color }}>
          {cfg.icon}
        </span>
      </div>

      {/* Label + hash */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#1b1c1a]">{cfg.label}</span>
        </div>
        <div className="text-[10px] text-[#434844]/40 font-mono mt-0.5 truncate">
          {shortHash(item.txHash)}
        </div>
      </div>

      {/* Amount + time */}
      <div className="text-right flex-shrink-0">
        <div className="text-xs font-semibold font-mono" style={{ color: cfg.color }}>
          {item.type === 'Deposit' || item.type === 'Unlock' ? '+' : '−'}
          {fmtShares(item.shares)}
        </div>
        <div className="text-[10px] text-[#434844]/40">
          {item.timestamp ? fmtTime(item.timestamp) : '—'}
        </div>
      </div>

      {/* BaseScan */}
      <a
        href={`https://basescan.org/tx/${item.txHash}`}
        target="_blank"
        rel="noreferrer"
        className="p-1 rounded-md text-[#434844]/30 hover:text-[#434844] transition-colors flex-shrink-0"
      >
        <span className="material-symbols-outlined text-sm">open_in_new</span>
      </a>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Activity() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  const [items, setItems]         = useState<ActivityItem[]>([])
  const [loading, setLoading]     = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fromBlock, setFromBlock] = useState<bigint | null>(null)
  const [hasMore, setHasMore]     = useState(true)
  const [error, setError]         = useState('')

  const fetchLogs = useCallback(async (rangeStart: bigint, append = false) => {
    if (!address || !publicClient) return
    append ? setLoadingMore(true) : setLoading(true)
    setError('')
    try {
      const latest   = await publicClient.getBlockNumber()
      const from     = rangeStart > latest ? 0n : rangeStart
      const padded   = padTopic(address)
      const lockPad  = padTopic(ADDR.LockLedgerV02)

      // 2 queries: all transfers FROM user + all transfers TO user
      // then classify client-side — avoids 4 parallel getLogs on public RPC
      const [fromUser, toUser] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicClient.getLogs({ address: ADDR.FundVaultV01 as Address, topics: [TRANSFER_SIG, padded, null], fromBlock: from, toBlock: 'latest' } as any),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicClient.getLogs({ address: ADDR.FundVaultV01 as Address, topics: [TRANSFER_SIG, null, padded], fromBlock: from, toBlock: 'latest' } as any),
      ])

      function classify(l: typeof fromUser[0]): TxType | null {
        const from_ = (l.topics[1] ?? '').toLowerCase()
        const to_   = (l.topics[2] ?? '').toLowerCase()
        const zero  = ZERO_TOPIC.toLowerCase()
        const lock  = lockPad.toLowerCase()
        if (from_ === zero)  return 'Deposit'
        if (to_   === zero)  return 'Redeem'
        if (to_   === lock)  return 'Lock'
        if (from_ === lock)  return 'Unlock'
        return null
      }

      const allLogs = [...fromUser, ...toUser]
      const raw: ActivityItem[] = allLogs
        .map(l => {
          const type = classify(l)
          if (!type) return null
          return {
            type,
            shares: BigInt(l.data),
            txHash: l.transactionHash ?? '',
            blockNumber: l.blockNumber ?? 0n,
            timestamp: null,
          }
        })
        .filter(Boolean) as ActivityItem[]
      raw.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1))

      // Fetch timestamps for unique block numbers (batched)
      const uniqueBlocks = [...new Set(raw.map(r => r.blockNumber))]
      const blockMap = new Map<bigint, number>()
      await Promise.all(
        uniqueBlocks.map(bn =>
          publicClient.getBlock({ blockNumber: bn })
            .then(b => blockMap.set(bn, Number(b.timestamp)))
            .catch(() => {})
        )
      )

      const withTs = raw.map(item => ({
        ...item,
        timestamp: blockMap.get(item.blockNumber) ?? null,
      }))

      setItems(prev => {
        const combined = append ? [...prev, ...withTs] : withTs
        // Deduplicate by txHash
        const seen = new Set<string>()
        return combined.filter(i => {
          if (seen.has(i.txHash)) return false
          seen.add(i.txHash)
          return true
        })
      })
      setFromBlock(from)
      setHasMore(from > 0n)
    } catch (e) {
      setError('Failed to load activity. The RPC may be rate-limited — try again.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [address, publicClient])

  useEffect(() => {
    if (!isConnected || !address || !publicClient) return
    publicClient.getBlockNumber().then(latest => {
      const from = latest > DEFAULT_RANGE ? latest - DEFAULT_RANGE : 0n
      fetchLogs(from)
    })
  }, [isConnected, address, fetchLogs])

  async function loadMore() {
    if (!fromBlock || !publicClient) return
    const newFrom = fromBlock > STEP_RANGE ? fromBlock - STEP_RANGE : 0n
    await fetchLogs(newFrom, true)
  }

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto px-5 md:px-6 py-12 flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
        <span className="material-symbols-outlined text-4xl text-[#c3c8c2]">history</span>
        <p className="text-sm text-[#434844]">Connect your wallet to view activity.</p>
      </div>
    )
  }

  const groups = groupByDate(items)

  return (
    <div className="max-w-2xl mx-auto px-5 md:px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>
          Activity
        </h2>
        {items.length > 0 && (
          <span className="text-xs text-[#434844]/50">{items.length} transactions</span>
        )}
      </div>

      {/* Type legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.entries(TYPE_CFG) as [TxType, typeof TYPE_CFG[TxType]][]).map(([type, cfg]) => (
          <span key={type} className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: cfg.bg, color: cfg.color }}>
            <span className="material-symbols-outlined text-sm">{cfg.icon}</span>
            {cfg.label}
          </span>
        ))}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="space-y-6">
          {[0, 1].map(g => (
            <div key={g}>
              <Sk className="h-3 w-16 mb-3" />
              <div className="rounded-2xl px-4" style={{ background: '#f9f9f6' }}>
                {[0, 1, 2].map(r => (
                  <div key={r} className="flex items-center gap-3 py-3" style={{ borderBottom: r < 2 ? '1px solid #f0f0ec' : 'none' }}>
                    <Sk className="w-8 h-8 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Sk className="h-3 w-24" />
                      <Sk className="h-3 w-16" />
                    </div>
                    <Sk className="h-4 w-20 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl px-4 py-3 text-xs text-red-500 bg-red-50">
          {error}
          <button onClick={() => fetchLogs(fromBlock ?? 0n)} className="ml-2 underline">Retry</button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl flex flex-col items-center justify-center py-16 text-center"
          style={{ background: '#f5f5f0' }}>
          <span className="material-symbols-outlined text-3xl text-[#c3c8c2] mb-2">history</span>
          <p className="text-sm text-[#434844]/50">No transactions found</p>
          <p className="text-xs text-[#434844]/30 mt-1">in the last ~4 days</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.label}>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/40 mb-1 px-1">
                {group.label}
              </div>
              <div className="rounded-2xl px-4" style={{ background: '#f9f9f6' }}>
                {group.items.map((item, i) => (
                  <ActivityRow key={item.txHash + i} item={item} />
                ))}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold text-[#434844] disabled:opacity-50 transition-all"
                style={{ background: '#f0f0ec', border: '1px solid #e8e8e2' }}
              >
                {loadingMore ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-[#434844]/20 border-t-[#434844] animate-spin" />
                    Loading…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">expand_more</span>
                    Load older history
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
