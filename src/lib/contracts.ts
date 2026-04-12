import { parseAbi, type Address } from 'viem'

// ── Deployed addresses (Base Mainnet) ─────────────────────────────────────────
export const ADDR = {
  USDC:                 '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  FundVaultV01:         '0x9dD61ee543a9C51aBe7B26A89687C9aEeea98a54' as Address,
  RewardToken:          '0xeAb54e7cFbE5d35ea5203854B44C8516201534A9' as Address,
  LockLedgerV02:        '0x2FC1d315c67AE3Df2a062f7130d58FaA6c0ce9EF' as Address,
  LockBenefitV02:       '0xeFcFc0Cdfd20786094D0f62297FF5C7B6358E481' as Address,
  LockRewardManagerV02: '0xB1e6eC37113B4cF2608acFDf9A8f8Bf38ccBf633' as Address,
  BeneficiaryModuleV02: '0x6d463f7d78Ca3a1809971D5A43E5F57066d325cF' as Address,
  UserStateEngineV02:   '0x19B09cee3534fA8fC631035e4Fe75e2C67e7637d' as Address,
  MetricsLayerV02:      '0x4937abE8e01dE6a081CF03b59151733E0Fde63E2' as Address,
  GovernanceSignalV02:  '0x9BE5636943d7BfF57ACA6047Cf945FD770CcC7d0' as Address,
  ClaimLedger:          '0x5CF9b8EC75314115EDDE5Dd332C193995Dd55234' as Address,
  StrategyManagerV01:   '0xa44d3b9b0ECD6fFa4bD646957468c0B5Bfa64A54' as Address,
} as const

// ── ABIs (parseAbi → proper typed ABI objects) ────────────────────────────────
export const USDC_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
])

export const VAULT_ABI = parseAbi([
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function pricePerShare() view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function previewDeposit(uint256 assets) view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)',
  'function depositsPaused() view returns (bool)',
  'function redeemsPaused() view returns (bool)',
  'function systemMode() view returns (uint8)',
  'function isAllowed(address account) view returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function nonces(address owner) view returns (uint256)',
  'function accrueManagementFee()',
  'function pauseDeposits()',
  'function unpauseDeposits()',
  'function pauseRedeems()',
  'function unpauseRedeems()',
  'function setMode(uint8 newMode)',
  'function setMgmtFeeBpsPerMonth(uint256 newBps)',
  'function setReserveRatioBps(uint256 newBps)',
  'function addToAllowlist(address account)',
  'function removeFromAllowlist(address account)',
  'function mgmtFeeBpsPerMonth() view returns (uint256)',
  'function reserveRatioBps() view returns (uint256)',
  'function transferToStrategyManager(uint256 amount)',
])

export const STRAT_MGR_ABI = parseAbi([
  'function invest(uint256 amount)',
  'function divest(uint256 amount) returns (uint256)',
  'function returnToVault(uint256 amount)',
  'function emergencyExit()',
  'function totalManagedAssets() view returns (uint256)',
  'function idleUnderlying() view returns (uint256)',
  'function paused() view returns (bool)',
])

export const RWT_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
])

export const LEDGER_ABI = parseAbi([
  'function getLock(uint256 lockId) view returns ((address owner, uint256 shares, uint64 lockedAt, uint64 unlockAt, bool unlocked, bool earlyExited))',
  'function userLockIds(address user) view returns (uint256[])',
  'function activeLockCount(address user) view returns (uint256)',
  'function unlock(uint256 lockId)',
])

export const BENEFIT_ABI = parseAbi([
  'function tierOf(uint256 lockId) view returns (uint8)',
  'function feeDiscountBpsOf(uint256 lockId) view returns (uint256)',
])

export const LOCK_MGR_ABI = parseAbi([
  'function lockWithReward(uint256 shares, uint64 duration) returns (uint256)',
  'function lockWithPermit(uint256 shares, uint64 duration, uint256 deadline, uint8 v, bytes32 r, bytes32 s) returns (uint256)',
  'function claimRebate(uint256 lockId) returns (uint256)',
  'function earlyExitWithReturn(uint256 lockId)',
  'function previewRebate(uint256 lockId) view returns (uint256)',
  'function issuedRewardTokens(uint256 lockId) view returns (uint256)',
  'function checkEarlyExit(uint256 lockId) view returns (uint256 rwtToReturn, uint256 rebateForfeited, uint256 sharesToReturn, uint256 penaltyBps, uint256 lockedDays, uint256 remainingDays)',
])

export const BENEFICIARY_ABI = parseAbi([
  'function beneficiaryOf(address user) view returns (address)',
  'function setBeneficiary(address beneficiary)',
  'function updateBeneficiary(address beneficiary)',
  'function revokeBeneficiary()',
  'function heartbeat()',
  'function isInactive(address user) view returns (bool)',
])

export const METRICS_ABI = parseAbi([
  'function snapshot() view returns ((uint256 totalTVL, uint256 totalLockedShares, uint256 lockedRatioBps, uint256 totalLocksEver))',
])

// ── System mode enum ──────────────────────────────────────────────────────────
export const SystemMode = {
  0: 'Normal',
  1: 'Paused',
  2: 'EmergencyExit',
} as const

export type SystemModeKey = keyof typeof SystemMode
