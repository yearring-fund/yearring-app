import { parseAbi, type Address } from 'viem'

// ── Deployed addresses (Base Mainnet — V2.1) ──────────────────────────────────
// Source: deployments/v2_1_base.json (2026-05-11)
export const ADDR = {
  USDC:                    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  PointsLedgerV01:         '0xb9c51ff318352c21f2fF5D378D31eFE0c7020dFe' as Address,
  YearRingCoreVaultV21:    '0x53e45AcB32aCD80F3d215a007fD8FE87390746F8' as Address,
  CoreStrategyManagerV21:  '0xc615c0c37524e9997622337cC973aC24C40e0548' as Address,
  TreasuryV21:             '0x413f038278A97FC2AE413380Ba0ef195F4e8a0b2' as Address,
  AccessStrategyManagerV21:'0x49f2FF1CF3BcD216f4958485407a038535f1Ebb0' as Address,
  LockManagerV21:          '0xCDc679865b5161C7b7cf75584551F5B57828d59F' as Address,
  RebateManagerV21:        '0x3B1F6956D5212bCA3Af223DD63AE31420233aDAD' as Address,
  EligibilityModuleV21:    '0x7ee0ED49A008e6feA8d196492699a87f878a2022' as Address,
  PortfolioLensV21:        '0xeb6C6b8FaE3c10271ea94dc5C071FE8147E01a0a' as Address,
  AaveUSDCStrategyCoreV21: '0x58F265139E3693651B4E30961a1e535b413BBa2C' as Address,
  AaveUSDCStrategyAsmV21:  '0xc61D5966F2802aff6c6377C21bBdE923Daf879e0' as Address,
} as const

// ── ABIs ──────────────────────────────────────────────────────────────────────

export const USDC_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
])

// YearRingCoreVaultV21 — ERC4626 + AccessControl + custom extensions
// Key differences from V01:
//   - Single systemMode (0=Normal, 1=Paused, 2=EmergencyExit); no depositsPaused/redeemsPaused
//   - No reserveRatioBps getter (compute from idle/totalAssets or use PortfolioLensV21)
//   - No lockLedger(), no externalTransfersEnabled
//   - setAllowlist(address, bool) replaces addToAllowlist/removeFromAllowlist
//   - allowlist(address) replaces isAllowed(address)
//   - Auto-rebalance via CoreStrategyManagerV21 (no manual transferToStrategyManager)
export const VAULT_ABI = parseAbi([
  // ERC4626 core
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function depositWithMinShares(uint256 assets, address receiver, uint256 minShares) returns (uint256)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function convertToShares(uint256 assets) view returns (uint256)',
  'function previewDeposit(uint256 assets) view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)',
  'function asset() view returns (address)',
  // ERC20 extensions
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function nonces(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  // V21 state reads
  'function systemMode() view returns (uint8)',
  'function allowlistEnabled() view returns (bool)',
  'function allowlist(address account) view returns (bool)',
  'function coreStrategyManager() view returns (address)',
  'function rebalanceCooldown() view returns (uint256)',
  'function lastManualRebalanceAt() view returns (uint256)',
  // Constants
  'function MIN_RESERVE_BPS() view returns (uint256)',
  'function TARGET_RESERVE_BPS() view returns (uint256)',
  'function MAX_RESERVE_BPS() view returns (uint256)',
  // AccessControl
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function EMERGENCY_ROLE() view returns (bytes32)',
  'function KEEPER_ROLE() view returns (bytes32)',
  'function ALLOWLIST_ROLE() view returns (bytes32)',
  // Admin — mode
  'function pause()',
  'function unpause()',
  'function setEmergencyExit()',
  // Admin — allowlist
  'function setAllowlist(address account, bool allowed)',
  'function setAllowlistEnabled(bool enabled)',
  // Admin — configuration
  'function setCoreStrategyManager(address sm)',
  'function setRebalanceCooldown(uint256 seconds_)',
  // Keeper
  'function rebalance()',
])

// LockManagerV21
// LockStatus enum: None=0, Active=1, Exited=2, EarlyExited=3
// LockAssetType enum: None=0, YR_USDC=1, MANAGER_UNITS=2
// LockTransition enum: None=0, EnteringManager=1, ExitingManager=2
export const LOCK_MGR_ABI = parseAbi([
  // Core operations
  'function createLock(uint256 yrUSDCAmount, uint64 committedDuration) returns (uint256 lockId)',
  'function splitLock(uint256 lockId, uint256 splitYrUSDC) returns (uint256 newLockId)',
  'function unlock(uint256 lockId) returns (uint256 returnedYrUSDC)',
  'function earlyExit(uint256 lockId) returns (uint256 returnedYrUSDC)',
  'function enterAccessStrategyManager(uint256 lockId, address manager) returns (uint256 managerUnits)',
  'function exitToLock(uint256 lockId) returns (uint256 returnedYrUSDC)',
  'function checkpointBonusPoints(uint256 lockId)',
  'function checkpointRebate(uint256 lockId)',
  'function claimRebateOf(uint256 lockId) returns (uint256 claimedUSDC)',
  // Views
  'function getLock(uint256 lockId) view returns ((address owner, uint256 yrUSDCAmount, uint256 principalAssetsUSDC, uint64 startTime, uint64 minUnlockTime, uint64 committedDuration, uint256 basePointsIssued, uint256 bonusPointsIssued, uint64 lastBonusPointsCheckpoint, uint64 lastRebateCheckpoint, uint256 claimableRebateUSDC, address manager, uint256 managerUnits, uint8 assetType, uint8 status, uint8 transition))',
  'function ownerOf(uint256 lockId) view returns (address)',
  'function totalPoints(uint256 lockId) view returns (uint256)',
  'function nextLockId() view returns (uint256)',
  'function getUserLockIds(address user, uint256 offset, uint256 limit) view returns (uint256[] lockIds, uint256 total)',
  'function totalLockedYrUSDC() view returns (uint256)',
  'function newLocksPaused() view returns (bool)',
  'function coreSMFeeBpsPerYear() view returns (uint256)',
  'function pointsLedger() view returns (address)',
  'function eligibilityModule() view returns (address)',
  'function MIN_COMMITTED_DURATION() view returns (uint256)',
  'function MIN_LOCK_ASSETS_USDC() view returns (uint256)',
  // Admin
  'function setNewLocksPaused(bool paused)',
  'function setEligibilityModule(address module)',
  'function setPointsLedger(address ledger)',
  'function setCoreSMFeeBpsPerYear(uint256 bps)',
  // AccessControl
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function KEEPER_ROLE() view returns (bytes32)',
  'function REBATE_MANAGER_ROLE() view returns (bytes32)',
])

// CoreStrategyManagerV21
export const CORE_SM_ABI = parseAbi([
  // Vault-gated (only called by vault internally)
  'function depositFromVault(uint256 assets)',
  'function withdrawToVault(uint256 assets) returns (uint256)',
  // Keeper / Admin — strategy operations
  'function invest(uint256 amount)',
  'function divestFromStrategy(uint256 amount)',
  'function emergencyExitStrategy()',
  'function accrueFee()',
  // Fee receiver
  'function redeemFeeUnits(uint256 units) returns (uint256 usdcReturned)',
  // Admin — configuration
  'function setStrategy(address strategy_)',
  'function setFeeReceiver(address feeReceiver_)',
  // Views
  'function vault() view returns (address)',
  'function strategy() view returns (address)',
  'function feeReceiver() view returns (address)',
  'function underlying() view returns (address)',
  'function totalManagedAssets() view returns (uint256)',
  'function totalUnits() view returns (uint256)',
  'function unitsOf(address account) view returns (uint256)',
  'function unitPriceRay() view returns (uint256)',
  'function vaultManagedAssets() view returns (uint256)',
  'function lastFeeAccrualAt() view returns (uint256)',
  'function FEE_BPS() view returns (uint256)',
  // AccessControl
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function KEEPER_ROLE() view returns (bytes32)',
])

// PointsLedgerV01 — non-ERC20. No approve/allowance/transfer.
export const POINTS_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function balanceOfAt(address account, uint256 snapshotId) view returns (uint256)',
  'function totalIssued() view returns (uint256)',
  'function lockPointsIssued() view returns (uint256)',
  'function contributionPointsIssued() view returns (uint256)',
  'function currentSnapshotId() view returns (uint256)',
  'function remainingSupply() view returns (uint256)',
  'function MAX_SUPPLY() view returns (uint256)',
])

// RebateManagerV21
export const REBATE_MGR_ABI = parseAbi([
  'function claimRebate(uint256 lockId)',
  'function coreVault() view returns (address)',
  'function lockManager() view returns (address)',
  'function treasury() view returns (address)',
  'function setLockManager(address lockManager_)',
  'function setTreasury(address treasury_)',
])

// PortfolioLensV21 — read-only view aggregator
// VaultInfo: (address vault, uint256 totalAssets, uint256 totalSupply, uint256 pricePerShareRay, uint8 systemMode, bool allowlistEnabled, uint256 reserveRatioBps)
// LockView: (uint256 lockId, LockInfo info, uint256 pendingBonusPoints, uint256 pendingRebateUSDC, string tierName, bool isMatured)
// UserPortfolio: (LockView[] locks, uint256 total, uint256 totalPointsBalance)
export const LENS_ABI = parseAbi([
  'function getLockView(uint256 lockId) view returns ((uint256 lockId, (address owner, uint256 yrUSDCAmount, uint256 principalAssetsUSDC, uint64 startTime, uint64 minUnlockTime, uint64 committedDuration, uint256 basePointsIssued, uint256 bonusPointsIssued, uint64 lastBonusPointsCheckpoint, uint64 lastRebateCheckpoint, uint256 claimableRebateUSDC, address manager, uint256 managerUnits, uint8 assetType, uint8 status, uint8 transition) info, uint256 pendingBonusPoints, uint256 pendingRebateUSDC, string tierName, bool isMatured))',
  'function getUserPortfolio(address user, uint256 offset, uint256 limit) view returns (((uint256 lockId, (address owner, uint256 yrUSDCAmount, uint256 principalAssetsUSDC, uint64 startTime, uint64 minUnlockTime, uint64 committedDuration, uint256 basePointsIssued, uint256 bonusPointsIssued, uint64 lastBonusPointsCheckpoint, uint64 lastRebateCheckpoint, uint256 claimableRebateUSDC, address manager, uint256 managerUnits, uint8 assetType, uint8 status, uint8 transition) info, uint256 pendingBonusPoints, uint256 pendingRebateUSDC, string tierName, bool isMatured)[] locks, uint256 total, uint256 totalPointsBalance))',
  'function getVaultInfo() view returns ((address vault, uint256 totalAssets, uint256 totalSupply, uint256 pricePerShareRay, uint8 systemMode, bool allowlistEnabled, uint256 reserveRatioBps))',
  'function checkEligibility(uint256 lockId, address manager) view returns (bool canEnter, bytes32 reason)',
  'function getManagerInfo(address manager) view returns ((address manager, uint256 totalManagedAssets, uint256 totalUnits, uint256 unitPriceRay, uint256 managementFeeBpsPerYear, address strategy, address feeReceiver, uint256 feeReceiverUnits))',
  'function getTreasuryInfo(address[] managers) view returns ((address treasury, uint256 yrUSDCBalance, uint256 yrUSDCValueUSDC, (address manager, uint256 feeReceiverUnits, uint256 usdcValue)[] managerFees))',
  // Immutables
  'function coreVault() view returns (address)',
  'function lockManager() view returns (address)',
  'function eligibilityModule() view returns (address)',
  'function pointsLedger() view returns (address)',
  'function treasury() view returns (address)',
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

// ── Lock status enums ─────────────────────────────────────────────────────────
export const LockStatus = {
  None:        0,
  Active:      1,
  Exited:      2,
  EarlyExited: 3,
} as const

export const LockAssetType = {
  None:           0,
  YR_USDC:        1,
  MANAGER_UNITS:  2,
} as const
