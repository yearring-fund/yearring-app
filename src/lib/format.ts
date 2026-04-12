// Utility functions for formatting on-chain data

// USDC: 6 decimals
export function formatUSDC(raw: bigint, decimals = 2): string {
  const n = Number(raw) / 1e6
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Shares: 18 decimals (fbUSDC)
export function formatShares(raw: bigint, decimals = 4): string {
  const n = Number(raw) / 1e18
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// RWT: 18 decimals
export function formatRWT(raw: bigint, decimals = 2): string {
  const n = Number(raw) / 1e18
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// PPS: 6 decimals → price of 1 share in USDC
export function formatPPS(raw: bigint): string {
  const n = Number(raw) / 1e6
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  })
}

// BPS to percent: 100 bps = 1%
export function bpsToPercent(bps: bigint): string {
  return (Number(bps) / 100).toFixed(2) + '%'
}

// Seconds to human duration
export function secondsToDuration(seconds: number): string {
  const days = Math.round(seconds / 86400)
  if (days >= 365) return `${Math.round(days / 365)}y`
  if (days >= 30) return `${Math.round(days / 30)}mo`
  return `${days}d`
}

// Unix timestamp → "Jan 01, 2026"
export function formatDate(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleDateString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
  })
}

// Short address: 0x1234...abcd
export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
