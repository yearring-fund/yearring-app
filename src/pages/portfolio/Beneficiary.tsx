import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { isAddress, type Address } from 'viem'
import { ADDR, BENEFICIARY_ABI } from '../../lib/contracts'
import { parseTxError } from '../../lib/txError'

const ZERO = '0x0000000000000000000000000000000000000000'

function shortAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

export default function Beneficiary() {
  const { address } = useAccount()
  const [input, setInput]   = useState('')
  const [copied, setCopied] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [txErr,  setTxErr]  = useState('')

  const { data: beneficiaryRaw, refetch } = useReadContract({
    address: ADDR.BeneficiaryModuleV02 as Address,
    abi: BENEFICIARY_ABI,
    functionName: 'beneficiaryOf',
    args: [address as Address],
    query: { enabled: !!address },
  })
  const { data: inactiveRaw } = useReadContract({
    address: ADDR.BeneficiaryModuleV02 as Address,
    abi: BENEFICIARY_ABI,
    functionName: 'isInactive',
    args: [address as Address],
    query: { enabled: !!address },
  })

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const busy = isPending || confirming

  const beneficiary = beneficiaryRaw as string | undefined
  const hasBeneficiary = !!beneficiary && beneficiary !== ZERO
  const isInactive     = inactiveRaw as boolean | undefined

  const inputValid = input === '' ? null : isAddress(input)

  async function handleCopy() {
    if (!beneficiary) return
    await navigator.clipboard.writeText(beneficiary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSet() {
    if (!inputValid) return
    setTxErr('')
    try {
      const h = await writeContractAsync({
        address: ADDR.BeneficiaryModuleV02 as Address,
        abi: BENEFICIARY_ABI,
        functionName: hasBeneficiary ? 'updateBeneficiary' : 'setBeneficiary',
        args: [input as Address],
      })
      setTxHash(h)
      setTimeout(refetch, 3000)
    } catch (e) { setTxErr(parseTxError(e)) }
  }

  async function handleRevoke() {
    setTxErr('')
    try {
      const h = await writeContractAsync({
        address: ADDR.BeneficiaryModuleV02 as Address,
        abi: BENEFICIARY_ABI,
        functionName: 'revokeBeneficiary',
        args: [],
      })
      setTxHash(h)
      setTimeout(refetch, 3000)
    } catch (e) { setTxErr(parseTxError(e)) }
  }

  async function handleHeartbeat() {
    setTxErr('')
    try {
      const h = await writeContractAsync({
        address: ADDR.BeneficiaryModuleV02 as Address,
        abi: BENEFICIARY_ABI,
        functionName: 'heartbeat',
        args: [],
      })
      setTxHash(h)
      setTimeout(refetch, 3000)
    } catch (e) { setTxErr(parseTxError(e)) }
  }

  if (!address) {
    return (
      <div className="max-w-2xl mx-auto px-5 md:px-6 py-12 flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
        <span className="material-symbols-outlined text-4xl text-[#c3c8c2]">family_restroom</span>
        <p className="text-sm text-[#434844]">Connect your wallet to manage beneficiary settings.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-5 md:px-6 py-8 space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-bold text-[#1b1c1a]" style={{ fontFamily: "'Noto Serif', serif" }}>
          Beneficiary
        </h2>
        <p className="mt-1 text-xs text-[#434844]/60 leading-relaxed">
          Designate an address to inherit your positions if you go inactive on-chain.
        </p>
      </div>

      {/* ── Current Status ─────────────────────────────────────────────────── */}
      {hasBeneficiary ? (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#f5f5f0' }}>
          {/* Inactive warning banner */}
          {isInactive && (
            <div className="flex items-center gap-2 px-5 py-3 text-xs font-semibold text-red-700 bg-red-50">
              <span className="material-symbols-outlined text-base">warning</span>
              Account inactive — inheritance may trigger soon
            </div>
          )}

          <div className="p-5 space-y-5">
            {/* Beneficiary address */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/50">
                  Current Beneficiary
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[#1b1c1a] hidden md:block break-all">
                  {beneficiary}
                </span>
                <span className="font-mono text-sm text-[#1b1c1a] md:hidden">
                  {shortAddr(beneficiary!)}
                </span>
                <button
                  onClick={handleCopy}
                  className="p-1 rounded-md text-[#434844]/50 hover:text-[#434844] transition-colors"
                  title="Copy address"
                >
                  <span className="material-symbols-outlined text-base">
                    {copied ? 'check' : 'content_copy'}
                  </span>
                </button>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: '#e8e8e2' }} />

            {/* Heartbeat */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-[#1b1c1a]">Send Heartbeat</div>
                <div className="text-[11px] text-[#434844]/50 mt-0.5">
                  Resets your inactivity timer.
                </div>
              </div>
              <button
                onClick={handleHeartbeat}
                disabled={busy}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50 transition-all"
                style={{ background: 'linear-gradient(135deg, #18281e, #2d3e33)' }}
              >
                <span className="material-symbols-outlined text-base">favorite</span>
                {busy ? 'Signing…' : 'Heartbeat'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="rounded-2xl p-8 flex flex-col items-center text-center space-y-2"
          style={{ background: '#f5f5f0' }}>
          <span className="material-symbols-outlined text-4xl text-[#c3c8c2]">person_off</span>
          <div className="text-sm font-semibold text-[#1b1c1a]">No beneficiary set</div>
          <div className="text-xs text-[#434844]/50 max-w-xs leading-relaxed">
            Without a beneficiary, your positions remain locked indefinitely if your account goes inactive.
          </div>
        </div>
      )}

      {/* ── Configure ──────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-[#1b1c1a]">
          {hasBeneficiary ? 'Update Beneficiary' : 'Set Beneficiary'}
        </h3>

        {/* Address input */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-[#434844]/50 block mb-1.5">
            Wallet Address
          </label>
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={e => { setInput(e.target.value); setTxHash(undefined); setTxErr('') }}
              placeholder="0x…"
              spellCheck={false}
              className="w-full bg-transparent font-mono text-sm text-[#1b1c1a] placeholder-[#434844]/30
                         pb-2 pt-1 focus:outline-none transition-colors"
              style={{
                borderBottom: inputValid === false
                  ? '1.5px solid #ef4444'
                  : '1.5px solid #715a3e',
              }}
            />
          </div>
          {inputValid === false && (
            <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">error</span>
              Invalid Ethereum address
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSet}
            disabled={!inputValid || busy}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-bold text-white
                       disabled:opacity-40 transition-all"
            style={{ background: 'linear-gradient(135deg, #18281e, #2d3e33)' }}
          >
            <span className="material-symbols-outlined text-base">
              {hasBeneficiary ? 'edit' : 'person_add'}
            </span>
            {busy ? 'Signing…' : hasBeneficiary ? 'Update' : 'Set Beneficiary'}
          </button>

          {hasBeneficiary && (
            <button
              onClick={handleRevoke}
              disabled={busy}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-bold text-red-600
                         disabled:opacity-40 transition-all"
              style={{ background: '#fff1f1', border: '1px solid #f8707040' }}
            >
              <span className="material-symbols-outlined text-base">person_remove</span>
              Revoke
            </button>
          )}
        </div>

        {/* Feedback */}
        {txErr && (
          <div className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">
            {txErr}
          </div>
        )}
        {isSuccess && txHash && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            Transaction confirmed.{' '}
            <a
              href={`https://basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              View on BaseScan
            </a>
          </div>
        )}
      </div>

      {/* ── Info blocks ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Legal notice */}
        <div className="rounded-xl p-4 flex gap-3" style={{ background: '#fdf8f3', border: '1px solid #715a3e30' }}>
          <span className="material-symbols-outlined text-xl text-[#715a3e] shrink-0 mt-0.5">policy</span>
          <div>
            <div className="text-xs font-bold text-[#715a3e] mb-1">Legal Notice</div>
            <p className="text-[11px] text-[#434844]/70 leading-relaxed">
              Entering an incorrect address may result in permanent loss of access to your positions.
              YearRing operates as a non-custodial protocol — recovery is programmatically impossible.
              Verify all addresses carefully before confirming.
            </p>
          </div>
        </div>

        {/* Heartbeat explanation */}
        <div className="rounded-xl p-4 flex gap-3" style={{ background: '#f5f5f0' }}>
          <span className="material-symbols-outlined text-xl text-[#18281e] shrink-0 mt-0.5">favorite</span>
          <div>
            <div className="text-xs font-bold text-[#1b1c1a] mb-1">Inactivity Timer</div>
            <p className="text-[11px] text-[#434844]/70 leading-relaxed">
              The protocol tracks on-chain activity. Send a heartbeat transaction periodically to
              reset your inactivity timer and prevent inheritance from triggering. The inactivity
              threshold is governed by the protocol.
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}
