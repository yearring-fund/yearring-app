// Parse a wagmi/viem write error into a short user-facing message
export function parseTxError(err: unknown): string {
  if (!err) return ''
  const msg = (err as Error)?.message ?? String(err)

  if (/user rejected|rejected the request|4001/i.test(msg))
    return 'Transaction rejected in wallet.'

  if (/reverted/i.test(msg)) {
    const reason = msg.match(/reason:\s*"?([^"\n]+)"?/i)?.[1]
      ?? msg.match(/execution reverted:\s*([^\n]+)/i)?.[1]
    return reason ? `Reverted: ${reason}` : 'Transaction reverted by contract.'
  }

  if (/insufficient funds/i.test(msg)) return 'Insufficient funds for gas.'
  if (/nonce/i.test(msg)) return 'Nonce error — try resetting your wallet.'
  if (/already known/i.test(msg)) return 'Transaction already pending.'

  // Fallback: first 120 chars
  return msg.length > 120 ? msg.slice(0, 120) + '…' : msg
}

// Parse a wagmi/viem read error into a short user-facing message
export function parseReadError(err: unknown): string {
  if (!err) return ''
  const msg = (err as Error)?.message ?? String(err)

  if (/rate.?limit|429|too many requests/i.test(msg))
    return 'RPC rate limited — try again in a moment.'
  if (/timeout|timed out/i.test(msg))
    return 'Request timed out — check your connection.'
  if (/network|fetch|failed to fetch|getaddrinfo/i.test(msg))
    return 'Network error — check your connection.'
  if (/could not be found|not found|invalid address/i.test(msg))
    return 'Contract not found — you may be on the wrong network.'

  return 'Unable to load data — RPC may be unavailable.'
}
