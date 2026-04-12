// Parse a wagmi/viem write error into a short user-facing message
export function parseTxError(err: unknown): string {
  if (!err) return ''
  const msg = (err as Error)?.message ?? String(err)

  if (/user rejected|rejected the request|4001/i.test(msg))
    return 'Transaction rejected in wallet.'

  if (/reverted/i.test(msg)) {
    // Try to extract a revert reason string
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
