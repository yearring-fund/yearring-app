import { parseAbi, type Address } from 'viem'

// ── Deployed addresses (Base Mainnet — Closed Beta) ───────────────────────────
// Source: deployments/closed_beta_base.json (2026-05-07)
export const ADDR = {
  USDC:                       '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  YearRingCoreVaultV01:       '0xC4A6244A38706B33fF2515799aB803Bd66321CC2' as Address,
  TreasuryV02:                '0x8cF67610c23eb2cb6292D601e912C997f23eC6A1' as Address,
  PointsToken:                '0x8C8c0Fb048227821e00e473dEe0Fc19A7E36F042' as Address,
  LockLedgerV02:              '0xE76751af3837c3b19caF77c10bde0673e6f3afAb' as Address,
  LockBenefitV02:             '0x96b30708EDB3d492d6Ef9ABe2d2847FDBE45DCE5' as Address,
  LockPointsRebateManagerV02: '0xee05499C9B6Da23f357B9742049f90041E90fb2B' as Address,
  BeneficiaryModuleV02:       '0x753c5a9740d7e1C5A4C28189c1A5C4b072A1B369' as Address,
  UserStateEngineV02:         '0x96AffDaf6b23875398C2eDd0a0Acf11cc78106e9' as Address,
  MetricsLayerV02:            '0x18AD46989613E4c5F63fA4FEbc022F2d04a9FA9C' as Address,
  GovernanceSignalV02:        '0x968FCe2C98644893D8FfF14144b136F24bb9Bd4B' as Address,
  ClaimLedger:                '0x7A03aa022432e83bae525B186e42B160f2043239' as Address,
  StrategyManagerV01:         '0x54F1cB9D795b86b224dD16d9a4edDb073B0F0579' as Address,
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
  'function lockLedger() view returns (address)',
  'function externalTransfersEnabled() view returns (bool)',
  'function setExternalTransfersEnabled(bool enabled)',
  'function treasury() view returns (address)',
  // Emergency exit round management
  'function currentRoundId() view returns (uint256)',
  'function exitRounds(uint256 roundId) view returns ((uint256 snapshotId, uint256 snapshotTotalSupply, uint256 availableAssets, uint256 totalClaimed, bool isOpen, uint256 snapshotTimestamp))',
  'function roundSharesClaimed(uint256 roundId, address user) view returns (uint256)',
  'function balanceOfAt(address account, uint256 snapshotId) view returns (uint256)',
  'function claimExitAssets(uint256 roundId, uint256 sharesToBurn)',
  'function openExitModeRound(uint256 availableAssets)',
  'function closeExitModeRound()',
])

export const STRAT_MGR_ABI = parseAbi([
  'function invest(uint256 amount)',
  'function divest(uint256 amount) returns (uint256)',
  'function returnToVault(uint256 amount)',
  'function emergencyExit()',
  'function totalManagedAssets() view returns (uint256)',
  'function idleUnderlying() view returns (uint256)',
  'function paused() view returns (bool)',
  'function strategy() view returns (address)',
])

export const POINTS_ABI = parseAbi([
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
  'function lockWithPoints(uint256 shares, uint64 duration) returns (uint256)',
  'function lockWithPermit(uint256 shares, uint64 duration, uint256 deadline, uint8 v, bytes32 r, bytes32 s) returns (uint256)',
  'function claimRebate(uint256 lockId) returns (uint256)',
  'function earlyExit(uint256 lockId)',
  'function previewRebate(uint256 lockId) view returns (uint256)',
  'function issuedPoints(uint256 lockId) view returns (uint256)',
  'function checkEarlyExit(uint256 lockId) view returns (uint256 rebateShares, uint256 pointsToReturn, uint256 treasuryShareBalance, uint256 treasuryShareAllowance, uint256 userPointsBalance, uint256 userPointsAllowance)',
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

export const GOVERNANCE_ABI = parseAbi([
  'function nextProposalId() view returns (uint256)',
  'function votingThreshold() view returns (uint256)',
  'function votingPeriod() view returns (uint64)',
  'function hasVoted(uint256 proposalId, address voter) view returns (bool)',
  'function votingPowerOf(address voter) view returns (uint256)',
  'function PROPOSER_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function getProposal(uint256 proposalId) view returns ((address proposer, string title, string description, uint8 proposalType, uint64 startTime, uint64 endTime, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, uint256 snapshotId))',
  'function castVote(uint256 proposalId, uint8 voteType)',
  'function createProposal(string title, string description, uint8 proposalType) returns (uint256)',
])

// ── Aave V3 Pool (Base Mainnet) ────────────────────────────────────────────────
export const AAVE_V3_POOL_BASE = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as Address

export const AAVE_POOL_ABI = parseAbi([
  'function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
])

// ── System mode enum ──────────────────────────────────────────────────────────
export const SystemMode = {
  0: 'Normal',
  1: 'Paused',
  2: 'EmergencyExit',
} as const

export type SystemModeKey = keyof typeof SystemMode
