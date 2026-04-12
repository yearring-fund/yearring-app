import { useState, useRef, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'

// Icon per connector name
function ConnectorIcon({ name }: { name: string }) {
  const lower = name.toLowerCase()
  if (lower.includes('walletconnect'))
    return <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
  if (lower.includes('metamask') || lower.includes('injected') || lower.includes('browser'))
    return <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
  return <span className="material-symbols-outlined text-[18px]">wallet</span>
}

function connectorLabel(name: string): string {
  const lower = name.toLowerCase()
  if (lower === 'injected') return 'Browser Wallet'
  return name
}

export default function WalletButton() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending, variables } = useConnect()
  const { disconnect } = useDisconnect()

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const short = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null

  // Connected state — show address, click to disconnect
  if (isConnected && short) {
    return (
      <button
        onClick={() => disconnect()}
        className="px-5 py-2 bg-primary-container text-on-primary-container rounded-md text-sm font-bold tracking-tight hover:bg-primary hover:text-on-primary transition-all duration-200"
      >
        {short}
      </button>
    )
  }

  // Only one connector (no WC project ID set) — connect directly
  if (connectors.length === 1) {
    return (
      <button
        onClick={() => connect({ connector: connectors[0] })}
        disabled={isPending}
        className="px-5 py-2 bg-primary text-on-primary rounded-md text-sm font-bold tracking-tight hover:opacity-90 transition-all disabled:opacity-60"
      >
        {isPending ? 'Connecting…' : 'Connect Wallet'}
      </button>
    )
  }

  // Multiple connectors — show dropdown
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="px-5 py-2 bg-primary text-on-primary rounded-md text-sm font-bold tracking-tight hover:opacity-90 transition-all disabled:opacity-60 flex items-center gap-2"
      >
        {isPending ? 'Connecting…' : 'Connect Wallet'}
        <span className="material-symbols-outlined text-[16px]">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden z-50">
          {connectors.map((connector) => {
            const isThisPending = isPending && variables?.connector === connector
            return (
              <button
                key={connector.uid}
                disabled={isPending}
                onClick={() => {
                  setOpen(false)
                  connect({ connector })
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                <ConnectorIcon name={connector.name} />
                <span className="flex-1 text-left">{connectorLabel(connector.name)}</span>
                {isThisPending && (
                  <span className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
