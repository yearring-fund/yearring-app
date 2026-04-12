import { useReadContract } from 'wagmi'
import { ADDR, VAULT_ABI, SystemMode, type SystemModeKey } from '../../lib/contracts'

const modeStyle: Record<string, string> = {
  Normal:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  Paused:        'bg-yellow-50 text-yellow-700 border-yellow-200',
  EmergencyExit: 'bg-red-50 text-red-700 border-red-200',
}

const modeDot: Record<string, string> = {
  Normal:        'bg-emerald-500 animate-pulse',
  Paused:        'bg-yellow-400',
  EmergencyExit: 'bg-red-500 animate-pulse',
}

export default function SystemModeBadge() {
  const { data: modeRaw } = useReadContract({
    address: ADDR.FundVaultV01,
    abi: VAULT_ABI,
    functionName: 'systemMode',
  })

  const modeKey = (modeRaw ?? 0) as SystemModeKey
  const mode = SystemMode[modeKey] ?? 'Normal'

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${modeStyle[mode]}`}>
      <span className={`w-2 h-2 rounded-full ${modeDot[mode]}`} />
      SYSTEM: {mode.toUpperCase().replace('EMERGENCYEXIT', 'EMERGENCY EXIT')}
    </div>
  )
}
