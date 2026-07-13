import { BATTLE_OUTCOMES, createBattleResult } from "./battle-contract.js";
import { exposeWildwestDebug } from "../debug-hooks.js";
import {
  createBattleTrace as createBattleTraceModel,
  createTraceCell,
  createTraceCells,
  downloadBattleTrace as downloadBattleTraceModel,
  recordBattleTraceMove as recordBattleTraceMoveModel,
  recordBattleTraceOutcome as recordBattleTraceOutcomeModel,
  summarizeMoveResult,
} from "./battle-trace.js";
import {
  createEmptyEffectSummary,
  mergeEffectSummary,
} from "./battle-effect-summary.js";
import {
  animateBattleBoardShuffleMovement,
  animateBattleBoxBlockedClick,
  animateBattleShakeCells,
  animateBattleSwap,
  animateBattleVineBlockedClick,
  animateBattleWallBlockedSwap,
  wait,
} from "./battle-animations.js";
import {
  applyBattleBoardLayout as applyBattleBoardLayoutView,
  clearBattleBoardMessage,
  clearBattleGoldTargetPreview,
  getBattleGoldPrice,
  renderBattleBoard as renderBattleBoardView,
  showBattleBoardMessage,
} from "./battle-board-view.js";
import {
  addBattleLog as addBattleLogView,
  attachBattleInventoryTooltip as attachBattleInventoryTooltipView,
  attachBattleTooltip as attachBattleTooltipView,
  closeBattleInventory as closeBattleInventoryView,
  closeBattleMiniMenu as closeBattleMiniMenuView,
  createBattleInventoryOverlay as createBattleInventoryOverlayView,
  createBattleLogOverlay as createBattleLogOverlayView,
  createBattleMiniMenuOverlay as createBattleMiniMenuOverlayView,
  hideBattleTooltip as hideBattleTooltipView,
  openBattleInventory as openBattleInventoryView,
  openBattleMiniMenu as openBattleMiniMenuView,
  positionBattleInventory as positionBattleInventoryView,
  positionBattleMiniMenu as positionBattleMiniMenuView,
  refreshBattleLogOverlayLanguage as refreshBattleLogOverlayLanguageView,
  renderBattleLog as renderBattleLogView,
  toggleBattleInventory as toggleBattleInventoryView,
  toggleBattleMiniMenu as toggleBattleMiniMenuView,
} from "./battle-popovers.js";
import {
  getBattleHealthChangeFeedback as getBattleHealthChangeFeedbackView,
  setBattleHealthFeedbackDelta as setBattleHealthFeedbackDeltaView,
  setBattleHealthFeedbackSuppression as setBattleHealthFeedbackSuppressionView,
  triggerBattleHealthChangeFeedback as triggerBattleHealthChangeFeedbackView,
} from "./battle-feedback-view.js";
import {
  getBoardElementsForSourceCells as getBoardElementsForSourceCellsFeedback,
  setMatchFeedbackForBattleChange as setMatchFeedbackForBattleChangeFeedback,
} from "./battle-match-feedback.js";
import {
  animateBattleKamikazeSelfDamageBurst as animateBattleKamikazeSelfDamageBurstView,
  animateBattleRageProjectiles as animateBattleRageProjectilesView,
  animateBattleRageTransformTargetLights as animateBattleRageTransformTargetLightsView,
  animateBattleRageWave as animateBattleRageWaveView,
  getBattleRageEffectTargetIcons as getBattleRageEffectTargetIconsView,
  stopBattleRageTransformTargetLights as stopBattleRageTransformTargetLightsView,
  triggerBattleLightDamageProjectiles as triggerBattleLightDamageProjectilesView,
} from "./battle-projectiles-view.js";
import {
  cancelBattleAttempt,
  cancelBattleLifecycle,
  isBattleAttemptActive,
  isBattleLifecycleActive,
  pauseBattleRuntime,
  resetBattleIdleTimer,
  resumeBattleRuntime,
  shouldContinueBattle,
  startBattleAttemptLifecycle,
  startBattleLifecycle,
  startBattleRuntime,
  stopBattleRuntime,
} from "./battle-runtime.js";
import {
  applyBattlePopoverScale as applyBattlePopoverScaleView,
  cleanupBattleScaffold as cleanupBattleScaffoldView,
  createBattleTopActionButton as createBattleTopActionButtonView,
  getBattleLayoutConfig as getBattleLayoutConfigView,
  getBattleRenderedScale as getBattleRenderedScaleView,
  getBattleViewportSize as getBattleViewportSizeView,
  normalizeBattleRenderTargets as normalizeBattleRenderTargetsView,
  setupBattleViewportScale as setupBattleViewportScaleView,
  showBattleScaffold as showBattleScaffoldView,
} from "./battle-scaffold-view.js";
import {
  getCurrentBattleRageConfig as getCurrentBattleRageConfigRage,
  getCurrentBattleUltimateEffects as getCurrentBattleUltimateEffectsRage,
  isBattleFieldBusyForRage as isBattleFieldBusyForRageRage,
  isBattleUltimateConvertEffect as isBattleUltimateConvertEffectRage,
  isBattleUltimateDamagePlayerByBoardItemsEffect as isBattleUltimateDamagePlayerByBoardItemsEffectRage,
  isBattleUltimateFixedPlayerDamageEffect as isBattleUltimateFixedPlayerDamageEffectRage,
  isBattleUltimateHealingEnemyByBoardItemsEffect as isBattleUltimateHealingEnemyByBoardItemsEffectRage,
  isBattleUltimateKamikazeEffect as isBattleUltimateKamikazeEffectRage,
  isBattleUltimateRestoreEnemyShieldByBoardItemsEffect as isBattleUltimateRestoreEnemyShieldByBoardItemsEffectRage,
  markBattleRagePending as markBattleRagePendingRage,
  normalizeStringList as normalizeStringListRage,
  runBattleRageAction as runBattleRageActionRage,
  runPendingBattleRageIfReady as runPendingBattleRageIfReadyRage,
  tickBattleRuntime as tickBattleRuntimeRage,
} from "./battle-rage-flow.js";
import {
  animateBattleBoardMove as animateBattleBoardMoveResolution,
  animateBattleDeaths as animateBattleDeathsResolution,
  playBattleItemActivationSounds as playBattleItemActivationSoundsResolution,
  refillBattleBoardFromReserve as refillBattleBoardFromReserveResolution,
  resolveBattleCascades as resolveBattleCascadesResolution,
} from "./battle-resolution.js";
import {
  applyBattleOrdinarySwapTurnDamage as applyBattleOrdinarySwapTurnDamageAction,
  handleBatteryBoardClick as handleBatteryBoardClickAction,
  handleBattleBoxedCellClick as handleBattleBoxedCellClickAction,
  handleBattleCellClick as handleBattleCellClickAction,
  handleBattleVinedCellClick as handleBattleVinedCellClickAction,
  handleFreeSwapBoardClick as handleFreeSwapBoardClickAction,
  handleGoldBoardClick as handleGoldBoardClickAction,
  handleSkullBoardClick as handleSkullBoardClickAction,
} from "./battle-board-actions.js";
import {
  applyBattleRageWarningVisualState as applyBattleRageWarningVisualStateStats,
  createEnemyVisual as createEnemyVisualStats,
  getBattleEnemyStatRoot as getBattleEnemyStatRootStats,
  renderBattleStats as renderBattleStatsStats,
  updateBattleRageTimerDisplay as updateBattleRageTimerDisplayStats,
} from "./battle-stats-view.js";
import {
  alignBattleBagSlotToHealMeter as alignBattleBagSlotToHealMeterInventory,
  attachBattlePointerTracker as attachBattlePointerTrackerInventory,
  clearActiveBattleSpecial as clearActiveBattleSpecialInventory,
  createBattleHeaderMenuButton as createBattleHeaderMenuButtonInventory,
  positionActiveBattleSpecialCursor as positionActiveBattleSpecialCursorInventory,
  removeActiveBattleSpecialCursor as removeActiveBattleSpecialCursorInventory,
  renderActiveBattleSpecialCursor as renderActiveBattleSpecialCursorInventory,
  renderBattleInventory as renderBattleInventoryView,
  updateBattleClockCooldownDisplay as updateBattleClockCooldownDisplayInventory,
  updateBattleHeaderMenuButton as updateBattleHeaderMenuButtonInventory,
} from "./battle-inventory-view.js";
import {
  attachBattleLanguageChangeListener as attachBattleLanguageChangeListenerFlow,
  updateBattleTopActionButtonLabel as updateBattleTopActionButtonLabelFlow,
} from "./battle-language-flow.js";
import {
  areBattleBoardsEqual as areBattleBoardsEqualShuffle,
  createNoMovesBattleShuffle as createNoMovesBattleShuffleFlow,
  handleBattleIdle as handleBattleIdleShuffle,
  handleManualBattleShuffle as handleManualBattleShuffleFlow,
  handleNoBattleMoves as handleNoBattleMovesShuffle,
  shuffleCurrentBattleBoard as shuffleCurrentBattleBoardFlow,
  updateBattleShuffleButtonLanguage as updateBattleShuffleButtonLanguageFlow,
  updateBattleShuffleButtonState as updateBattleShuffleButtonStateFlow,
} from "./battle-shuffle-flow.js";
import {
  advanceBattleTutorialAfterInventoryAction,
  advanceBattleTutorialAfterMove,
  completeBattleTutorialAfterShuffle,
  getBattleTutorialGoldReplacementItemId,
  guardBattleTutorialCellClick,
  isBattleTutorialInventoryItemAllowed,
  isBattleTutorialInventoryItemRequired,
  isBattleTutorialActive,
  isBattleTutorialShuffleStep,
  prepareBattleTutorialAttemptState,
  refreshBattleTutorialUi as refreshBattleTutorialUiFlow,
  shouldStopBattleTutorialCascades,
  setupBattleTutorialUi as setupBattleTutorialUiFlow,
} from "./battle-tutorial-flow.js";
import {
  closeScaffold as closeScaffoldOutcome,
  completeBattleVictory as completeBattleVictoryOutcome,
  createBattleOutcomeElement as createBattleOutcomeElementOutcome,
  createScaffoldResult as createScaffoldResultOutcome,
  finishBattle as finishBattleOutcome,
  openBattleSettings as openBattleSettingsOutcome,
  openBattleSurrender as openBattleSurrenderOutcome,
  restartCurrentBattle as restartCurrentBattleOutcome,
  showBattleDefeat as showBattleDefeatOutcome,
  showBattleOutcomeBanner as showBattleOutcomeBannerOutcome,
} from "./battle-outcome-flow.js";
import {
  ACTIVE_BATTLE_ITEM_IDS,
  BAG_ITEM_ID,
  BATTLE_POPUP_EDGE_GAP_PX,
  BATTLE_POPUP_INVENTORY_COLUMNS,
  BATTLE_POPUP_INVENTORY_GAP_PX,
  BATTLE_POPUP_INVENTORY_QUANTITY_FONT_PX,
  BATTLE_POPUP_INVENTORY_QUANTITY_MIN_WIDTH_PX,
  BATTLE_POPUP_INVENTORY_QUANTITY_OFFSET_X_PX,
  BATTLE_POPUP_INVENTORY_QUANTITY_OFFSET_Y_PX,
  BATTLE_POPUP_INVENTORY_SLOT_PX,
  BATTLE_POPUP_INVENTORY_VERTICAL_OFFSET_RATIO,
  BATTLE_POPUP_MENU_GAP_PX,
  BATTLE_POPUP_PADDING_PX,
  BATTLE_POPUP_RADIUS_PX,
  BATTLE_POPUP_SHIFT_PX,
  BATTLE_POPUP_TOP_BUTTON_RADIUS_PX,
  BATTLE_POPUP_TOP_BUTTON_SIZE_PX,
  CLOCK_ITEM_ID,
  DEFAULT_BATTLE_LAYOUT,
  DEFAULT_CLOCK_WARNING_CHANGE_SCALE,
  DEFAULT_HAND_ITEM_IDS,
  DEFAULT_LIGHT_BLUE_PROJECTILE_ICON,
  DEFAULT_LIGHT_GOLD_PROJECTILE_ICON,
  DEFAULT_LIGHT_GREEN_PROJECTILE_ICON,
  DEFAULT_LIGHT_PROJECTILE_ARC_HEIGHT_PX,
  DEFAULT_LIGHT_PROJECTILE_COUNT,
  DEFAULT_LIGHT_PROJECTILE_ICON,
  DEFAULT_LIGHT_PROJECTILE_MS,
  DEFAULT_LIGHT_PROJECTILE_SIZE_PX,
  DEFAULT_LIGHT_PROJECTILE_SPREAD_PX,
  GOLD_ITEM_ID,
  LITTLE_MENU_ITEM_ID,
  MAX_DAMAGE_PROJECTILES,
  MIN_DAMAGE_PROJECTILES,
  SKULL_ITEM_ID,
  SPECIAL_ITEM_IDS,
  SWAP_ITEM_ID,
  getBattleAnimationConfig,
  getBattleBoardConfig,
  getBattleEnemyShieldMax,
  getBattleSoundVolume,
  getBattleTooltipDelayMs,
  getBattleTooltipDurationMs,
  getBattleTopButtonConfig,
  getBattleUiConfig,
  getClockWarningChangeMs,
  getClockWarningChangeScale,
  getClockWarningSeconds,
  resolveAssetPath,
} from "./battle-config.js";
import {
  createBattleTooltipLabel as createBattleTooltipLabelFormatter,
  formatBattleNumber as formatBattleNumberFormatter,
  formatBattleSeconds as formatBattleSecondsFormatter,
  formatMoveStatus as formatMoveStatusFormatter,
  translate as translateFormatter,
  translateBattleText as translateBattleTextFormatter,
} from "./battle-formatters.js";
import {
  createBattleReserveBoardForCurrentStage,
  ensureBattleReserveBoardForCurrentStage,
  ensureBattleStateShape,
  getBattleGenerationConfig,
  getBattleRandom,
  getCurrentBattleStageIndex,
  prepareBattleAttemptState as prepareBattleAttemptStateBase,
  syncBattleBoxesWithStage,
  syncBattleVinesWithStage,
  syncBattleWallsWithStage,
} from "./battle-state.js";
import {
  changeInventoryQuantity as changeInventoryQuantityPlayerItems,
  getBattleHandItemIds as getBattleHandItemIdsPlayerItems,
  getInventoryQuantity as getInventoryQuantityPlayerItems,
  getItemDescription as getItemDescriptionPlayerItems,
  getItemLabel as getItemLabelPlayerItems,
} from "./battle-player-items.js";

const MAX_CASCADE_STEPS = 30;
const battleDepsCache = new Map();

function getCachedBattleDeps(key, createDeps) {
  if (!battleDepsCache.has(key)) {
    battleDepsCache.set(key, createDeps());
  }
  return battleDepsCache.get(key);
}

export function createBattleView(options = {}) {
  // battle-view остается фасадом: он собирает view/flow модули и сохраняет
  // старые имена функций для callsites, пока боевой слой режется на части.
  const engine = assertBattleEngine(options.engine);

  return {
    root: options.root || null,
    start(context) {
      ensureBattleContext(context);
      exposeWildwestDebug("battle", { context });
      context.engine = engine;
      context.callbacks = options.callbacks || {};
      return showBattleScaffold(context, options.root || document.body);
    },
  };
}

function ensureBattleContext(context) {
  if (!context || typeof context !== "object") {
    throw new Error("Battle start request is missing.");
  }
  const requiredParts = ["request", "battleData", "battleState"];
  for (const key of requiredParts) {
    if (!context[key]) {
      throw new Error(`Battle start context is missing required field: ${key}.`);
    }
  }
  const request = context.request;
  if (!request || typeof request !== "object") {
    throw new Error("Battle request is missing.");
  }
  if (!request.enemyId || !request.background || !request.playerState || !request.itemCatalog) {
    throw new Error("Battle request is invalid.");
  }
}

function createBattleRuntimeHandlers() {
  return {
    onTick: tickBattleRuntime,
    onIdle: handleBattleIdle,
    getIdleDelayMs: (context) => getBattleAnimationConfig(context).idleHintDelayMs,
  };
}

function createBattleFormatterDeps() {
  // Все deps factory ниже намеренно явные. Извлеченные battle-модули не тянут
  // общий context импортом, а получают только нужные helper'ы.
  return getCachedBattleDeps("formatter", () => ({
    getBattleUiConfig,
  }));
}

function createBattlePlayerItemsDeps() {
  return getCachedBattleDeps("playerItems", () => ({
    DEFAULT_HAND_ITEM_IDS,
    getBattleUiConfig,
    translate,
  }));
}

function createBattleScaffoldViewDeps() {
  return getCachedBattleDeps("scaffoldView", () => ({
    DEFAULT_BATTLE_LAYOUT,
    BATTLE_POPUP_MENU_GAP_PX,
    BATTLE_POPUP_INVENTORY_GAP_PX,
    BATTLE_POPUP_PADDING_PX,
    BATTLE_POPUP_RADIUS_PX,
    BATTLE_POPUP_SHIFT_PX,
    BATTLE_POPUP_EDGE_GAP_PX,
    BATTLE_POPUP_INVENTORY_SLOT_PX,
    BATTLE_POPUP_TOP_BUTTON_SIZE_PX,
    BATTLE_POPUP_TOP_BUTTON_RADIUS_PX,
    BATTLE_POPUP_INVENTORY_QUANTITY_FONT_PX,
    BATTLE_POPUP_INVENTORY_QUANTITY_OFFSET_X_PX,
    BATTLE_POPUP_INVENTORY_QUANTITY_OFFSET_Y_PX,
    BATTLE_POPUP_INVENTORY_QUANTITY_MIN_WIDTH_PX,
    startBattleLifecycle,
    startBattleAttemptLifecycle,
    startBattleRuntime,
    shouldContinueBattle,
    ensureBattleStateShape,
    prepareBattleAttemptState,
    setupBattleTutorialUi,
    createBattleTrace,
    createBattleRuntimeHandlers,
    renderBattleBoard,
    renderBattleStats,
    renderBattleInventory,
    setBattleStatus,
    applyBattleBoardLayout,
    createEnemyVisual,
    createBattleMiniMenuOverlay,
    createBattleInventoryOverlay,
    createBattleLogOverlay,
    createBattleHeaderMenuButton,
    alignBattleBagSlotToHealMeter,
    attachBattleTooltip,
    attachBattlePointerTracker,
    attachBattleLanguageChangeListener,
    attachBattleCheatCommands,
    closeBattleMiniMenu,
    addBattleLog,
    renderBattleLog,
    openBattleSettings,
    openBattleSurrender,
    handleManualBattleShuffle,
    positionBattleMiniMenu,
    positionBattleInventory,
    hideBattleTooltip,
    removeActiveBattleSpecialCursor,
    getBattleUiConfig,
    getBattleTopButtonConfig,
    translate,
    translateBattleText,
    resolveAssetPath,
  }));
}

function createBattleBoardViewDeps() {
  return getCachedBattleDeps("boardView", () => ({
    GOLD_ITEM_ID,
    updateBattleShuffleButtonState,
    getBattleBoardConfig,
    getBattleUiConfig,
    isSameCell,
    isBattleCellBoxed,
    isBattleCellVined,
    getItemLabel,
    resolveAssetPath,
    translate,
    attachBattleTooltip,
    handleBattleCellClick,
    isBattleLifecycleActive,
    isBattleAttemptActive,
    refreshBattleTutorialUi,
    renderBattleStats,
  }));
}

function createBattlePopoverDeps() {
  return getCachedBattleDeps("popover", () => ({
    BAG_ITEM_ID,
    BATTLE_POPUP_EDGE_GAP_PX,
    BATTLE_POPUP_INVENTORY_COLUMNS,
    BATTLE_POPUP_INVENTORY_GAP_PX,
    BATTLE_POPUP_INVENTORY_SLOT_PX,
    BATTLE_POPUP_INVENTORY_VERTICAL_OFFSET_RATIO,
    BATTLE_POPUP_MENU_GAP_PX,
    BATTLE_POPUP_PADDING_PX,
    BATTLE_POPUP_TOP_BUTTON_SIZE_PX,
    getBattleHandItemIds,
    getBattleRenderedScale,
    getBattleTooltipDelayMs,
    getBattleTooltipDurationMs,
    normalizeBattleRenderTargets,
    pauseBattleRuntime,
    renderBattleInventory,
    resolveAssetPath,
    resumeBattleRuntime,
    shouldContinueBattle,
    translate,
    downloadBattleTrace,
  }));
}

function createBattleFeedbackDeps() {
  return getCachedBattleDeps("feedback", () => ({
    getBattleHealthChangeAnimation,
    triggerBattleLightDamageProjectiles,
    formatBattleNumber,
  }));
}

function createBattleMatchFeedbackDeps() {
  return getCachedBattleDeps("matchFeedback", () => ({
    getBattlePlayerHealthSourceElements,
    getBattlePlayerHealSourceElements,
    setBattleHealthFeedbackDelta,
    setBattleHealthFeedbackSuppression,
  }));
}

function createBattleProjectilesDeps() {
  return getCachedBattleDeps("projectiles", () => ({
    DEFAULT_LIGHT_PROJECTILE_ICON,
    DEFAULT_LIGHT_BLUE_PROJECTILE_ICON,
    DEFAULT_LIGHT_GREEN_PROJECTILE_ICON,
    DEFAULT_LIGHT_GOLD_PROJECTILE_ICON,
    DEFAULT_LIGHT_PROJECTILE_COUNT,
    DEFAULT_LIGHT_PROJECTILE_MS,
    DEFAULT_LIGHT_PROJECTILE_ARC_HEIGHT_PX,
    DEFAULT_LIGHT_PROJECTILE_SPREAD_PX,
    DEFAULT_LIGHT_PROJECTILE_SIZE_PX,
    MIN_DAMAGE_PROJECTILES,
    MAX_DAMAGE_PROJECTILES,
    getBattleAnimationConfig,
    getBattleUiConfig,
    resolveAssetPath,
    getBattleEnemyStatRoot,
    getBattleEnemyHealthSourceElements,
    getCurrentBattleRageConfig,
    getCurrentBattleUltimateEffects,
    isBattleUltimateConvertEffect,
    isBattleUltimateDamagePlayerByBoardItemsEffect,
    isBattleUltimateFixedPlayerDamageEffect,
    isBattleUltimateHealingEnemyByBoardItemsEffect,
    isBattleUltimateRestoreEnemyShieldByBoardItemsEffect,
    isBattleUltimateKamikazeEffect,
    normalizeStringList,
    isBattleCellBoxed,
  }));
}

function createBattleRageFlowDeps() {
  return getCachedBattleDeps("rageFlow", () => ({
    DEFAULT_LIGHT_PROJECTILE_MS,
    shouldContinueBattle,
    hasActiveBattleResolutionAnimation,
    updateBattleClockCooldownDisplay,
    updateBattleRageTimerDisplay,
    applyBattleRageWarningVisualState,
    getBattleEnemyStatRoot,
    pauseBattleRuntime,
    resumeBattleRuntime,
    resetBattleIdleTimer,
    getBattleUiConfig,
    getBattleAnimationConfig,
    setBattleStatus,
    translate,
    renderBattleBoard,
    renderBattleStats,
    animateBattleRageWave,
    animateBattleRageProjectiles,
    animateBattleKamikazeSelfDamageBurst,
    animateBattleRageTransformTargetLights,
    stopBattleRageTransformTargetLights,
    getBattleRageEffectTargetIcons,
    setBattleHealthFeedbackDelta,
    getBoardElementsForSourceCells,
    getBattleEnemyShieldMax,
    getBattleEnemyHealthSourceElements,
    getBattleRandom,
    wait,
    isBattlePlayerDefeated,
    showBattleDefeat,
    resolveBattleCascades,
    formatMoveStatus,
    finishBattleMoveIfNeeded,
  }));
}

function createBattleStatsViewDeps() {
  return getCachedBattleDeps("statsView", () => ({
    DEFAULT_CLOCK_WARNING_CHANGE_SCALE,
    getBattleUiConfig,
    getCurrentBattleStageIndex,
    getBattleEnemyShieldMax,
    getBattleHealthChangeFeedback,
    triggerBattleHealthChangeFeedback,
    attachBattleTooltip,
    createBattleTooltipLabel,
    resolveAssetPath,
    translate,
    formatBattleSeconds,
    formatBattleNumber,
    getClockWarningSeconds,
    getClockWarningChangeMs,
    getClockWarningChangeScale,
  }));
}

function createBattleInventoryViewDeps() {
  return getCachedBattleDeps("inventoryView", () => ({
    ACTIVE_BATTLE_ITEM_IDS,
    BAG_ITEM_ID,
    CLOCK_ITEM_ID,
    GOLD_ITEM_ID,
    LITTLE_MENU_ITEM_ID,
    SPECIAL_ITEM_IDS,
    advanceBattleTutorialAfterInventoryAction: (context, itemId, renderTargets) => (
      advanceBattleTutorialAfterInventoryAction(
        createBattleTutorialDeps(),
        context,
        itemId,
        normalizeBattleRenderTargets(context, renderTargets),
      )
    ),
    attachBattleInventoryTooltip,
    changeInventoryQuantity,
    clearBattleGoldTargetPreview,
    getBattleHandItemIds,
    getBattleRenderedScale,
    getBattleUiConfig,
    getInventoryQuantity,
    getItemDescription,
    getItemLabel,
    isBattleTutorialInventoryItemAllowed,
    isBattleTutorialInventoryItemRequired,
    renderBattleBoard,
    resetBattleIdleTimer,
    resolveAssetPath,
    setBattleStatus,
    toggleBattleInventory,
    toggleBattleMiniMenu,
    translate,
  }));
}

function createBattleLanguageFlowDeps() {
  return getCachedBattleDeps("languageFlow", () => ({
    getBattleTopButtonConfig,
    refreshBattleLogOverlayLanguage,
    renderBattleInventory,
    renderBattleStats,
    shouldContinueBattle,
    translate,
    translateBattleText,
    updateBattleHeaderMenuButton,
    updateBattleShuffleButtonLanguage,
  }));
}

function createBattleShuffleFlowDeps() {
  return getCachedBattleDeps("shuffleFlow", () => ({
    animateBattleBoardShuffleMovement,
    animateBattleShakeCells,
    clearActiveBattleSpecial,
    clearBattleBoardMessage,
    completeBattleTutorialAfterShuffle,
    createBattleReserveBoardForCurrentStage,
    finishBattleMoveIfNeeded,
    recordBattleTraceMove,
    getBattleAnimationConfig,
    getBattleRandom,
    getBattlePlayerHealthSourceElements,
    getBattleUiConfig,
    isBattleTutorialActive,
    isBattleTutorialShuffleStep,
    isBattlePlayerDefeated,
    renderBattleBoard,
    renderBattleInventory,
    renderBattleStats,
    resetBattleIdleTimer,
    setBattleHealthFeedbackDelta,
    setBattleStatus,
    shouldContinueBattle,
    showBattleBoardMessage,
    showBattleDefeat,
    syncBattleBoxesWithStage,
    syncBattleVinesWithStage,
    syncBattleWallsWithStage,
    translate,
    translateBattleText,
    wait,
  }));
}

function createBattleOutcomeFlowDeps() {
  return getCachedBattleDeps("outcomeFlow", () => ({
    BATTLE_OUTCOMES,
    cancelBattleAttempt,
    cancelBattleLifecycle,
    cleanupBattleScaffold,
    clearActiveBattleSpecial,
    clearBattleBoardMessage,
    createBattleResult,
    createBattleTrace,
    getBattleAnimationConfig,
    getBattleUiConfig,
    normalizeBattleRenderTargets,
    pauseBattleRuntime,
    prepareBattleAttemptState,
    setupBattleTutorialUi,
    renderBattleBoard,
    renderBattleInventory,
    renderBattleStats,
    resumeBattleRuntime,
    setBattleStatus,
    shouldContinueBattle,
    startBattleAttemptLifecycle,
    startBattleRuntime,
    stopBattleRuntime,
    translate,
    translateBattleText,
    recordBattleTraceOutcome,
    wait,
  }));
}

function createBattleResolutionDeps() {
  return getCachedBattleDeps("resolution", () => ({
    MAX_CASCADE_STEPS,
    shouldContinueBattle,
    wait,
    getBattleAnimationConfig,
    getBattleGenerationConfig,
    getCurrentBattleStageIndex,
    shouldStopBattleTutorialCascades,
    ensureBattleReserveBoardForCurrentStage,
    setMatchFeedbackForBattleChange,
    renderBattleStats,
    renderBattleBoard,
    syncBattleWallsWithStage,
    syncBattleBoxesWithStage,
    syncBattleVinesWithStage,
    createEmptyEffectSummary,
    mergeEffectSummary,
    addBattleLog,
    translateBattleText,
    resolveAssetPath,
    getBattleSoundVolume,
  }));
}

function createBattleBoardActionsDeps() {
  return getCachedBattleDeps("boardActions", () => ({
    GOLD_ITEM_ID,
    SKULL_ITEM_ID,
    SWAP_ITEM_ID,
    shouldContinueBattle,
    resetBattleIdleTimer,
    animateBattleShakeCells,
    animateBattleSwap,
    animateBattleWallBlockedSwap,
    animateBattleBoxBlockedClick,
    animateBattleVineBlockedClick,
    getBattleAnimationConfig,
    getBattleSwapDurationMs,
    getBattleUiConfig,
    getBattleRandom,
    clearBattleGoldTargetPreview,
    getBattleGoldPrice,
    getBattleTutorialGoldReplacementItemId,
    getInventoryQuantity,
    changeInventoryQuantity,
    clearActiveBattleSpecial,
    renderBattleInventory,
    renderBattleBoard,
    renderBattleStats,
    setBattleStatus,
    translate,
    translateBattleText,
    formatMoveStatus,
    finishBattleMoveIfNeeded,
    getBattleAreaCells,
    isBattleCellBoxed,
    isBattleCellVined,
    isSameCell,
    areAdjacentCells,
    resolveBattleCascades,
    animateBattleDeaths,
    playBattleItemActivationSounds,
    refillBattleBoardFromReserve,
    animateBattleBoardMove,
    setMatchFeedbackForBattleChange,
    setBattleHealthFeedbackDelta,
    getBoardElementsForSourceCells,
    createEmptyEffectSummary,
    mergeEffectSummary,
    syncBattleWallsWithStage,
    syncBattleBoxesWithStage,
    syncBattleVinesWithStage,
    isBattlePlayerDefeated,
    showBattleDefeat,
    recordBattleTraceMove,
    createTraceCell,
    createTraceCells,
    summarizeMoveResult,
  }));
}

function createBattleTutorialDeps() {
  return getCachedBattleDeps("tutorialFlow", () => ({
    animateBattleShakeCells,
    getBattleAnimationConfig,
    renderBattleBoard,
    renderBattleInventory,
    renderBattleStats,
    resolveAssetPath,
    setBattleStatus,
    translate,
  }));
}

function setupBattleTutorialUi(context, renderTargets) {
  return setupBattleTutorialUiFlow(createBattleTutorialDeps(), context, renderTargets);
}

function refreshBattleTutorialUi(context, renderTargets) {
  return refreshBattleTutorialUiFlow(createBattleTutorialDeps(), context, renderTargets);
}

function showBattleScaffold(context, root) {
  return showBattleScaffoldView(createBattleScaffoldViewDeps(), context, root);
}

function createBattleMiniMenuOverlay(panel, context) {
  return createBattleMiniMenuOverlayView(createBattlePopoverDeps(), panel, context);
}

function toggleBattleMiniMenu(context, renderTargets) {
  toggleBattleMiniMenuView(createBattlePopoverDeps(), context, renderTargets);
}

function openBattleMiniMenu(context, renderTargets) {
  openBattleMiniMenuView(createBattlePopoverDeps(), context, renderTargets);
}

function closeBattleMiniMenu(context, renderTargets, options = {}) {
  closeBattleMiniMenuView(createBattlePopoverDeps(), context, renderTargets, options);
}

function positionBattleMiniMenu(context, renderTargets) {
  positionBattleMiniMenuView(createBattlePopoverDeps(), context, renderTargets);
}

function createBattleInventoryOverlay(panel, context) {
  return createBattleInventoryOverlayView(createBattlePopoverDeps(), panel, context);
}

function toggleBattleInventory(context, renderTargets) {
  toggleBattleInventoryView(createBattlePopoverDeps(), context, renderTargets);
}

function openBattleInventory(context, renderTargets) {
  openBattleInventoryView(createBattlePopoverDeps(), context, renderTargets);
}

function closeBattleInventory(context, renderTargets, options = {}) {
  closeBattleInventoryView(createBattlePopoverDeps(), context, renderTargets, options);
}

function positionBattleInventory(context, renderTargets) {
  positionBattleInventoryView(createBattlePopoverDeps(), context, renderTargets);
}

function createBattleLogOverlay(context) {
  return createBattleLogOverlayView(createBattlePopoverDeps(), context);
}

function renderBattleLog(logOverlay, context) {
  renderBattleLogView(logOverlay, context);
}

function addBattleLog(context, message) {
  addBattleLogView(context, message);
}

function createBattleTrace(context) {
  return createBattleTraceModel(context);
}

function recordBattleTraceMove(context, action) {
  return recordBattleTraceMoveModel(context, action);
}

function recordBattleTraceOutcome(context, outcome) {
  return recordBattleTraceOutcomeModel(context, outcome);
}

function downloadBattleTrace(context) {
  return downloadBattleTraceModel(context);
}

function attachBattleLanguageChangeListener(context, renderTargets) {
  attachBattleLanguageChangeListenerFlow(createBattleLanguageFlowDeps(), context, renderTargets);
}

function attachBattleCheatCommands(context, renderTargets) {
  if (!isBattleCheatInputEnabled(context)) {
    return;
  }
  const autoWinCommand = findBattleCheatCommand(context, "autoWin");
  if (!autoWinCommand) {
    return;
  }
  let inputBuffer = "";
  const maxLength = getBattleCheatInputBufferMaxLength(context);

  const onKeyDown = (event) => {
    const input = getBattleCheatInputCharacter(event);
    if (!input || shouldIgnoreBattleCheatInputTarget(event.target)) {
      return;
    }
    inputBuffer = `${inputBuffer}${input}`.slice(-maxLength);
    if (!inputBuffer.endsWith(autoWinCommand.command)) {
      return;
    }
    event.preventDefault();
    inputBuffer = "";
    completeBattleVictory(context, renderTargets);
  };

  window.addEventListener("keydown", onKeyDown);
  context.cleanupBattleCheatCommands = () => {
    window.removeEventListener("keydown", onKeyDown);
  };
}

function isBattleCheatInputEnabled(context) {
  const cheats = context.request?.cheats;
  return cheats?.active === true && cheats.inputMode === "typedSequence";
}

function findBattleCheatCommand(context, id) {
  return (context.request?.cheats?.commands || []).find((command) => {
    return command?.scope === "battle" && command?.id === id && command.command;
  }) || null;
}

function getBattleCheatInputBufferMaxLength(context) {
  const configured = Number(context.request?.cheats?.bufferMaxLength);
  const longestCommand = (context.request?.cheats?.commands || []).reduce((max, command) => {
    return Math.max(max, String(command?.command || "").length);
  }, 0);
  return Math.max(longestCommand, Number.isFinite(configured) ? Math.floor(configured) : 0, 1);
}

function getBattleCheatInputCharacter(event) {
  if (event.ctrlKey || event.altKey || event.metaKey || event.key?.length !== 1) {
    return "";
  }
  return event.key.toLowerCase();
}

function shouldIgnoreBattleCheatInputTarget(target) {
  const element = target instanceof Element ? target : null;
  if (!element) {
    return false;
  }
  return Boolean(element.closest("input, select, textarea, [contenteditable='true']"));
}

function updateBattleShuffleButtonLanguage(context, button) {
  updateBattleShuffleButtonLanguageFlow(createBattleShuffleFlowDeps(), context, button);
}

function updateBattleShuffleButtonState(context) {
  updateBattleShuffleButtonStateFlow(createBattleShuffleFlowDeps(), context);
}

function createBattleTopActionButton(context, actionId, additionalClassName = "") {
  return createBattleTopActionButtonView(createBattleScaffoldViewDeps(), context, actionId, additionalClassName);
}

function updateBattleTopActionButtonLabel(context, button, actionId) {
  updateBattleTopActionButtonLabelFlow(createBattleLanguageFlowDeps(), context, button, actionId);
}

function refreshBattleLogOverlayLanguage(logOverlay, context) {
  refreshBattleLogOverlayLanguageView(createBattlePopoverDeps(), logOverlay, context);
}

function setBattleStatus(context, statusElement, message) {
  statusElement.textContent = message;
  addBattleLog(context, message);
}

function openBattleSettings(context, renderTargets) {
  openBattleSettingsOutcome(createBattleOutcomeFlowDeps(), context, renderTargets);
}

function openBattleSurrender(context, renderTargets) {
  openBattleSurrenderOutcome(createBattleOutcomeFlowDeps(), context, renderTargets);
}

async function completeBattleVictory(context, renderTargets) {
  await completeBattleVictoryOutcome(createBattleOutcomeFlowDeps(), context, renderTargets);
}

function showBattleDefeat(context, renderTargets) {
  showBattleDefeatOutcome(createBattleOutcomeFlowDeps(), context, renderTargets);
}

function restartCurrentBattle(context, renderTargets, banner) {
  restartCurrentBattleOutcome(createBattleOutcomeFlowDeps(), context, renderTargets, banner);
}

async function showBattleOutcomeBanner(overlay, title, durationMs) {
  await showBattleOutcomeBannerOutcome(createBattleOutcomeFlowDeps(), overlay, title, durationMs);
}

function createBattleOutcomeElement(title) {
  return createBattleOutcomeElementOutcome(title);
}

function finishBattle(context, renderTargets, outcome) {
  finishBattleOutcome(createBattleOutcomeFlowDeps(), context, renderTargets, outcome);
}

function createEnemyVisual(context) {
  return createEnemyVisualStats(createBattleStatsViewDeps(), context);
}

function renderBattleStats(enemyStatsElement, playerMetersElement, ultimateTextElement, context) {
  return renderBattleStatsStats(
    createBattleStatsViewDeps(),
    enemyStatsElement,
    playerMetersElement,
    ultimateTextElement,
    context,
  );
}
function getBattleHealthChangeFeedback(context, statId, currentValue) {
  return getBattleHealthChangeFeedbackView(context, statId, currentValue);
}

function setBattleHealthFeedbackDelta(context, statId, delta, options = {}) {
  setBattleHealthFeedbackDeltaView(context, statId, delta, options);
}

function getBoardElementsForSourceCells(context, sourceCells) {
  return getBoardElementsForSourceCellsFeedback(context, sourceCells);
}

function setBattleHealthFeedbackSuppression(context, statId, options = {}) {
  setBattleHealthFeedbackSuppressionView(context, statId, options);
}

function setMatchFeedbackForBattleChange(context, beforeEnemyState, afterEnemyState, beforePlayerState, afterPlayerState, effectSummary, board, matches) {
  setMatchFeedbackForBattleChangeFeedback(
    createBattleMatchFeedbackDeps(),
    context,
    beforeEnemyState,
    afterEnemyState,
    beforePlayerState,
    afterPlayerState,
    effectSummary,
    board,
    matches,
  );
}

function triggerBattleHealthChangeFeedback(context, iconWrapper, delta, modifier, sourceElements = [], options = {}) {
  triggerBattleHealthChangeFeedbackView(
    createBattleFeedbackDeps(),
    context,
    iconWrapper,
    delta,
    modifier,
    sourceElements,
    options,
  );
}

function triggerBattleLightDamageProjectiles(context, iconWrapper, statDelta, modifier, sourceElements = [], options = {}) {
  return triggerBattleLightDamageProjectilesView(
    createBattleProjectilesDeps(),
    context,
    iconWrapper,
    statDelta,
    modifier,
    sourceElements,
    options,
  );
}

function getBattlePlayerHealthSourceElements(context) {
  const enemyDamageElement = context?.battleRenderTargets?.enemyVisual?.querySelector('[data-battle-stat="enemy-damage"]')
    || getBattleEnemyStatRoot(context)?.querySelector('[data-battle-stat="enemy-damage"]');
  if (enemyDamageElement) {
    const enemyDamageIcon = enemyDamageElement.querySelector("img");
    if (enemyDamageIcon) {
      return [enemyDamageIcon];
    }
  }

  const playerHealthMeter = context?.battleRenderTargets?.playerMeters?.querySelector('[data-battle-stat-id="player-health"]');
  if (!playerHealthMeter) {
    return [];
  }
  const playerHealthIcon = playerHealthMeter.querySelector(".battle-scaffold-meter-icon");
  return playerHealthIcon ? [playerHealthIcon] : [];
}

function getBattleEnemyHealthSourceElements(context) {
  const enemyHealthMeter = context?.battleRenderTargets?.enemyVisual?.querySelector('[data-battle-stat-id="enemy-health"]')
    || context?.battleRenderTargets?.enemyStats?.querySelector('[data-battle-stat-id="enemy-health"]');
  if (!enemyHealthMeter) {
    return [];
  }
  const enemyHealthIcon = enemyHealthMeter.querySelector(".battle-scaffold-meter-base-icon")
    || enemyHealthMeter.querySelector(".battle-scaffold-meter-icon");
  return enemyHealthIcon ? [enemyHealthIcon] : [];
}

function getBattlePlayerHealSourceElements(context) {
  const playerHealMeter = context?.battleRenderTargets?.playerMeters?.querySelector('[data-battle-stat-id="player-heal"]');
  if (!playerHealMeter) {
    return [];
  }
  const playerHealIcon = playerHealMeter.querySelector(".battle-scaffold-meter-icon img");
  return playerHealIcon ? [playerHealIcon] : [];
}

function getBattleHealthChangeAnimation(context, modifier = "player-health") {
  const animations = getBattleUiConfig(context).animations;
  const key = (() => {
    if (modifier === "enemy-health" || modifier === "player-health") {
      return "health";
    }
    if (modifier === "player-heal") {
      return "heal";
    }
    if (modifier === "enemy-aggression") {
      return "aggression";
    }
    return "health";
  })();
  const duration = Number(animations[`${key}ChangeMs`]);
  const scale = Number(animations[`${key}ChangeScale`]);
  const floatMs = Number(animations[`${key}ChangeFloatMs`]);
  const floatRisePx = Number(animations[`${key}ChangeFloatRisePx`]);
  return {
    durationMs: Number.isFinite(duration) && duration >= 0 ? duration : Number(animations.healthChangeMs) || 3000,
    scale: Number.isFinite(scale) && scale >= 1 ? scale : Math.max(1, Number(animations.healthChangeScale) || 1.5),
    floatMs:
      Number.isFinite(floatMs) && floatMs >= 0
        ? floatMs
        : Number.isFinite(duration) && duration >= 0 ? duration : Number(animations.healthChangeMs) || 3000,
    floatRisePx:
      Number.isFinite(floatRisePx) && floatRisePx >= 0
        ? floatRisePx
        : Number(animations.healthChangeFloatRisePx) || 120,
  };
}

function getBattleEnemyStatRoot(context) {
  return getBattleEnemyStatRootStats(context);
}
function renderBattleInventory(specialItemsElement, handItemsElement, context, renderTargets = null) {
  renderBattleInventoryView(
    createBattleInventoryViewDeps(),
    specialItemsElement,
    handItemsElement,
    context,
    renderTargets,
  );
}

function alignBattleBagSlotToHealMeter(renderTargets) {
  alignBattleBagSlotToHealMeterInventory(createBattleInventoryViewDeps(), renderTargets);
}

function createBattleHeaderMenuButton(context) {
  return createBattleHeaderMenuButtonInventory(createBattleInventoryViewDeps(), context);
}

function updateBattleHeaderMenuButton(context, renderTargets) {
  updateBattleHeaderMenuButtonInventory(createBattleInventoryViewDeps(), context, renderTargets);
}

function attachBattleInventoryTooltip(context, element, { name, description, icon }) {
  attachBattleInventoryTooltipView(createBattlePopoverDeps(), context, element, { name, description, icon });
}

function attachBattleTooltip(context, element, { name, description, icon, getContent }, options = {}) {
  attachBattleTooltipView(
    createBattlePopoverDeps(),
    context,
    element,
    { name, description, icon, getContent },
    options,
  );
}

function hideBattleTooltip() {
  hideBattleTooltipView();
}

async function handleBattleIdle(context, renderTargets) {
  await handleBattleIdleShuffle(createBattleShuffleFlowDeps(), context, renderTargets);
}

async function handleNoBattleMoves(context, renderTargets) {
  await handleNoBattleMovesShuffle(createBattleShuffleFlowDeps(), context, renderTargets);
}

async function handleManualBattleShuffle(context, renderTargets) {
  await handleManualBattleShuffleFlow(createBattleShuffleFlowDeps(), context, renderTargets);
}

async function shuffleCurrentBattleBoard(context, renderTargets, durationMs) {
  await shuffleCurrentBattleBoardFlow(createBattleShuffleFlowDeps(), context, renderTargets, durationMs);
}

function areBattleBoardsEqual(firstBoard, secondBoard) {
  return areBattleBoardsEqualShuffle(firstBoard, secondBoard);
}

function createNoMovesBattleShuffle(context) {
  return createNoMovesBattleShuffleFlow(createBattleShuffleFlowDeps(), context);
}

function tickBattleRuntime(context, renderTargets) {
  return tickBattleRuntimeRage(createBattleRageFlowDeps(), context, renderTargets);
}

function markBattleRagePending(context, renderTargets) {
  return markBattleRagePendingRage(createBattleRageFlowDeps(), context, renderTargets);
}

async function runPendingBattleRageIfReady(context, renderTargets) {
  return runPendingBattleRageIfReadyRage(createBattleRageFlowDeps(), context, renderTargets);
}

function isBattleFieldBusyForRage(context) {
  return isBattleFieldBusyForRageRage(createBattleRageFlowDeps(), context);
}

async function runBattleRageAction(context, renderTargets) {
  return runBattleRageActionRage(createBattleRageFlowDeps(), context, renderTargets);
}

function hasActiveBattleResolutionAnimation(context) {
  const boardElement = context.battleRenderTargets?.boardElement;
  if (!boardElement) {
    return false;
  }

  return Boolean(boardElement.querySelector([
    ".is-swapping",
    ".is-shaking",
    ".is-dying",
    ".is-moving",
    ".is-shuffling",
    ".is-board-shuffling",
    ".is-rage-wave",
  ].join(",")));
}

async function animateBattleRageWave(context, boardElement) {
  return animateBattleRageWaveView(createBattleProjectilesDeps(), context, boardElement);
}

async function animateBattleRageProjectiles(context, boardElement, targetIcons = null) {
  return animateBattleRageProjectilesView(createBattleProjectilesDeps(), context, boardElement, targetIcons);
}

async function animateBattleKamikazeSelfDamageBurst(context, amount = 0) {
  return animateBattleKamikazeSelfDamageBurstView(createBattleProjectilesDeps(), context, amount);
}

function animateBattleRageTransformTargetLights(context, boardElement, effects = null) {
  return animateBattleRageTransformTargetLightsView(createBattleProjectilesDeps(), context, boardElement, effects);
}

function stopBattleRageTransformTargetLights(targets) {
  stopBattleRageTransformTargetLightsView(targets);
}

function isBattleUltimateConvertEffect(effect) {
  return isBattleUltimateConvertEffectRage(effect);
}

function isBattleUltimateDamagePlayerByBoardItemsEffect(effect) {
  return isBattleUltimateDamagePlayerByBoardItemsEffectRage(effect);
}

function isBattleUltimateFixedPlayerDamageEffect(effect) {
  return isBattleUltimateFixedPlayerDamageEffectRage(effect);
}

function isBattleUltimateHealingEnemyByBoardItemsEffect(effect) {
  return isBattleUltimateHealingEnemyByBoardItemsEffectRage(effect);
}

function isBattleUltimateRestoreEnemyShieldByBoardItemsEffect(effect) {
  return isBattleUltimateRestoreEnemyShieldByBoardItemsEffectRage(effect);
}

function isBattleUltimateKamikazeEffect(effect) {
  return isBattleUltimateKamikazeEffectRage(effect);
}

function getBattleRageEffectTargetIcons(context, boardElement, effect, transformLights = []) {
  return getBattleRageEffectTargetIconsView(
    createBattleProjectilesDeps(),
    context,
    boardElement,
    effect,
    transformLights,
  );
}

function getCurrentBattleRageConfig(context) {
  return getCurrentBattleRageConfigRage(context);
}

function getCurrentBattleUltimateEffects(context) {
  return getCurrentBattleUltimateEffectsRage(context);
}

function normalizeStringList(value) {
  return normalizeStringListRage(value);
}

function updateBattleRageTimerDisplay(context, enemyStatsElement) {
  updateBattleRageTimerDisplayStats(createBattleStatsViewDeps(), context, enemyStatsElement);
}

function applyBattleRageWarningVisualState(context, enemyStatsElement) {
  applyBattleRageWarningVisualStateStats(createBattleStatsViewDeps(), context, enemyStatsElement);
}
function updateBattleClockCooldownDisplay(context, specialItemsElement) {
  return updateBattleClockCooldownDisplayInventory(createBattleInventoryViewDeps(), context, specialItemsElement);
}

function attachBattlePointerTracker(context, overlay) {
  attachBattlePointerTrackerInventory(createBattleInventoryViewDeps(), context, overlay);
}

function renderActiveBattleSpecialCursor(context) {
  renderActiveBattleSpecialCursorInventory(createBattleInventoryViewDeps(), context);
}

function positionActiveBattleSpecialCursor(context) {
  positionActiveBattleSpecialCursorInventory(context);
}

function removeActiveBattleSpecialCursor(context) {
  removeActiveBattleSpecialCursorInventory(context);
}

function clearActiveBattleSpecial(context) {
  clearActiveBattleSpecialInventory(createBattleInventoryViewDeps(), context);
}

function renderBattleBoard(
  boardElement,
  context,
  statusElement,
  enemyStatsElement,
  playerMetersElement,
  ultimateTextElement,
) {
  renderBattleBoardView(
    createBattleBoardViewDeps(),
    boardElement,
    context,
    statusElement,
    enemyStatsElement,
    playerMetersElement,
    ultimateTextElement,
  );
}

async function handleGoldBoardClick(context, cell, renderTargets) {
  return handleGoldBoardClickAction(createBattleBoardActionsDeps(), context, cell, renderTargets);
}

async function handleSkullBoardClick(context, cell, renderTargets) {
  return handleSkullBoardClickAction(createBattleBoardActionsDeps(), context, cell, renderTargets);
}

async function handleFreeSwapBoardClick(context, cell, renderTargets) {
  return handleFreeSwapBoardClickAction(createBattleBoardActionsDeps(), context, cell, renderTargets);
}

async function handleBatteryBoardClick(context, activation, renderTargets) {
  return handleBatteryBoardClickAction(createBattleBoardActionsDeps(), context, activation, renderTargets);
}

async function handleBattleBoxedCellClick(context, cell, renderTargets) {
  return handleBattleBoxedCellClickAction(createBattleBoardActionsDeps(), context, cell, renderTargets);
}

async function handleBattleVinedCellClick(context, cell, renderTargets) {
  return handleBattleVinedCellClickAction(createBattleBoardActionsDeps(), context, cell, renderTargets);
}

async function handleBattleCellClick(context, cell, renderTargets) {
  if (await guardBattleTutorialCellClick(createBattleTutorialDeps(), context, cell, renderTargets)) {
    return;
  }
  return handleBattleCellClickAction(createBattleBoardActionsDeps(), context, cell, renderTargets);
}

function applyBattleOrdinarySwapTurnDamage(context) {
  return applyBattleOrdinarySwapTurnDamageAction(createBattleBoardActionsDeps(), context);
}
async function resolveBattleCascades(board, context, renderTargets) {
  return resolveBattleCascadesResolution(createBattleResolutionDeps(), board, context, renderTargets);
}

async function animateBattleDeaths(boardElement, board, cells, context) {
  return animateBattleDeathsResolution(createBattleResolutionDeps(), boardElement, board, cells, context);
}

function playBattleItemActivationSounds(context, board, cells) {
  playBattleItemActivationSoundsResolution(createBattleResolutionDeps(), context, board, cells);
}

async function animateBattleBoardMove(boardElement, movement, context) {
  return animateBattleBoardMoveResolution(createBattleResolutionDeps(), boardElement, movement, context);
}

function refillBattleBoardFromReserve(context, beforeGravityBoard) {
  return refillBattleBoardFromReserveResolution(createBattleResolutionDeps(), context, beforeGravityBoard);
}

function formatMoveStatus(context, result, enemyState) {
  return formatMoveStatusFormatter(createBattleFormatterDeps(), context, result, enemyState);
}

function createScaffoldResult(context, outcome) {
  return createScaffoldResultOutcome(createBattleOutcomeFlowDeps(), context, outcome);
}

function closeScaffold(overlay) {
  closeScaffoldOutcome(overlay);
}

function applyBattlePopoverScale(element, scale) {
  applyBattlePopoverScaleView(createBattleScaffoldViewDeps(), element, scale);
}

function setupBattleViewportScale(context, overlay, frame, panel, renderTargets, afterApply) {
  return setupBattleViewportScaleView(
    createBattleScaffoldViewDeps(),
    context,
    overlay,
    frame,
    panel,
    renderTargets,
    afterApply,
  );
}

function getBattleViewportSize() {
  return getBattleViewportSizeView(createBattleScaffoldViewDeps());
}

function getBattleLayoutConfig(context) {
  return getBattleLayoutConfigView(createBattleScaffoldViewDeps(), context);
}

function getBattleRenderedScale(panel) {
  return getBattleRenderedScaleView(panel);
}

function normalizeBattleRenderTargets(context, renderTargets = {}) {
  return normalizeBattleRenderTargetsView(context, renderTargets);
}

function cleanupBattleScaffold(context, overlay) {
  cleanupBattleScaffoldView(createBattleScaffoldViewDeps(), context, overlay);
}

function translate(locale, key) {
  return translateFormatter(locale, key);
}

function translateBattleText(context, textKeyName) {
  return translateBattleTextFormatter(createBattleFormatterDeps(), context, textKeyName);
}

function assertBattleEngine(engine) {
  const requiredMethods = [
    "createBattleBoard",
    "createBattleReserveBoard",
    "createBattleWalls",
    "createBattleBoxes",
    "createBattleVines",
    "cloneBattlePlayerState",
    "hasBattleWallBetween",
    "hasBattleBoxAt",
    "hasBattleVineAt",
    "swapBattleCells",
    "findBattleMatches",
    "findBattleAvailableMove",
    "collectBattleMatchCells",
    "removeBattleMatches",
    "dropBattleBoard",
    "refillBattleBoard",
    "refillBattleBoardFromReserve",
    "getCurrentBattleStage",
    "getBattleItemDefinition",
    "createBattleEnemyState",
    "applyBattleMatchEffects",
    "applyBattlePlayerDamage",
    "applyBattleTurnDamage",
    "applyBattleUltimateEffects",
    "applyBattleKamikazePlayerDamage",
    "applyBattleKamikazeEnemySelfDamage",
    "pickBattleGoldLootItem",
    "getBattlePlayerMaxHealth",
    "getBattleHealHealth",
    "tickBattleRage",
    "createBattleMatchBonuses",
    "placeBattleBonuses",
  ];

  for (const method of requiredMethods) {
    if (typeof engine?.[method] !== "function") {
      throw new Error(`Battle view requires engine.${method}().`);
    }
  }

  return engine;
}

function getItemLabel(context, item, itemId) {
  return getItemLabelPlayerItems(createBattlePlayerItemsDeps(), context, item, itemId);
}

function getItemDescription(context, item, itemId) {
  return getItemDescriptionPlayerItems(createBattlePlayerItemsDeps(), context, item, itemId);
}

function getBattleHandItemIds(context) {
  return getBattleHandItemIdsPlayerItems(createBattlePlayerItemsDeps(), context);
}

function applyBattleBoardLayout(boardElement, context) {
  applyBattleBoardLayoutView(createBattleBoardViewDeps(), boardElement, context);
}

function getBattleSwapDurationMs(context) {
  const animationConfig = getBattleAnimationConfig(context);
  return Math.max(0, Number(animationConfig.swapMoveMs ?? animationConfig.swapMs));
}

function formatBattleSeconds(value) {
  return formatBattleSecondsFormatter(value);
}

function formatBattleNumber(value) {
  return formatBattleNumberFormatter(value);
}

function isBattlePlayerDefeated(context) {
  return Number(context.battleState.playerState?.health?.current || 0) <= 0;
}

function isBattleCellBoxed(context, cell) {
  return context.engine.hasBattleBoxAt(context.battleState.boxes, cell);
}

function isBattleCellVined(context, cell) {
  return context.engine.hasBattleVineAt(context.battleState.vines, cell);
}

async function finishBattleMoveIfNeeded(context, renderTargets) {
  const tutorialProgress = advanceBattleTutorialAfterMove(
    createBattleTutorialDeps(),
    context,
    normalizeBattleRenderTargets(context, renderTargets),
  );
  if (tutorialProgress.advanced) {
    resetBattleIdleTimer(context, context.battleRenderTargets || renderTargets);
    return false;
  }
  if (isBattlePlayerDefeated(context)) {
    showBattleDefeat(context, renderTargets);
    return true;
  }
  if (context.battleState.enemyState.isDefeated) {
    await completeBattleVictory(context, renderTargets);
    return true;
  }
  if (await runPendingBattleRageIfReady(context, normalizeBattleRenderTargets(context, renderTargets))) {
    return Boolean(
      context.battleState.isComplete
      || isBattlePlayerDefeated(context)
      || context.battleState.enemyState.isDefeated
    );
  }
  resetBattleIdleTimer(context, context.battleRenderTargets || renderTargets);
  return false;
}

function prepareBattleAttemptState(context) {
  prepareBattleAttemptStateBase(context);
  prepareBattleTutorialAttemptState(context);
}

function getBattleAreaCells(board, centerCell, radius) {
  const cells = [];
  const height = board.length;
  const width = board[0]?.length || 0;

  for (let row = centerCell.row - radius; row <= centerCell.row + radius; row += 1) {
    for (let col = centerCell.col - radius; col <= centerCell.col + radius; col += 1) {
      if (row >= 0 && row < height && col >= 0 && col < width) {
        cells.push({ row, col });
      }
    }
  }

  return cells;
}

function createBattleTooltipLabel(context, labelTextKey) {
  return createBattleTooltipLabelFormatter(context, labelTextKey);
}

function getInventoryQuantity(playerState, itemId) {
  return getInventoryQuantityPlayerItems(playerState, itemId);
}

function changeInventoryQuantity(playerState, itemId, delta) {
  return changeInventoryQuantityPlayerItems(playerState, itemId, delta);
}

function areAdjacentCells(firstCell, secondCell) {
  return Math.abs(firstCell.row - secondCell.row) + Math.abs(firstCell.col - secondCell.col) === 1;
}

function isSameCell(firstCell, secondCell) {
  return firstCell?.row === secondCell?.row && firstCell?.col === secondCell?.col;
}
