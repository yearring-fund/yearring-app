import { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useReadContracts, useReadContract } from 'wagmi'
import { formatUnits, getEventSelector, type Address } from 'viem'
import { ADDR, VAULT_ABI, POINTS_ABI } from '../../lib/contracts'
import { Sk } from '../../components/ui/Skeleton'

// ── Types ──────────────────────────────────────────────────────────────────
type ShareTxType  = 'Deposit' | 'Redeem' | 'Lock' | 'Unlock'
type PointsTxType = 'Earned' | 'Deducted'

interface ShareItem {
  type: ShareTxType
  amount: bigint
  txHash: string
  blockNumber: bigint
  timestamp: number | null
}

interface PointsItem {
  type: PointsTxType
  amount: bigint
  txHash: string
  blockNumber: bigint
  timestamp: number | null
}

// ── Constants ──────────────────────────────────────────────────────────────
const TRANSFER_SIG         = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as `0x${string}`
const ZERO_TOPIC           = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
const POINTS_CREDITED_SIG  = getEventSelector('PointsCredited(address,uint256,uint8)') as `0x${string}`
const POINTS_DEBITED_SIG   = getEventSelector('PointsDebited(address,uint256)') as `0x${string}`
const DEFAULT_RANGE = 50_000n
const STEP_RANGE    = 100_000n
const ZERO_ADDR     = '0x0000000000000000000000000000000000000000'

// ── Type config ────────────────────────────────────────────────────────────
const SHARE_CFG: Record<ShareTxType, { label: string; icon: string; color: string; bg: string }> = {
  Deposit: { label: 'Deposit',  icon: 'add_circle',    color: '#16a34a', bg: '#f0fdf4' },
  Redeem:  { label: 'Redeem',   icon: 'remove_circle', color: '#dc2626', bg: '#fef2f2' },
  Lock:    { label: 'Lock',     icon: 'lock',           color: '#715a3e', bg: '#fdf8f3' },
  Unlock:  { label: 'Unlock',   icon: 'lock_open',      color: '#18281e', bg: '#f0f4f0' },
}

const POINTS_CFG: Record<PointsTxType, { label: string; icon: string; color: string; bg: string }> = {
  Earned:   { label: 'Earned',   icon: 'star',  color: '#715a3e', bg: '#fdf8f3' },
  Deducted: { label: 'Deducted', icon: 'undo',  color: '#6b7280', bg: '#f3f4f6' },
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtShares(n: bigint) {
  return Number(formatUnits(n, 18)).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}
function fmtPoints(n: bigint) {
  return Number(formatUnits(n, 18)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtUSDC(n: bigint) {
  return Number(formatUnits(n, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(ts: number) {
  const d = new Date(ts * 1000)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400_000)
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (day.getTime() === today.getTime())     return 'Today'
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

// ── Group by date ─────────────────────────────────────────────────────────
function groupByDate<T extends { timestamp: number | null }>(
  items: T[]
): { label: string; items: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = item.timestamp ? fmtDate(item.timestamp) : 'Unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
}

// ── Skeleton loader ───────────────────────────────────────────────────────
function ListSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1].map(g => (
        <div key={g}>
          <Sk className="h-3 w-16 mb-3" />
          <div className="rounded-2xl px-4" style={{ background: '#f9f9f6' }}>
            {[0, 1, 2].map(r => (
              <div key={r} className="flex items-center gap-3 py-3"
                style={{ borderBottom: r < 2 ? '1px solid #f0f0ec' : 'none' }}>
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
  )
}

// ── Section header with balance subtitle ─────────────────────────────────
function SectionHeader({
  title, icon, count, accent, subtitle,
}: {
  title: string
  icon: string
  count?: number
  accent: string
  subtitle?: string
}) {
  return (
    <div className="flex items-start justify-between mb-3">
      <div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: accent + '18' }}>
            <span className="material-symbols-outlined" style={{ color: accent, fontSize: '14px' }}>{icon}</span>
          </div>
          <span className="text-sm font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>
            {title}
          </span>
        </div>
        {subtitle && (
          <p className="text-[10px] text-[#434844]/45 mt-1 pl-8">{subtitle}</p>
        )}
      </div>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] text-[#434844]/40 mt-0.5">{count} records</span>
      )}
    </div>
  )
}

// ── Share row ─────────────────────────────────────────────────────────────
function ShareRow({ item }: { item: ShareItem }) {
  const cfg = SHARE_CFG[item.type]
  const isIn = item.type === 'Deposit' || item.type === 'Unlock'
  return (
    <div className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid #f0f0ec' }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: cfg.bg }}>
        <span className="material-symbols-outlined text-base" style={{ color: cfg.color }}>{cfg.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-[#1b1c1a]">{cfg.label}</span>
        <div className="text-[10px] text-[#434844]/40 font-mono mt-0.5 truncate">{shortHash(item.txHash)}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-xs font-semibold font-mono" style={{ color: cfg.color }}>
          {isIn ? '+' : '−'}{fmtShares(item.amount)}{' '}
          <span className="text-[10px] font-normal text-[#434844]/40">yrUSDC</span>
        </div>
        <div className="text-[10px] text-[#434844]/40">{item.timestamp ? fmtTime(item.timestamp) : '—'}</div>
      </div>
      <a href={`https://basescan.org/tx/${item.txHash}`} target="_blank" rel="noreferrer"
        className="p-1 rounded-md text-[#434844]/30 hover:text-[#434844] transition-colors flex-shrink-0">
        <span className="material-symbols-outlined text-sm">open_in_new</span>
      </a>
    </div>
  )
}

// ── Points row ────────────────────────────────────────────────────────────
function PointsRow({ item }: { item: PointsItem }) {
  const cfg = POINTS_CFG[item.type]
  return (
    <div className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid #f0f0ec' }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: cfg.bg }}>
        <span className="material-symbols-outlined text-base" style={{ color: cfg.color }}>{cfg.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-[#1b1c1a]">{cfg.label}</span>
        <div className="text-[10px] text-[#434844]/40 font-mono mt-0.5 truncate">{shortHash(item.txHash)}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-xs font-semibold font-mono" style={{ color: cfg.color }}>
          {item.type === 'Earned' ? '+' : '−'}{fmtPoints(item.amount)}{' '}
          <span className="text-[10px] font-normal text-[#434844]/40">PTS</span>
        </div>
        <div className="text-[10px] text-[#434844]/40">{item.timestamp ? fmtTime(item.timestamp) : '—'}</div>
      </div>
      <a href={`https://basescan.org/tx/${item.txHash}`} target="_blank" rel="noreferrer"
        className="p-1 rounded-md text-[#434844]/30 hover:text-[#434844] transition-colors flex-shrink-0">
        <span className="material-symbols-outlined text-sm">open_in_new</span>
      </a>
    </div>
  )
}

// ── Load-more button ──────────────────────────────────────────────────────
function LoadMoreBtn({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-center">
      <button onClick={onClick} disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold text-[#434844] disabled:opacity-50 transition-all"
        style={{ background: '#f0f0ec', border: '1px solid #e8e8e2' }}>
        {loading ? (
          <><div className="w-3.5 h-3.5 rounded-full border-2 border-[#434844]/20 border-t-[#434844] animate-spin" />Loading…</>
        ) : (
          <><span className="material-symbols-outlined text-base">expand_more</span>Load older</>
        )}
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function Activity() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  // ── Balance reads ─────────────────────────────────────────────────────
  const { data: balReads } = useReadContracts({
    contracts: [
      { address: ADDR.YearRingCoreVaultV21 as Address, abi: VAULT_ABI, functionName: 'balanceOf', args: [address ?? ZERO_ADDR as Address] },
      { address: ADDR.PointsLedgerV01      as Address, abi: POINTS_ABI, functionName: 'balanceOf', args: [address ?? ZERO_ADDR as Address] },
    ],
    query: { enabled: isConnected && !!address, refetchInterval: 15_000 },
  })
  const yrUSDCBal = (balReads?.[0]?.result as bigint | undefined) ?? 0n
  const ptsBal    = (balReads?.[1]?.result as bigint | undefined) ?? 0n

  const { data: usdcEquivRaw } = useReadContract({
    address: ADDR.YearRingCoreVaultV21 as Address, abi: VAULT_ABI,
    functionName: 'convertToAssets',
    args: [yrUSDCBal > 0n ? yrUSDCBal : 1_000_000_000_000n],
    query: { enabled: isConnected },
  })
  const usdcEquiv = isConnected && yrUSDCBal > 0n ? (usdcEquivRaw as bigint | undefined) ?? 0n : 0n

  const shareSubtitle = isConnected
    ? `Current balance: ${fmtShares(yrUSDCBal)} yrUSDC · ≈ $${fmtUSDC(usdcEquiv)} USDC`
    : undefined
  const ptsSubtitle = isConnected
    ? `Current balance: ${fmtPoints(ptsBal)} YRPTS`
    : undefined

  // ── yrUSDC log state ──────────────────────────────────────────────────
  const [shareItems,    setShareItems]    = useState<ShareItem[]>([])
  const [shareLoading,  setShareLoading]  = useState(false)
  const [shareLoadMore, setShareLoadMore] = useState(false)
  const [shareFrom,     setShareFrom]     = useState<bigint | null>(null)
  const [shareHasMore,  setShareHasMore]  = useState(true)
  const [shareError,    setShareError]    = useState('')

  // ── Points log state ──────────────────────────────────────────────────
  const [ptItems,    setPtItems]    = useState<PointsItem[]>([])
  const [ptLoading,  setPtLoading]  = useState(false)
  const [ptLoadMore, setPtLoadMore] = useState(false)
  const [ptFrom,     setPtFrom]     = useState<bigint | null>(null)
  const [ptHasMore,  setPtHasMore]  = useState(true)
  const [ptError,    setPtError]    = useState('')

  // ── Fetch yrUSDC logs ─────────────────────────────────────────────────
  const fetchShareLogs = useCallback(async (rangeStart: bigint, append = false) => {
    if (!address || !publicClient) return
    append ? setShareLoadMore(true) : setShareLoading(true)
    setShareError('')
    try {
      const latest  = await publicClient.getBlockNumber()
      const from    = rangeStart > latest ? 0n : rangeStart
      const padded  = padTopic(address)
      const lockPad = padTopic(ADDR.LockManagerV21)

      const [fromUser, toUser] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicClient.getLogs({ address: ADDR.YearRingCoreVaultV21 as Address, topics: [TRANSFER_SIG, padded, null], fromBlock: from, toBlock: 'latest' } as any),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicClient.getLogs({ address: ADDR.YearRingCoreVaultV21 as Address, topics: [TRANSFER_SIG, null, padded], fromBlock: from, toBlock: 'latest' } as any),
      ])

      function classify(l: typeof fromUser[0]): ShareTxType | null {
        const f  = (l.topics[1] ?? '').toLowerCase()
        const t  = (l.topics[2] ?? '').toLowerCase()
        const z  = ZERO_TOPIC.toLowerCase()
        const lk = lockPad.toLowerCase()
        if (f === z)  return 'Deposit'
        if (t === z)  return 'Redeem'
        if (t === lk) return 'Lock'
        if (f === lk) return 'Unlock'
        return null
      }

      const raw: ShareItem[] = [...fromUser, ...toUser]
        .map(l => {
          const type = classify(l)
          if (!type) return null
          return { type, amount: BigInt(l.data), txHash: l.transactionHash ?? '', blockNumber: l.blockNumber ?? 0n, timestamp: null }
        })
        .filter(Boolean) as ShareItem[]
      raw.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1))

      const blockMap = new Map<bigint, number>()
      await Promise.all([...new Set(raw.map(r => r.blockNumber))].map(bn =>
        publicClient.getBlock({ blockNumber: bn }).then(b => blockMap.set(bn, Number(b.timestamp))).catch(() => {})
      ))

      const withTs = raw.map(i => ({ ...i, timestamp: blockMap.get(i.blockNumber) ?? null }))
      setShareItems(prev => {
        const combined = append ? [...prev, ...withTs] : withTs
        const seen = new Set<string>()
        return combined.filter(i => { if (seen.has(i.txHash)) return false; seen.add(i.txHash); return true })
      })
      setShareFrom(from)
      setShareHasMore(from > 0n)
    } catch {
      setShareError('Failed to load yrUSDC activity. Try again.')
    } finally {
      setShareLoading(false)
      setShareLoadMore(false)
    }
  }, [address, publicClient])

  // ── Fetch Points logs ─────────────────────────────────────────────────
  const fetchPointsLogs = useCallback(async (rangeStart: bigint, append = false) => {
    if (!address || !publicClient) return
    append ? setPtLoadMore(true) : setPtLoading(true)
    setPtError('')
    try {
      const latest = await publicClient.getBlockNumber()
      const from   = rangeStart > latest ? 0n : rangeStart
      const padded = padTopic(address)

      // PointsLedgerV01 emits PointsCredited(to indexed, amount, pointsType indexed)
      // and PointsDebited(from indexed, amount).
      const [creditedLogs, debitedLogs] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicClient.getLogs({ address: ADDR.PointsLedgerV01 as Address, topics: [POINTS_CREDITED_SIG, padded], fromBlock: from, toBlock: 'latest' } as any),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicClient.getLogs({ address: ADDR.PointsLedgerV01 as Address, topics: [POINTS_DEBITED_SIG, padded], fromBlock: from, toBlock: 'latest' } as any),
      ])

      const raw: PointsItem[] = [
        ...creditedLogs.map(l => ({ type: 'Earned'   as PointsTxType, amount: BigInt(l.data), txHash: l.transactionHash ?? '', blockNumber: l.blockNumber ?? 0n, timestamp: null })),
        ...debitedLogs.map(l  => ({ type: 'Deducted' as PointsTxType, amount: BigInt(l.data), txHash: l.transactionHash ?? '', blockNumber: l.blockNumber ?? 0n, timestamp: null })),
      ]
      raw.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1))

      const blockMap = new Map<bigint, number>()
      await Promise.all([...new Set(raw.map(r => r.blockNumber))].map(bn =>
        publicClient.getBlock({ blockNumber: bn }).then(b => blockMap.set(bn, Number(b.timestamp))).catch(() => {})
      ))

      const withTs = raw.map(i => ({ ...i, timestamp: blockMap.get(i.blockNumber) ?? null }))
      setPtItems(prev => {
        const combined = append ? [...prev, ...withTs] : withTs
        const seen = new Set<string>()
        return combined.filter(i => { if (seen.has(i.txHash)) return false; seen.add(i.txHash); return true })
      })
      setPtFrom(from)
      setPtHasMore(from > 0n)
    } catch {
      setPtError('Failed to load Points activity. Try again.')
    } finally {
      setPtLoading(false)
      setPtLoadMore(false)
    }
  }, [address, publicClient])

  // ── Init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected || !address || !publicClient) return
    publicClient.getBlockNumber().then(latest => {
      const from = latest > DEFAULT_RANGE ? latest - DEFAULT_RANGE : 0n
      fetchShareLogs(from)
      fetchPointsLogs(from)
    })
  }, [isConnected, address, fetchShareLogs, fetchPointsLogs])

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto px-5 md:px-6 py-12 flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
        <span className="material-symbols-outlined text-4xl text-[#c3c8c2]">history</span>
        <p className="text-sm text-[#434844]">Connect your wallet to view activity.</p>
      </div>
    )
  }

  const shareGroups = groupByDate(shareItems)
  const ptGroups    = groupByDate(ptItems)

  return (
    <div className="max-w-2xl mx-auto px-5 md:px-6 py-8 space-y-10">

      {/* ── yrUSDC Section ───────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="yrUSDC Shares"
          icon="account_balance"
          count={shareItems.length}
          accent="#18281e"
          subtitle={shareSubtitle}
        />

        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.entries(SHARE_CFG) as [ShareTxType, typeof SHARE_CFG[ShareTxType]][]).map(([type, cfg]) => (
            <span key={type} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: cfg.bg, color: cfg.color }}>
              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>{cfg.icon}</span>
              {cfg.label}
            </span>
          ))}
        </div>

        {shareLoading ? (
          <ListSkeleton />
        ) : shareError ? (
          <div className="rounded-xl px-4 py-3 text-xs text-red-500 bg-red-50 flex items-center justify-between">
            <span>{shareError}</span>
            <button onClick={() => fetchShareLogs(shareFrom ?? 0n)} className="underline font-semibold ml-3">Retry</button>
          </div>
        ) : shareItems.length === 0 ? (
          <div className="rounded-2xl flex flex-col items-center justify-center py-10 text-center"
            style={{ background: '#f5f5f0' }}>
            <span className="material-symbols-outlined text-2xl text-[#c3c8c2] mb-2">account_balance</span>
            <p className="text-xs text-[#434844]/50">No yrUSDC transactions found</p>
            <p className="text-[10px] text-[#434844]/30 mt-1">in the last ~4 days</p>
          </div>
        ) : (
          <div className="space-y-5">
            {shareGroups.map(group => (
              <div key={group.label}>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/40 mb-1 px-1">
                  {group.label}
                </div>
                <div className="rounded-2xl px-4" style={{ background: '#f9f9f6' }}>
                  {group.items.map((item, i) => <ShareRow key={item.txHash + i} item={item} />)}
                </div>
              </div>
            ))}
            {shareHasMore && (
              <LoadMoreBtn
                loading={shareLoadMore}
                onClick={() => {
                  const nf = (shareFrom ?? 0n) > STEP_RANGE ? (shareFrom ?? 0n) - STEP_RANGE : 0n
                  fetchShareLogs(nf, true)
                }}
              />
            )}
          </div>
        )}
      </section>

      {/* Divider */}
      <div style={{ height: '1px', background: '#e8e8e2' }} />

      {/* ── Points Section ───────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Points (YRPTS)"
          icon="star"
          count={ptItems.length}
          accent="#715a3e"
          subtitle={ptsSubtitle}
        />

        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.entries(POINTS_CFG) as [PointsTxType, typeof POINTS_CFG[PointsTxType]][]).map(([type, cfg]) => (
            <span key={type} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: cfg.bg, color: cfg.color }}>
              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>{cfg.icon}</span>
              {cfg.label}
            </span>
          ))}
        </div>

        {ptLoading ? (
          <ListSkeleton />
        ) : ptError ? (
          <div className="rounded-xl px-4 py-3 text-xs text-red-500 bg-red-50 flex items-center justify-between">
            <span>{ptError}</span>
            <button onClick={() => fetchPointsLogs(ptFrom ?? 0n)} className="underline font-semibold ml-3">Retry</button>
          </div>
        ) : ptItems.length === 0 ? (
          <div className="rounded-2xl flex flex-col items-center justify-center py-10 text-center"
            style={{ background: '#f5f5f0' }}>
            <span className="material-symbols-outlined text-2xl text-[#c3c8c2] mb-2">star</span>
            <p className="text-xs text-[#434844]/50">No Points transactions found</p>
            <p className="text-[10px] text-[#434844]/30 mt-1">
              Points activity from locks, unlocks, and test contributions will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {ptGroups.map(group => (
              <div key={group.label}>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/40 mb-1 px-1">
                  {group.label}
                </div>
                <div className="rounded-2xl px-4" style={{ background: '#f9f9f6' }}>
                  {group.items.map((item, i) => <PointsRow key={item.txHash + i} item={item} />)}
                </div>
              </div>
            ))}
            {ptHasMore && (
              <LoadMoreBtn
                loading={ptLoadMore}
                onClick={() => {
                  const nf = (ptFrom ?? 0n) > STEP_RANGE ? (ptFrom ?? 0n) - STEP_RANGE : 0n
                  fetchPointsLogs(nf, true)
                }}
              />
            )}
          </div>
        )}
      </section>

    </div>
  )
}
