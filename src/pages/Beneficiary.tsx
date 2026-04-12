import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { isAddress, type Address } from 'viem';
import { ADDR, BENEFICIARY_ABI } from '../lib/contracts';
import { parseTxError } from '../lib/txError';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export default function Beneficiary() {
  const { address, isConnected } = useAccount();
  const [inputAddr, setInputAddr] = useState('');
  const [copied, setCopied] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [txError, setTxError] = useState<string>('');

  const { data: beneficiary, refetch: refetchBeneficiary } = useReadContract({
    address: ADDR.BeneficiaryModuleV02,
    abi: BENEFICIARY_ABI,
    functionName: 'beneficiaryOf',
    args: [address as Address],
    query: { enabled: !!address },
  });

  const { data: isInactive } = useReadContract({
    address: ADDR.BeneficiaryModuleV02,
    abi: BENEFICIARY_ABI,
    functionName: 'isInactive',
    args: [address as Address],
    query: { enabled: !!address },
  });

  const { writeContractAsync, isPending } = useWriteContract();

  const { isLoading: isTxPending, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const beneficiaryAddr = beneficiary as string | undefined;
  const hasBeneficiary =
    !!beneficiaryAddr && beneficiaryAddr !== ZERO_ADDRESS;

  const inputValid = inputAddr === '' ? null : isAddress(inputAddr);

  const handleCopy = async () => {
    if (!beneficiaryAddr) return;
    await navigator.clipboard.writeText(beneficiaryAddr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSet = async () => {
    if (!inputValid) return;
    setTxError('');
    try {
      const hash = await writeContractAsync({
        address: ADDR.BeneficiaryModuleV02,
        abi: BENEFICIARY_ABI,
        functionName: hasBeneficiary ? 'updateBeneficiary' : 'setBeneficiary',
        args: [inputAddr as Address],
      });
      setTxHash(hash);
      await refetchBeneficiary();
    } catch (e) {
      setTxError(parseTxError(e));
    }
  };

  const handleRevoke = async () => {
    setTxError('');
    try {
      const hash = await writeContractAsync({
        address: ADDR.BeneficiaryModuleV02,
        abi: BENEFICIARY_ABI,
        functionName: 'revokeBeneficiary',
        args: [],
      });
      setTxHash(hash);
      await refetchBeneficiary();
    } catch (e) {
      setTxError(parseTxError(e));
    }
  };

  const handleHeartbeat = async () => {
    setTxError('');
    try {
      const hash = await writeContractAsync({
        address: ADDR.BeneficiaryModuleV02,
        abi: BENEFICIARY_ABI,
        functionName: 'heartbeat',
        args: [],
      });
      setTxHash(hash);
    } catch (e) {
      setTxError(parseTxError(e));
    }
  };

  const isLoading = isPending || isTxPending;

  if (!isConnected) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-surface-container-low rounded-xl p-10 flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant">account_circle_off</span>
          <p className="text-on-surface-variant text-base">
            Connect your wallet to manage beneficiary settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-on-surface tracking-tight">Beneficiary</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Designate an address to receive your fund positions upon inactivity.
        </p>
      </div>

      {/* Current Status Card */}
      <div className="bg-surface-container-low p-8 rounded-xl relative">
        {hasBeneficiary ? (
          <>
            {/* Active Badge */}
            <span className="absolute top-6 right-6 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              ACTIVE
            </span>

            {/* Inactive Warning */}
            {isInactive && (
              <div className="mb-5 flex items-center gap-2 bg-error/10 text-error text-sm font-medium px-4 py-2.5 rounded-lg">
                <span className="material-symbols-outlined text-base">warning</span>
                INACTIVE — Inheritance may trigger
              </div>
            )}

            <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-1">
              Current Beneficiary
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-sm text-on-surface break-all">
                {beneficiaryAddr}
              </span>
              <button
                onClick={handleCopy}
                title="Copy address"
                className="shrink-0 p-1.5 rounded-md hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-base">
                  {copied ? 'check' : 'content_copy'}
                </span>
              </button>
            </div>

            {/* Heartbeat */}
            <div className="mt-6 pt-6 border-t border-outline-variant">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-on-surface">Send Heartbeat</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Resets your inactivity timer to prevent inheritance trigger.
                  </p>
                </div>
                <button
                  onClick={handleHeartbeat}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shrink-0"
                >
                  <span className="material-symbols-outlined text-base">favorite</span>
                  {isLoading ? 'Confirming...' : 'Send Heartbeat'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/50">person_off</span>
            <p className="text-base font-medium text-on-surface">No beneficiary set</p>
            <p className="text-sm text-on-surface-variant">
              Positions will remain locked indefinitely upon inactivity.
            </p>
          </div>
        )}
      </div>

      {/* Configuration Card */}
      <div className="bg-surface-container-lowest p-8 rounded-xl shadow-sm">
        <h2 className="text-base font-semibold text-on-surface mb-5">
          {hasBeneficiary ? 'Update Beneficiary' : 'Set Beneficiary Address'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-1.5">
              Ethereum Address
            </label>
            <input
              type="text"
              value={inputAddr}
              onChange={(e) => {
                setInputAddr(e.target.value);
                setTxHash(undefined);
              }}
              placeholder="0x..."
              spellCheck={false}
              className={`w-full font-mono text-sm px-4 py-3 rounded-lg bg-surface-container border transition-colors outline-none focus:ring-2 focus:ring-primary/30 text-on-surface placeholder:text-on-surface-variant/40 ${
                inputValid === false
                  ? 'border-error focus:border-error'
                  : 'border-outline-variant focus:border-primary'
              }`}
            />
            {inputValid === false && (
              <p className="mt-1.5 text-xs text-error flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">error</span>
                Invalid Ethereum address
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              onClick={handleSet}
              disabled={!inputValid || isLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              <span className="material-symbols-outlined text-base">
                {hasBeneficiary ? 'edit' : 'person_add'}
              </span>
              {isLoading
                ? 'Confirming...'
                : hasBeneficiary
                ? 'Update Beneficiary'
                : 'Set Beneficiary'}
            </button>

            {hasBeneficiary && (
              <button
                onClick={handleRevoke}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-surface-container-low text-error border border-error/20 text-sm font-medium hover:bg-error/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span className="material-symbols-outlined text-base">person_remove</span>
                Revoke Access
              </button>
            )}
          </div>

          {/* Tx error */}
          {txError && (
            <div className="mt-2 flex items-start gap-2 text-xs bg-error/10 text-error rounded-lg px-4 py-3">
              <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">error</span>
              <span>{txError}</span>
            </div>
          )}

          {/* Tx hash */}
          {txHash && (
            <div className="mt-2 text-xs text-on-surface-variant bg-surface-container rounded-lg px-4 py-3">
              <span className="font-semibold text-on-surface">Transaction submitted: </span>
              <span className="font-mono break-all">{txHash}</span>
              {isTxSuccess && (
                <span className="ml-2 text-green-600 font-medium">Confirmed</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Legal Notice */}
      <div className="bg-[#eaedff] p-8 rounded-xl border-l-4 border-primary">
        <div className="flex gap-4">
          <span className="material-symbols-outlined text-2xl text-primary shrink-0 mt-0.5">policy</span>
          <div>
            <h3 className="text-sm font-semibold text-on-surface mb-2">
              Legal Notice &amp; Risk Disclosure
            </h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Designating a beneficiary is a sensitive action. Entering an incorrect address may
              result in permanent loss of access to your positions. YearRing Fund operates as a
              non-custodial protocol — recovery of funds sent to an incorrect address is
              programmatically impossible. Verify all addresses carefully.
            </p>
          </div>
        </div>
      </div>

      {/* Heartbeat Explanation */}
      <div className="bg-surface-container p-6 rounded-xl">
        <div className="flex gap-4">
          <span className="material-symbols-outlined text-2xl text-primary shrink-0 mt-0.5">favorite</span>
          <div>
            <h3 className="text-sm font-semibold text-on-surface mb-1.5">Inactivity Timer</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              The protocol monitors on-chain activity. Send a heartbeat transaction periodically
              to prevent inheritance from triggering. The inactivity threshold is set by protocol
              governance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
