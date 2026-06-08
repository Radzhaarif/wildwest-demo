import { BATTLE_OUTCOMES, createBattleResult } from "./battle-contract.js";
import {
  animateBattleBoardShuffleMovement,
  animateBattleBoxBlockedClick,
  animateBattleShakeCells,
  animateBattleSwap,
  animateBattleVineBlockedClick,
  animateBattleWallBlockedSwap,
  getBattleCellIconElement,
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
} from "./battle-runtime.js?v=2026-06-08-clock-pause";
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
} from "./battle-inventory-view.js?v=2026-06-08-clock-pause";
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
  getCurrentBattleStageIndex,
  prepareBattleAttemptState,
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

export function createBattleView(options = {}) {
  const engine = assertBattleEngine(options.engine);

  return {
    root: options.root || null,
    start(context) {
      ensureBattleContext(context);
      exposeLegacyBattleContext(context);
      context.engine = engine;
      context.callbacks = options.callbacks || {};
      return showBattleScaffold(context, options.root || document.body);
    },
  };
}

function exposeLegacyBattleContext(context) {
  if (typeof window !== "undefined" && context) {
    window.context = context;
    window.contex = context;
  }
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
  return {
    getBattleUiConfig,
  };
}

function createBattlePlayerItemsDeps() {
  return {
    DEFAULT_HAND_ITEM_IDS,
    getBattleUiConfig,
    translate,
  };
}

function createBattleScaffoldViewDeps() {
  return {
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
    closeBattleMiniMenu,
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
  };
}

function createBattleBoardViewDeps() {
  return {
    GOLD_ITEM_ID,
    updateBattleShuffleButtonState,
    getBattleBoardConfig,
    getBattleUiConfig,
    isSameCell,
    isBattleCellBoxed,
    isBattleCellVined,
    getItemLabel,
    resolveAssetPath,
    handleBattleCellClick,
    isBattleLifecycleActive,
    isBattleAttemptActive,
    renderBattleStats,
  };
}

function createBattlePopoverDeps() {
  return {
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
  };
}

function createBattleFeedbackDeps() {
  return {
    getBattleHealthChangeAnimation,
    triggerBattleLightDamageProjectiles,
  };
}

function createBattleProjectilesDeps() {
  return {
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
    isBattleUltimateHealingEnemyByBoardItemsEffect,
    isBattleUltimateRestoreEnemyShieldByBoardItemsEffect,
    isBattleUltimateKamikazeEffect,
    normalizeStringList,
    isBattleCellBoxed,
  };
}

function createBattleRageFlowDeps() {
  return {
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
    wait,
    isBattlePlayerDefeated,
    showBattleDefeat,
    resolveBattleCascades,
    formatMoveStatus,
    finishBattleMoveIfNeeded,
  };
}

function createBattleStatsViewDeps() {
  return {
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
    getClockWarningSeconds,
    getClockWarningChangeMs,
    getClockWarningChangeScale,
  };
}

function createBattleInventoryViewDeps() {
  return {
    ACTIVE_BATTLE_ITEM_IDS,
    BAG_ITEM_ID,
    CLOCK_ITEM_ID,
    GOLD_ITEM_ID,
    LITTLE_MENU_ITEM_ID,
    SPECIAL_ITEM_IDS,
    attachBattleInventoryTooltip,
    changeInventoryQuantity,
    clearBattleGoldTargetPreview,
    getBattleHandItemIds,
    getBattleRenderedScale,
    getBattleUiConfig,
    getInventoryQuantity,
    getItemDescription,
    getItemLabel,
    renderBattleBoard,
    resetBattleIdleTimer,
    resolveAssetPath,
    setBattleStatus,
    toggleBattleInventory,
    toggleBattleMiniMenu,
    translate,
  };
}

function createBattleShuffleFlowDeps() {
  return {
    animateBattleBoardShuffleMovement,
    animateBattleShakeCells,
    clearActiveBattleSpecial,
    clearBattleBoardMessage,
    createBattleReserveBoardForCurrentStage,
    finishBattleMoveIfNeeded,
    getBattleAnimationConfig,
    getBattlePlayerHealthSourceElements,
    getBattleUiConfig,
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
  };
}

function createBattleOutcomeFlowDeps() {
  return {
    BATTLE_OUTCOMES,
    cancelBattleAttempt,
    cancelBattleLifecycle,
    cleanupBattleScaffold,
    clearActiveBattleSpecial,
    clearBattleBoardMessage,
    createBattleResult,
    getBattleAnimationConfig,
    getBattleUiConfig,
    normalizeBattleRenderTargets,
    pauseBattleRuntime,
    prepareBattleAttemptState,
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
    wait,
  };
}

function createBattleResolutionDeps() {
  return {
    MAX_CASCADE_STEPS,
    shouldContinueBattle,
    wait,
    getBattleAnimationConfig,
    getBattleGenerationConfig,
    getCurrentBattleStageIndex,
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
  };
}

function createBattleBoardActionsDeps() {
  return {
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
    clearBattleGoldTargetPreview,
    getBattleGoldPrice,
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
  };
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

function attachBattleLanguageChangeListener(context, renderTargets) {
  if (typeof context.callbacks?.onLanguageChange !== "function") {
    return;
  }

  context.unsubscribeLanguageChange = context.callbacks.onLanguageChange(({ language, locale }) => {
    if (!shouldContinueBattle(context, renderTargets)) {
      return;
    }
    context.request.language = language;
    context.request.locale = locale;
    refreshBattleLanguage(context, renderTargets);
  });
}

function refreshBattleLanguage(context, renderTargets) {
  const {
    title,
    surrenderButton,
    settingsButton,
    logButton,
    menuButton,
    shuffleButton,
    status,
    enemyStats,
    playerMeters,
    ultimateText,
    specialItems,
    handItems,
    logOverlay,
  } = renderTargets;

  title.textContent = translate(context.request.locale, context.battleData.enemyConfig?.nameTextKey)
    || context.request.enemyId;
  updateBattleTopActionButtonLabel(context, surrenderButton, "surrender");
  updateBattleTopActionButtonLabel(context, settingsButton, "settings");
  updateBattleTopActionButtonLabel(context, logButton, "log");
  updateBattleHeaderMenuButton(context, renderTargets);
  updateBattleShuffleButtonLanguage(context, shuffleButton);
  status.textContent = translateBattleText(context, "selectFirstCell");
  renderBattleStats(enemyStats, playerMeters, ultimateText, context);
  renderBattleInventory(specialItems, handItems, context, renderTargets);
  refreshBattleLogOverlayLanguage(logOverlay, context);
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
  if (!button) {
    return;
  }

  const config = getBattleTopButtonConfig(context, actionId);
  const label = translate(context.request.locale, config.textKey);
  const labelElement = button.querySelector(".battle-top-button-label");
  if (labelElement) {
    labelElement.textContent = label;
  }
  button.setAttribute("aria-label", label);
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

function getBattlePotentialPlayerHealthRecovery(context, beforePlayerState, healAmount) {
  const healthPerTrigger = Number(
    context?.engine?.getBattleHealHealth(context?.battleState?.playerState, context?.request?.itemCatalog),
  );
  const rawHealAmount = Number(healAmount);
  const healState = beforePlayerState?.heal || {};
  const maxHeal = Number(healState.max);
  const beforeHeal = Number(healState.current) || 0;

  if (
    !Number.isFinite(healthPerTrigger)
    || healthPerTrigger <= 0
    || !Number.isFinite(rawHealAmount)
    || rawHealAmount <= 0
    || !Number.isFinite(maxHeal)
    || maxHeal <= 0
  ) {
    return 0;
  }

  const triggerCount = Math.floor((beforeHeal + rawHealAmount) / maxHeal);
  return triggerCount * healthPerTrigger;
}

function getBattleNumericValue(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function collectBattleCellSourceStats(context, board, playerState, matches) {
  const matchCells = context.engine?.collectBattleMatchCells(Array.isArray(matches) ? matches : []);
  const sourceCellsByModifier = {
    "enemy-health": [],
    "player-heal": [],
    "enemy-aggression": [],
  };
  const modifiersByItemId = new Map();

  const inventory = Array.isArray(playerState?.inventory) ? playerState.inventory : [];
  for (const inventoryEntry of inventory) {
    const entryQuantity = Math.max(0, getBattleNumericValue(inventoryEntry?.quantity));
    if (entryQuantity <= 0) {
      continue;
    }

    const modifierSourceItem = context.engine.getBattleItemDefinition(
      context.request.itemCatalog,
      inventoryEntry?.itemId,
    );
    if (!Array.isArray(modifierSourceItem?.modificate)) {
      continue;
    }

    for (const modifier of modifierSourceItem.modificate) {
      const targetItemId = modifier?.itemId;
      if (!targetItemId) {
        continue;
      }

      const existing = modifiersByItemId.get(targetItemId) || {
        damage: 0,
        heal: 0,
        aggression: 0,
        calm: 0,
      };
      existing.damage += getBattleNumericValue(modifier?.damage) * entryQuantity;
      existing.heal += getBattleNumericValue(modifier?.heal) * entryQuantity;
      existing.aggression += getBattleNumericValue(modifier?.aggression) * entryQuantity;
      existing.calm += getBattleNumericValue(modifier?.calm) * entryQuantity;
      modifiersByItemId.set(targetItemId, existing);
    }
  }

  const resolveItemStats = (itemId) => {
    const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
    const baseStats = {
      damage: getBattleNumericValue(item?.damage),
      heal: getBattleNumericValue(item?.heal),
      aggression: getBattleNumericValue(item?.aggression),
      calm: getBattleNumericValue(item?.calm),
    };
    const itemModifiers = modifiersByItemId.get(itemId) || {};
    return {
      damage: baseStats.damage + getBattleNumericValue(itemModifiers.damage),
      heal: baseStats.heal + getBattleNumericValue(itemModifiers.heal),
      aggression: baseStats.aggression + getBattleNumericValue(itemModifiers.aggression),
      calm: baseStats.calm + getBattleNumericValue(itemModifiers.calm),
    };
  };

  for (const cell of matchCells) {
    const itemId = board?.[cell.row]?.[cell.col];
    const itemStats = resolveItemStats(itemId);

    if (itemStats.damage > 0) {
      sourceCellsByModifier["enemy-health"].push(cell);
    }
    if (itemStats.heal > 0) {
      sourceCellsByModifier["player-heal"].push(cell);
    }
    if (itemStats.aggression !== 0 || itemStats.calm !== 0) {
      sourceCellsByModifier["enemy-aggression"].push(cell);
    }
  }

  return sourceCellsByModifier;
}

function getBoardElementsForSourceCells(context, sourceCells) {
  if (!Array.isArray(sourceCells) || sourceCells.length === 0) {
    return [];
  }
  const boardElement = context?.battleRenderTargets?.boardElement;
  if (!boardElement) {
    return [];
  }
  return sourceCells
    .map((cell) => getBattleCellIconElement(boardElement, cell))
    .filter((element) => Boolean(element));
}

function setBattleHealthFeedbackSuppression(context, statId, options = {}) {
  setBattleHealthFeedbackSuppressionView(context, statId, options);
}

function setMatchFeedbackForBattleChange(context, beforeEnemyState, afterEnemyState, beforePlayerState, afterPlayerState, effectSummary, board, matches) {
  const enemyDamage = Number(effectSummary?.damage || 0);
  const playerDamage = Number(effectSummary?.playerDamage || 0);
  const healAdded = Number(effectSummary?.heal || 0);
  const aggressionDelta = Number(effectSummary?.aggression || 0) - Number(effectSummary?.calm || 0);
  const playerHealthRecovery = getBattlePotentialPlayerHealthRecovery(context, beforePlayerState, healAdded);
  const playerHealthSourceElements = getBattlePlayerHealthSourceElements(context);
  const sourceCellsByModifier = collectBattleCellSourceStats(context, board, context?.battleState?.playerState, matches);
  const sourceElementsByModifier = {
    "enemy-health": getBoardElementsForSourceCells(
      context,
      Array.isArray(effectSummary?.damageSourceCells) && effectSummary.damageSourceCells.length > 0
        ? effectSummary.damageSourceCells
        : sourceCellsByModifier["enemy-health"],
    ),
    "player-heal": getBoardElementsForSourceCells(context, sourceCellsByModifier["player-heal"]),
    "enemy-aggression": getBoardElementsForSourceCells(context, sourceCellsByModifier["enemy-aggression"]),
  };

  if (enemyDamage !== 0) {
    setBattleHealthFeedbackDelta(context, "enemy-health", -enemyDamage, {
      sourceElements: sourceElementsByModifier["enemy-health"],
    });
  }

  if (playerDamage > 0) {
    setBattleHealthFeedbackDelta(context, "player-health", -playerDamage, {
      sourceElements: playerHealthSourceElements,
    });
  } else if (playerHealthRecovery > 0) {
    setBattleHealthFeedbackDelta(context, "player-health", playerHealthRecovery, {
      sourceElements: getBattlePlayerHealSourceElements(context),
      forceDamageProjectiles: true,
    });
  }

  if (healAdded !== 0) {
    setBattleHealthFeedbackDelta(context, "player-heal", healAdded, {
      sourceElements: sourceElementsByModifier["player-heal"],
    });
  }

  if (aggressionDelta !== 0) {
    setBattleHealthFeedbackDelta(context, "enemy-aggression", aggressionDelta, {
      sourceElements: sourceElementsByModifier["enemy-aggression"],
    });
  }

  const beforeHeal = Number(beforePlayerState?.heal?.current || 0);
  const afterHeal = Number(afterPlayerState?.heal?.current || 0);
  if (Number.isFinite(beforeHeal) && Number.isFinite(afterHeal) && afterHeal < beforeHeal) {
    setBattleHealthFeedbackSuppression(context, "player-heal", { suppressNegativeDelta: true });
  }

  const beforeAggression = Number(beforeEnemyState?.aggression?.current || 0);
  const afterAggression = Number(afterEnemyState?.aggression?.current || 0);
  if (
    Number.isFinite(beforeAggression)
    && beforeAggression > 0
    && Number.isFinite(afterAggression)
    && afterAggression === 0
    && Number(effectSummary?.aggressionTriggers || 0) > 0
  ) {
    setBattleHealthFeedbackSuppression(context, "enemy-aggression", { suppressNegativeDelta: true });
  }
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

function createEmptyEffectSummary() {
  return {
    activatedCells: 0,
    damage: 0,
    heal: 0,
    aggression: 0,
    calm: 0,
    shieldDamage: 0,
    healthRecovered: 0,
    playerDamage: 0,
    aggressionTriggers: 0,
    stageChanged: false,
    enemyDefeated: false,
    damageSourceCells: [],
    shieldSourceCells: [],
  };
}

function mergeEffectSummary(target, source) {
  target.activatedCells += source.activatedCells;
  target.damage += source.damage;
  target.heal += source.heal;
  target.aggression += source.aggression;
  target.calm += source.calm;
  target.shieldDamage += source.shieldDamage || 0;
  target.healthRecovered += source.healthRecovered;
  target.playerDamage += source.playerDamage || 0;
  target.aggressionTriggers += source.aggressionTriggers || 0;
  target.stageChanged = target.stageChanged || source.stageChanged;
  target.enemyDefeated = target.enemyDefeated || source.enemyDefeated;
  if (Array.isArray(source.damageSourceCells)) {
    target.damageSourceCells.push(...source.damageSourceCells);
  }
  if (Array.isArray(source.shieldSourceCells)) {
    target.shieldSourceCells.push(...source.shieldSourceCells);
  }
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
