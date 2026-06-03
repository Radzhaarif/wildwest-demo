import { BATTLE_OUTCOMES, createBattleResult } from "./battle-contract.js";
import { renderInlineRichText } from "../rich-text.js";

const MAX_CASCADE_STEPS = 30;
const CLOCK_ITEM_ID = "item_time";
const LITTLE_MENU_ITEM_ID = "little_menu";
const SKULL_ITEM_ID = "item_skull";
const SWAP_ITEM_ID = "item_swap";
const DEFAULT_LIGHT_PROJECTILE_ICON = "data/Assets/icons/light_red.png";
const DEFAULT_LIGHT_BLUE_PROJECTILE_ICON = "data/Assets/icons/light_blue.png";
const DEFAULT_LIGHT_GREEN_PROJECTILE_ICON = "data/Assets/icons/light_green.png";
const DEFAULT_LIGHT_GOLD_PROJECTILE_ICON = "data/Assets/icons/light_gold.png";
const DEFAULT_LIGHT_PROJECTILE_COUNT = 5;
const DEFAULT_LIGHT_PROJECTILE_MS = 900;
const DEFAULT_LIGHT_PROJECTILE_ARC_HEIGHT_PX = 70;
const DEFAULT_LIGHT_PROJECTILE_SPREAD_PX = 28;
const DEFAULT_LIGHT_PROJECTILE_SIZE_PX = 52;
const DEFAULT_LIGHT_PROJECTILES_PER_DAMAGE = 0;
const MIN_DAMAGE_PROJECTILES = 1;
const MAX_DAMAGE_PROJECTILES = 12;
const SPECIAL_ITEM_IDS = ["item_skull", "item_swap", "item_time"];
const GOLD_ITEM_ID = "gold";
const DEFAULT_HAND_ITEM_IDS = [
  "item_Shield",
  "item_Bandage",
  "item_granate",
  "item_bullet",
  "item_Knife",
  "red",
  "item_Shield_power",
  "item_Bandage_power",
  "item_granate_power",
  "item_bullet_power",
  "item_Knife_power",
  "green",
];
const DEFAULT_TOP_ACTION_BUTTONS = {
  surrender: {
    textKey: "ui.surrender",
    icon: "data/Assets/icons/surrend.png",
    iconSizePx: 38,
  },
  settings: {
    textKey: "menu.settings",
    icon: "data/Assets/icons/setting.png",
    iconSizePx: 38,
  },
  log: {
    textKey: "ui.eventLog",
    icon: "data/Assets/icons/log.png",
    iconSizePx: 38,
  },
};
const DEFAULT_CLOCK_WARNING_SECONDS = [1, 3, 5, 10, 15, 20, 30];
const DEFAULT_CLOCK_WARNING_CHANGE_MS = 1000;
const DEFAULT_CLOCK_WARNING_CHANGE_SCALE = 1.5;
const ASSET_CACHE_BUSTER = Date.now();
let battleTooltipHideTimeoutId = null;
let battleTooltipShowTimeoutId = null;
const battleCellAnimationState = new WeakMap();
const battleHealthSourceElementKeys = new WeakMap();
let battleHealthSourceElementKeyCounter = 0;

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

function showBattleScaffold(context, root) {
  return new Promise((resolve) => {
    ensureBattleStateShape(context);
    const lifecycleToken = startBattleLifecycle(context);
    context.battleLog = [];
    prepareBattleAttemptState(context);
    const attemptToken = startBattleAttemptLifecycle(context);

    const overlay = document.createElement("section");
    overlay.className = "battle-scaffold-overlay";
    overlay.setAttribute("aria-label", "Battle test scaffold");

  const topActions = document.createElement("div");
  topActions.className = "battle-top-actions";

  const surrenderButton = createBattleTopActionButton(context, "surrender");
  const settingsButton = createBattleTopActionButton(context, "settings");
  const logButton = createBattleTopActionButton(context, "log", "battle-log-button");

  const surrenderConfig = getBattleTopButtonConfig(context, "surrender");
  const settingsConfig = getBattleTopButtonConfig(context, "settings");
  const logConfig = getBattleTopButtonConfig(context, "log");

  attachBattleTooltip(context, surrenderButton, {
    getContent: () => ({
      name: translate(context.request.locale, surrenderConfig.textKey),
      description: translate(context.request.locale, surrenderConfig.textKey),
      icon: surrenderConfig.icon,
    }),
  });
  attachBattleTooltip(context, settingsButton, {
    getContent: () => ({
      name: translate(context.request.locale, settingsConfig.textKey),
      description: translate(context.request.locale, settingsConfig.textKey),
      icon: settingsConfig.icon,
    }),
  });
  attachBattleTooltip(context, logButton, {
    getContent: () => ({
      name: translate(context.request.locale, logConfig.textKey),
      description: translate(context.request.locale, logConfig.textKey),
      icon: logConfig.icon,
    }),
  });
    topActions.append(surrenderButton, settingsButton, logButton);

    const logOverlay = createBattleLogOverlay(context);

    const panel = document.createElement("div");
    panel.className = "battle-scaffold-panel";
    panel.style.backgroundImage = `url("${resolveAssetPath(getBattleUiConfig(context).backgrounds.battleWindow)}")`;

    const fxLayer = document.createElement("div");
    fxLayer.className = "battle-scaffold-fx-layer";

    const battleUiConfig = getBattleUiConfig(context);
    const layout = document.createElement("div");
    layout.className = "battle-scaffold-layout";

    const leftColumn = document.createElement("div");
    leftColumn.className = "battle-scaffold-left";

    const rightColumn = document.createElement("aside");
    rightColumn.className = "battle-scaffold-right";

    const boardElement = document.createElement("div");
    boardElement.className = "battle-scaffold-board";
    boardElement.setAttribute("role", "grid");
    boardElement.setAttribute("aria-label", "Match-3 board");
    applyBattleBoardLayout(boardElement, context);

    const playerPanel = document.createElement("div");
    playerPanel.className = "battle-scaffold-player-panel";

    const specialItems = document.createElement("div");
    specialItems.className = "battle-scaffold-special-items";

    const playerMeters = document.createElement("div");
    playerMeters.className = "battle-scaffold-player-meters";

    const handItems = document.createElement("div");
    handItems.className = "battle-scaffold-hand-items";
    handItems.className = "battle-scaffold-hand-items battle-scaffold-hand-items-hidden";

    const enemyVisual = createEnemyVisual(context);

    const enemyHeader = document.createElement("div");
    enemyHeader.className = "battle-scaffold-enemy-header";

    const enemyInfo = document.createElement("div");
    enemyInfo.className = "battle-scaffold-enemy-info";

    const title = document.createElement("h2");
    title.textContent = translate(context.request.locale, context.battleData.enemyConfig?.nameTextKey)
      || context.request.enemyId;

    const enemyStats = document.createElement("div");
    enemyStats.className = "battle-scaffold-stats";

    const enemyStage = document.createElement("div");
    enemyStage.className = "battle-scaffold-enemy-stage";

    const enemyHeaderValues = document.createElement("div");
    enemyHeaderValues.className = "battle-scaffold-enemy-header-values";

    const ultimateText = document.createElement("p");
    ultimateText.className = "battle-scaffold-ultimate";

    const shuffleButtonConfig = battleUiConfig.shuffleButton || {};
    const shuffleTextKey = shuffleButtonConfig.textKey || getBattleUiConfig(context).textKeys.shuffleBoard;
    const shuffleIconPath = shuffleButtonConfig.icon
      || battleUiConfig.shuffleIcon
      || getBattleUiConfig(context).shuffleIcon
      || "data/Assets/icons/mix.png";
    const shuffleButtonSize = shuffleButtonConfig.iconSizePx;
    const shuffleButton = document.createElement("button");
    shuffleButton.type = "button";
    shuffleButton.className = "battle-scaffold-shuffle-button";
    shuffleButton.setAttribute("aria-label", translate(context.request.locale, shuffleTextKey));
    const shuffleIcon = document.createElement("img");
    shuffleIcon.className = "battle-scaffold-shuffle-icon";
    shuffleIcon.src = resolveAssetPath(shuffleIconPath);
    shuffleIcon.alt = "";
    shuffleIcon.loading = "lazy";
    const shuffleIconSize = Number(
      Number.isFinite(Number(shuffleButtonSize)) ? Number(shuffleButtonSize) : 64,
    );
    shuffleButton.style.setProperty("--battle-shuffle-size", `${shuffleIconSize}px`);
    shuffleButton.append(shuffleIcon);

    const status = document.createElement("p");
    status.className = "battle-scaffold-status";
    setBattleStatus(context, status, translateBattleText(context, "selectFirstCell"));

    leftColumn.append(boardElement, playerMeters, playerPanel, specialItems);

    const leftBottom = document.createElement("div");
    leftBottom.className = "battle-scaffold-left-bottom";
    const enemyHeaderTitle = document.createElement("div");
    enemyHeaderTitle.className = "battle-scaffold-enemy-title";
    enemyHeaderTitle.append(title, enemyStage);

    enemyHeader.append(enemyHeaderTitle, enemyHeaderValues);
    enemyInfo.append(enemyStats, ultimateText);
    rightColumn.append(enemyHeader, enemyVisual, enemyInfo);
    leftBottom.append(shuffleButton);
    layout.append(leftColumn, rightColumn, leftBottom);
    panel.append(layout);
    overlay.append(topActions, panel, logOverlay, fxLayer);
    root.append(overlay);

    const alignBattleSideWidgetsToBoardRightEdge = () => {
      const boardRect = boardElement.getBoundingClientRect();
      const leftColumnRect = leftColumn.getBoundingClientRect();
      const buttonRect = shuffleButton.getBoundingClientRect();
      if (!Number.isFinite(boardRect.width) || !Number.isFinite(buttonRect.width) || !Number.isFinite(leftColumnRect.left)) {
        return;
      }
      const offset = Math.max(0, boardRect.right - leftColumnRect.left - buttonRect.width + 200);
      leftBottom.style.setProperty("--battle-shuffle-container-left-offset", `${offset}px`);
      const specialItemsOffset = boardRect.left - leftColumnRect.left - 125;
      specialItems.style.setProperty("--battle-special-items-left-offset", `${specialItemsOffset}px`);
    };

    const renderTargets = {
      boardElement,
      specialItems,
      handItems,
      enemyVisual,
      enemyStage,
      enemyHeaderValues,
      enemyStats,
      playerMeters,
      ultimateText,
      status,
      title,
      surrenderButton,
      settingsButton,
      logButton,
      shuffleButton,
      logOverlay,
      battleFxLayer: fxLayer,
      overlay,
      resolve,
      lifecycleToken,
      attemptToken,
    };
    context.battleRenderTargets = renderTargets;
    attachBattlePointerTracker(context, overlay);
    attachBattleLanguageChangeListener(context, renderTargets);

    renderBattleStats(enemyStats, playerMeters, ultimateText, context);
    renderBattleInventory(specialItems, handItems, context, renderTargets);
    renderBattleBoard(boardElement, context, status, enemyStats, playerMeters, ultimateText);
    startBattleRuntime(context, renderTargets);
    requestAnimationFrame(alignBattleSideWidgetsToBoardRightEdge);

    logButton.addEventListener("click", () => {
      renderBattleLog(logOverlay, context);
      logOverlay.classList.remove("hidden");
    });

    settingsButton.addEventListener("click", () => {
      openBattleSettings(context, renderTargets);
    });

    surrenderButton.addEventListener("click", () => {
      openBattleSurrender(context, renderTargets);
    });

    shuffleButton.addEventListener("click", () => {
      handleManualBattleShuffle(context, renderTargets);
    });
  });
}

function createBattleLogOverlay(context) {
  const overlay = document.createElement("section");
  overlay.className = "battle-log-overlay hidden";

  const modal = document.createElement("div");
  modal.className = "event-log-modal battle-log-modal";

  const title = document.createElement("h2");
  title.textContent = translate(context.request.locale, "ui.eventLog");

  const list = document.createElement("ol");

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.textContent = translate(context.request.locale, "ui.back");
  backButton.addEventListener("click", () => {
    overlay.classList.add("hidden");
  });

  modal.append(title, list, backButton);
  overlay.append(modal);
  return overlay;
}

function renderBattleLog(logOverlay, context) {
  const list = logOverlay.querySelector("ol");
  if (!list) {
    return;
  }

  list.replaceChildren(...context.battleLog.map((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    return item;
  }));
}

function addBattleLog(context, message) {
  if (!message) {
    return;
  }

  context.battleLog.unshift(message);
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
  updateBattleShuffleButtonLanguage(context, shuffleButton);
  status.textContent = translateBattleText(context, "selectFirstCell");
  renderBattleStats(enemyStats, playerMeters, ultimateText, context);
  renderBattleInventory(specialItems, handItems, context, renderTargets);
  refreshBattleLogOverlayLanguage(logOverlay, context);
}

function updateBattleShuffleButtonLanguage(context, button) {
  if (!button) {
    return;
  }

  const label = translate(
    context.request.locale,
    getBattleUiConfig(context).shuffleButton.textKey || getBattleUiConfig(context).textKeys.shuffleBoard,
  );
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

function updateBattleShuffleButtonState(context) {
  const button = context.battleRenderTargets?.shuffleButton;
  if (!button) {
    return;
  }

  button.disabled = Boolean(context.battleState.isResolving || context.battleState.isComplete);
}

function createBattleTopActionButton(context, actionId, additionalClassName = "") {
  const config = getBattleTopButtonConfig(context, actionId);
  const label = translate(context.request.locale, config.textKey);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `battle-top-button${additionalClassName ? ` ${additionalClassName}` : ""}`;
  button.setAttribute("aria-label", label);
  button.style.setProperty("--battle-top-button-icon-size", `${config.iconSizePx}px`);

  if (config.icon) {
    const icon = document.createElement("img");
    icon.className = "battle-top-button-icon";
    icon.src = resolveAssetPath(config.icon);
    icon.alt = "";
    icon.loading = "lazy";
    button.append(icon);
  }

  const labelElement = document.createElement("span");
  labelElement.className = "battle-top-button-label";
  labelElement.textContent = label;
  button.append(labelElement);
  button.setAttribute("aria-label", label);
  return button;
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

function getBattleTopButtonConfig(context, actionId) {
  const topButtons = getBattleUiConfig(context).topButtons || {};
  const fallback = DEFAULT_TOP_ACTION_BUTTONS[actionId] || {};
  const source = topButtons[actionId] || {};
  return {
    textKey: source.textKey || fallback.textKey || actionId,
    icon: source.icon || fallback.icon || "",
    iconSizePx: getBattleTopButtonIconSize(source.iconSizePx, fallback.iconSizePx || 38),
  };
}

function getBattleTopButtonIconSize(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function refreshBattleLogOverlayLanguage(logOverlay, context) {
  if (!logOverlay) {
    return;
  }
  const title = logOverlay.querySelector("h2");
  const backButton = logOverlay.querySelector("button");
  if (title) {
    title.textContent = translate(context.request.locale, "ui.eventLog");
  }
  if (backButton) {
    backButton.textContent = translate(context.request.locale, "ui.back");
  }
}

function setBattleStatus(context, statusElement, message) {
  statusElement.textContent = message;
  addBattleLog(context, message);
}

function openBattleSettings(context, renderTargets) {
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  pauseBattleRuntime(context);
  const settingsOverlay = context.callbacks?.onOpenSettings?.() || document.querySelector("#settingsOverlay");

  if (!settingsOverlay) {
    if (shouldContinueBattle(context, renderTargets)) {
      resumeBattleRuntime(context, renderTargets);
    }
    return;
  }

  const observer = new MutationObserver(() => {
    if (settingsOverlay.classList.contains("hidden")) {
      observer.disconnect();
      if (shouldContinueBattle(context, renderTargets)) {
        resumeBattleRuntime(context, renderTargets);
      }
    }
  });
  observer.observe(settingsOverlay, { attributes: true, attributeFilter: ["class"] });
}

function openBattleSurrender(context, renderTargets) {
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  pauseBattleRuntime(context);
  const callbacks = {
    onConfirm: () => {
      finishBattle(context, renderTargets, BATTLE_OUTCOMES.cancelled);
    },
    onCancel: () => {
      resumeBattleRuntime(context, renderTargets);
    },
  };

  if (typeof context.callbacks?.onSurrender === "function") {
    context.callbacks.onSurrender(callbacks);
  } else {
    finishBattle(context, renderTargets, BATTLE_OUTCOMES.cancelled);
  }
}

async function completeBattleVictory(context, renderTargets) {
  if (context.battleState.isComplete || !shouldContinueBattle(context, renderTargets)) {
    return;
  }

  context.battleState.isComplete = true;
  pauseBattleRuntime(context);
  await showBattleOutcomeBanner(
    renderTargets.overlay,
    translate(context.request.locale, getBattleUiConfig(context).textKeys.victoryTitle),
    getBattleAnimationConfig(context).outcomeBannerMs,
  );
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  finishBattle(context, renderTargets, BATTLE_OUTCOMES.victory);
}

function showBattleDefeat(context, renderTargets) {
  const activeRenderTargets = normalizeBattleRenderTargets(context, renderTargets);
  if (context.battleState.isComplete || !shouldContinueBattle(context, activeRenderTargets)) {
    return;
  }

  context.battleState.isComplete = true;
  pauseBattleRuntime(context);
  const uiConfig = getBattleUiConfig(context);
  const banner = createBattleOutcomeElement(
    translate(context.request.locale, uiConfig.textKeys.defeatTitle),
  );
  banner.classList.add("is-defeat");

  const actions = document.createElement("div");
  actions.className = "battle-outcome-actions";

  const surrenderButton = document.createElement("button");
  surrenderButton.type = "button";
  surrenderButton.textContent = translate(context.request.locale, "ui.surrender");
  surrenderButton.addEventListener("click", () => openBattleSurrender(context, activeRenderTargets));

  const restartButton = document.createElement("button");
  restartButton.type = "button";
  restartButton.textContent = translate(context.request.locale, uiConfig.textKeys.restartBattle);
  restartButton.addEventListener("click", () => {
    restartCurrentBattle(context, activeRenderTargets, banner);
  });

  actions.append(surrenderButton, restartButton);
  banner.append(actions);
  activeRenderTargets.overlay.append(banner);
}

function restartCurrentBattle(context, renderTargets, banner) {
  let activeRenderTargets = normalizeBattleRenderTargets(context, renderTargets);
  if (!shouldContinueBattle(context, activeRenderTargets)) {
    return;
  }

  stopBattleRuntime(context);
  cancelBattleAttempt(context);
  activeRenderTargets = normalizeBattleRenderTargets(context, activeRenderTargets);
  activeRenderTargets.attemptToken = startBattleAttemptLifecycle(context);
  context.battleRenderTargets = activeRenderTargets;
  banner?.remove();
  clearBattleBoardMessage(activeRenderTargets.boardElement);
  clearActiveBattleSpecial(context);
  context.battleLog = [];
  context.battleState.playerState = context.engine.cloneBattlePlayerState(
    context.battleState.initialPlayerState || context.request.playerState,
  );
  context.battleState.enemyState = context.engine.createBattleEnemyState(context.battleData.enemyConfig);
  context.battleState.selectedCell = null;
  context.battleState.activeSpecialItemId = null;
  context.battleState.specialSwapCell = null;
  context.battleState.noMovesMessageVisible = false;
  context.battleState.ragePausedUntil = 0;
  context.battleState.pendingRageAction = false;
  context.battleState.isResolving = false;
  context.battleState.isRageResolving = false;
  context.battleState.isComplete = false;
  context.battleState.lastMoveSummary = null;
  prepareBattleAttemptState(context);
  setBattleStatus(context, activeRenderTargets.status, translateBattleText(context, "selectFirstCell"));
  renderBattleStats(
    activeRenderTargets.enemyStats,
    activeRenderTargets.playerMeters,
    activeRenderTargets.ultimateText,
    context,
  );
  renderBattleInventory(
    activeRenderTargets.specialItems,
    activeRenderTargets.handItems,
    context,
    activeRenderTargets,
  );
  renderBattleBoard(
    activeRenderTargets.boardElement,
    context,
    activeRenderTargets.status,
    activeRenderTargets.enemyStats,
    activeRenderTargets.playerMeters,
    activeRenderTargets.ultimateText,
  );
  startBattleRuntime(context, activeRenderTargets);
}

async function showBattleOutcomeBanner(overlay, title, durationMs) {
  const banner = createBattleOutcomeElement(title);
  overlay.append(banner);
  await wait(durationMs);
  banner.remove();
}

function createBattleOutcomeElement(title) {
  const banner = document.createElement("div");
  banner.className = "battle-outcome-banner";

  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  banner.append(titleElement);
  return banner;
}

function finishBattle(context, renderTargets, outcome) {
  if (!shouldContinueBattle(context, renderTargets) || context.battleLifecycle?.isFinishing) {
    return;
  }
  context.battleLifecycle.isFinishing = true;
  cancelBattleLifecycle(context);
  stopBattleRuntime(context);
  cleanupBattleScaffold(context, renderTargets.overlay);
  closeScaffold(renderTargets.overlay);
  renderTargets.resolve(createScaffoldResult(context, outcome));
}

function createEnemyVisual(context) {
  const visual = document.createElement("div");
  visual.className = "battle-scaffold-enemy-visual";
  visual.style.backgroundImage = `url("${resolveAssetPath(context.request.background)}")`;

  const healthOverlay = document.createElement("div");
  healthOverlay.className = "battle-scaffold-enemy-meter-overlay battle-scaffold-enemy-health-overlay";

  const aggressionOverlay = document.createElement("div");
  aggressionOverlay.className = "battle-scaffold-enemy-meter-overlay battle-scaffold-enemy-aggression-overlay";

  const currentStage = context.engine.getCurrentBattleStage(
    context.battleData.enemyConfig,
    context.battleState.enemyState,
  );
  const enemyImage = document.createElement("img");
  const resolvedAppearance = resolveAssetPath(currentStage?.appearance);
  enemyImage.src = resolvedAppearance;
  enemyImage.dataset.appearance = resolvedAppearance;
  enemyImage.alt = "";
  visual.append(healthOverlay, enemyImage, aggressionOverlay);
  return visual;
}

function renderBattleStats(enemyStatsElement, playerMetersElement, ultimateTextElement, context) {
  const enemyState = context.battleState.enemyState;
  const playerState = context.battleState.playerState;
  const currentStage = context.engine.getCurrentBattleStage(context.battleData.enemyConfig, enemyState);
  const uiConfig = getBattleUiConfig(context);
  const stageNumber = Math.min(enemyState.stageIndex + 1, enemyState.stageCount);
  const playerMaxHealth = context.engine.getBattlePlayerMaxHealth(playerState, context.request.itemCatalog);
  const resolvedAppearance = resolveAssetPath(currentStage?.appearance);
  const enemyHealthFeedback = getBattleHealthChangeFeedback(context, "enemy-health", enemyState.health.current);
  const playerHealthFeedback = getBattleHealthChangeFeedback(context, "player-health", playerState.health?.current ?? 0);
  const enemyAggressionFeedback = getBattleHealthChangeFeedback(context, "enemy-aggression", enemyState.aggression.current);
  const playerHealFeedback = getBattleHealthChangeFeedback(context, "player-heal", playerState.heal?.current ?? 0);
  const textLabels = {
    enemyHealth: createBattleTooltipLabel(context, uiConfig.textKeys.enemyHealth),
    enemyAggression: createBattleTooltipLabel(context, uiConfig.textKeys.enemyAggression),
    enemyDamage: createBattleTooltipLabel(context, uiConfig.textKeys.enemyDamage),
    enemyRage: createBattleTooltipLabel(context, uiConfig.textKeys.enemyRage),
    playerHealth: createBattleTooltipLabel(context, uiConfig.textKeys.playerHealth),
    playerHeal: createBattleTooltipLabel(context, uiConfig.textKeys.playerHeal),
    enemyStage: translate(context.request.locale, uiConfig.textKeys.enemyStage),
  };

  const stageLabel = textLabels.enemyStage;
  const enemyVisual = context.battleRenderTargets?.enemyVisual;
  if (enemyVisual) {
    const enemyImage = enemyVisual.querySelector("img");
    if (enemyImage && enemyImage.dataset.appearance !== resolvedAppearance) {
      enemyImage.dataset.appearance = resolvedAppearance;
      enemyImage.src = resolvedAppearance;
    }
  }

  const stageContainer = context.battleRenderTargets?.enemyStage || enemyStatsElement;
  const stageLine = stageContainer.querySelector(".battle-scaffold-stage-line");
  const stageText = `${stageLabel} ${stageNumber}/${enemyState.stageCount}`;
  if (stageLine) {
    stageLine.textContent = stageText;
  } else {
    stageContainer.replaceChildren(createEnemyStageLine(stageLabel, stageNumber, enemyState.stageCount));
  }

  const enemyHealthContainer = enemyVisual?.querySelector(".battle-scaffold-enemy-health-overlay") || enemyStatsElement;
  const enemyAggressionContainer = enemyVisual?.querySelector(".battle-scaffold-enemy-aggression-overlay") || enemyStatsElement;

  upsertBattleLabeledMeter(context, enemyHealthContainer, {
    label: textLabels.enemyHealth.label,
    description: textLabels.enemyHealth.description,
    icon: uiConfig.icons.enemyHealth,
    current: enemyState.health.current,
    max: enemyState.health.max,
    color: uiConfig.bars.enemyHealthColor,
    modifier: "enemy-health",
    healthFeedback: enemyHealthFeedback,
    shieldOverlay: createEnemyShieldOverlayConfig(context, enemyState),
  });
  upsertBattleLabeledMeter(context, enemyAggressionContainer, {
    label: textLabels.enemyAggression.label,
    description: textLabels.enemyAggression.description,
    icon: uiConfig.icons.enemyAggression,
    current: enemyState.aggression.current,
    max: enemyState.aggression.max,
    color: uiConfig.bars.enemyAggressionColor,
    modifier: "enemy-aggression",
    healthFeedback: enemyAggressionFeedback,
  });

  const enemyValuesContainer = context.battleRenderTargets?.enemyHeaderValues || enemyStatsElement;
  const oldEnemyValueRow = enemyStatsElement.querySelector(".battle-scaffold-value-row");
  if (oldEnemyValueRow && enemyValuesContainer !== enemyStatsElement) {
    oldEnemyValueRow.remove();
  }
  const enemyValueRow = enemyValuesContainer.querySelector(".battle-scaffold-value-row");
  const enemyValues = [
    {
      stat: "enemy-damage",
      label: textLabels.enemyDamage.label,
      description: textLabels.enemyDamage.description,
      icon: uiConfig.icons.enemyDamage,
      value: enemyState.aggression.damage,
    },
    {
      stat: "enemy-rage",
      label: textLabels.enemyRage.label,
      description: textLabels.enemyRage.description,
      icon: uiConfig.icons.enemyRage,
      value: formatBattleSeconds(enemyState.rage.current),
    },
  ];
  if (enemyValueRow) {
    enemyValueRow.replaceChildren(...enemyValues.map((value) => createEnemyValue(context, value)));
  } else {
    enemyValuesContainer.append(createEnemyValuesRow(context, enemyValues));
  }

  applyBattleRageWarningVisualState(context, enemyValuesContainer);

  upsertBattleLabeledMeter(context, playerMetersElement, {
    label: textLabels.playerHealth.label,
    description: textLabels.playerHealth.description,
    icon: uiConfig.icons.playerHealth,
    current: playerState.health?.current ?? 0,
    max: playerMaxHealth,
    color: uiConfig.bars.playerHealthColor,
    modifier: "player-health",
    healthFeedback: playerHealthFeedback,
  });
  upsertBattleLabeledMeter(context, playerMetersElement, {
    label: textLabels.playerHeal.label,
    description: textLabels.playerHeal.description,
    icon: uiConfig.icons.playerHeal,
    current: playerState.heal?.current ?? 0,
    max: playerState.heal?.max ?? 0,
    color: uiConfig.bars.playerHealColor,
    modifier: "player-heal",
    healthFeedback: playerHealFeedback,
  });

  renderInlineRichText(
    ultimateTextElement,
    translate(context.request.locale, currentStage?.ultimate?.descriptionTextKey)
      || currentStage?.ultimate?.descriptionTextKey
      || "",
    {
      itemCatalog: context.request.itemCatalog,
      resolveAssetPath,
      translateTextKey: (key) => translate(context.request.locale, key),
    },
  );
}

function createEnemyStageLine(label, current, max) {
  const line = document.createElement("div");
  line.className = "battle-scaffold-stage-line";
  line.textContent = `${label} ${current}/${max}`;
  return line;
}

function createIconProgressRow(context, { label, description = "", icon, current, max, color, modifier, healthFeedback = null }) {
  return createLabeledIconProgressRow(context, {
    label,
    description,
    icon,
    current,
    max,
    color,
    modifier,
    healthFeedback,
  });
}

function createEnemyShieldOverlayConfig(context, enemyState) {
  const currentShield = Math.max(0, Number(enemyState?.shield?.current || 0));
  if (currentShield <= 0) {
    return null;
  }
  return {
    icon: getBattleUiConfig(context).icons.enemyShield,
    value: currentShield,
  };
}

function createLabeledIconProgressRow(context, {
  label,
  description,
  icon,
  current,
  max,
  color,
  modifier,
  healthFeedback,
  shieldOverlay = null,
}) {
  const meter = document.createElement("div");
  meter.className = `battle-scaffold-meter battle-scaffold-meter-${modifier}`;
  meter.dataset.battleStatId = modifier;
  meter.dataset.battleTooltipName = label;
  meter.dataset.battleTooltipDescription = description;
  meter.dataset.battleTooltipIcon = icon || "";
  meter.dataset.battleTooltipAttached = "1";
  meter.setAttribute("aria-label", label);
  meter.dataset.currentValue = String(current);
  meter.dataset.maxValue = String(max);

  const iconWrapper = document.createElement("span");
  iconWrapper.className = "battle-scaffold-meter-icon";

  const iconElement = document.createElement("img");
  iconElement.className = "battle-scaffold-meter-base-icon";
  iconElement.src = resolveAssetPath(icon);
  iconElement.alt = "";
  iconWrapper.append(iconElement);
  syncBattleShieldOverlay(iconWrapper, shieldOverlay);

  if (healthFeedback) {
    triggerBattleHealthChangeFeedback(
      context,
      iconWrapper,
      healthFeedback.delta,
      modifier,
      healthFeedback.sourceElements,
      healthFeedback,
    );
  }

  const currentElement = document.createElement("strong");
  currentElement.textContent = String(current);
  currentElement.className = "battle-scaffold-meter-current";

  const track = document.createElement("span");
  track.className = "battle-scaffold-meter-track";

  const fill = document.createElement("span");
  fill.className = "battle-scaffold-meter-track-fill";
  fill.style.width = `${max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0}%`;
  fill.style.background = color;
  track.append(fill);

  const maxElement = document.createElement("strong");
  maxElement.textContent = String(max);
  maxElement.className = "battle-scaffold-meter-max";

  attachBattleTooltip(context, meter, {
    name: () => meter.dataset.battleTooltipName || "",
    description: () => meter.dataset.battleTooltipDescription || "",
    icon: () => meter.dataset.battleTooltipIcon || "",
  });

  meter.append(iconWrapper, currentElement, track, maxElement);
  return meter;
}

function upsertBattleLabeledMeter(context, container, props) {
  const existingMeter = container.querySelector(`[data-battle-stat-id="${props.modifier}"]`);
  if (!existingMeter) {
    container.append(createLabeledIconProgressRow(context, props));
    return;
  }
  updateBattleLabeledIconProgressRow(context, existingMeter, props);
}

function updateBattleLabeledIconProgressRow(context, meter, {
  label,
  description,
  icon,
  current,
  max,
  color,
  modifier,
  healthFeedback = null,
  shieldOverlay = null,
}) {
  if (!meter) {
    return;
  }
  const resolvedIcon = resolveAssetPath(icon);
  meter.dataset.battleStatId = modifier;
  meter.dataset.battleTooltipName = label;
  meter.dataset.battleTooltipDescription = description;
  meter.dataset.battleTooltipIcon = icon || "";
  meter.setAttribute("aria-label", label);
  meter.dataset.currentValue = String(current);
  meter.dataset.maxValue = String(max);

  const iconWrapper = meter.querySelector(".battle-scaffold-meter-icon");
  const iconElement = meter.querySelector(".battle-scaffold-meter-base-icon");
  if (iconElement && iconElement.getAttribute("src") !== resolvedIcon) {
    iconElement.src = resolvedIcon;
  }
  if (iconWrapper) {
    syncBattleShieldOverlay(iconWrapper, shieldOverlay);
  }

  const currentElement = meter.querySelector(".battle-scaffold-meter-current");
  if (currentElement) {
    currentElement.textContent = String(current);
  }

  const maxElement = meter.querySelector(".battle-scaffold-meter-max");
  if (maxElement) {
    maxElement.textContent = String(max);
  }

  const trackFill = meter.querySelector(".battle-scaffold-meter-track-fill");
  if (trackFill) {
    trackFill.style.width = `${max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0}%`;
    trackFill.style.background = color;
  }

  if (healthFeedback) {
    const iconWrapperNode = meter.querySelector(".battle-scaffold-meter-icon");
    if (iconWrapperNode) {
      triggerBattleHealthChangeFeedback(
        context,
        iconWrapperNode,
        healthFeedback.delta,
        modifier,
        healthFeedback.sourceElements,
        healthFeedback,
      );
    }
  }

  if (!meter.dataset.battleTooltipAttached) {
    meter.dataset.battleTooltipAttached = "1";
    attachBattleTooltip(context, meter, {
      name: () => meter.dataset.battleTooltipName || "",
      description: () => meter.dataset.battleTooltipDescription || "",
      icon: () => meter.dataset.battleTooltipIcon || "",
    });
  }
}

function syncBattleShieldOverlay(iconWrapper, shieldOverlay) {
  const shieldValue = Math.max(0, Number(shieldOverlay?.value || 0));
  let shieldElement = iconWrapper.querySelector(".battle-scaffold-meter-shield");

  if (shieldValue <= 0) {
    iconWrapper.classList.remove("has-shield");
    shieldElement?.remove();
    return;
  }

  iconWrapper.classList.add("has-shield");
  if (!shieldElement) {
    shieldElement = document.createElement("span");
    shieldElement.className = "battle-scaffold-meter-shield";

    const shieldIcon = document.createElement("img");
    shieldIcon.alt = "";
    shieldIcon.className = "battle-scaffold-meter-shield-icon";

    const shieldCount = document.createElement("strong");
    shieldCount.className = "battle-scaffold-meter-shield-count";

    shieldElement.append(shieldIcon, shieldCount);
    iconWrapper.append(shieldElement);
  }

  const shieldIcon = shieldElement.querySelector(".battle-scaffold-meter-shield-icon");
  const resolvedShieldIcon = resolveAssetPath(shieldOverlay?.icon || "data/Assets/item/Shield.png");
  if (shieldIcon && shieldIcon.getAttribute("src") !== resolvedShieldIcon) {
    shieldIcon.src = resolvedShieldIcon;
  }

  const shieldCount = shieldElement.querySelector(".battle-scaffold-meter-shield-count");
  if (shieldCount) {
    shieldCount.textContent = String(shieldValue);
  }
}

function getBattleHealthChangeFeedback(context, statId, currentValue) {
  const normalizedValue = Number(currentValue) || 0;
  context.battleHealthFeedbackState = context.battleHealthFeedbackState || {};
  const stateEntry = context.battleHealthFeedbackState[statId];
  const previousValue = Number.isFinite(Number(stateEntry?.value)) ? Number(stateEntry.value) : Number(stateEntry);
  const forcedDelta = Number.isFinite(Number(stateEntry?.pendingDelta)) ? Number(stateEntry.pendingDelta) : null;
  context.battleHealthFeedbackState[statId] = {
    value: normalizedValue,
    pendingDelta: 0,
    sourceElements: [],
    forceDamageProjectiles: false,
    forceHealProjectiles: false,
    forceShieldProjectiles: false,
    disableFallbackSource: false,
  };

  const suppression = consumeBattleHealthFeedbackSuppression(context, statId);
  if (suppression?.suppressAll) {
    return null;
  }

  const delta = Number.isFinite(forcedDelta) ? forcedDelta : normalizedValue - previousValue;
  if (!Number.isFinite(previousValue) || !Number.isFinite(delta) || delta === 0) {
    return null;
  }

  if (suppression?.suppressNegativeDelta && delta < 0) {
    return null;
  }

  return {
    delta,
    sourceElements: Array.isArray(stateEntry?.sourceElements) ? stateEntry.sourceElements : [],
    forceDamageProjectiles: Boolean(stateEntry?.forceDamageProjectiles),
    forceHealProjectiles: Boolean(stateEntry?.forceHealProjectiles),
    forceShieldProjectiles: Boolean(stateEntry?.forceShieldProjectiles),
    disableFallbackSource: Boolean(stateEntry?.disableFallbackSource),
  };
}

function setBattleHealthFeedbackDelta(context, statId, delta, options = {}) {
  if (!context?.battleHealthFeedbackState) {
    context.battleHealthFeedbackState = {};
  }
  const stateEntry = context.battleHealthFeedbackState[statId];
  const normalizedDelta = Number(delta) || 0;
  if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) {
    return;
  }

  const currentPending = Number.isFinite(Number(stateEntry?.pendingDelta)) ? Number(stateEntry.pendingDelta) : 0;
  const currentValue = Number.isFinite(Number(stateEntry?.value)) ? Number(stateEntry.value) : 0;
  const mergedSourceElements = mergeBattleHealthSourceElements(
    Array.isArray(stateEntry?.sourceElements) ? stateEntry.sourceElements : [],
    Array.isArray(options?.sourceElements) ? options.sourceElements : [],
  );
  const mergedForceDamageProjectiles = Boolean(
    (stateEntry && stateEntry.forceDamageProjectiles) || options?.forceDamageProjectiles,
  );
  const mergedForceHealProjectiles = Boolean(
    (stateEntry && stateEntry.forceHealProjectiles) || options?.forceHealProjectiles,
  );
  const mergedForceShieldProjectiles = Boolean(
    (stateEntry && stateEntry.forceShieldProjectiles) || options?.forceShieldProjectiles,
  );
  const mergedDisableFallbackSource = Boolean(
    (stateEntry && stateEntry.disableFallbackSource) || options?.disableFallbackSource,
  );
  context.battleHealthFeedbackState[statId] = {
    ...(stateEntry && typeof stateEntry === "object" ? stateEntry : {}),
    pendingDelta: currentPending + normalizedDelta,
    value: currentValue,
    sourceElements: mergedSourceElements,
    forceDamageProjectiles: mergedForceDamageProjectiles,
    forceHealProjectiles: mergedForceHealProjectiles,
    forceShieldProjectiles: mergedForceShieldProjectiles,
    disableFallbackSource: mergedDisableFallbackSource,
  };
}

function mergeBattleHealthSourceElements(existingSourceElements, incomingSourceElements) {
  const getElementKey = (element) => {
    if (!element) {
      return null;
    }
    const elementRow = element.dataset?.row;
    const elementCol = element.dataset?.col;
    if (elementRow != null && elementCol != null) {
      return `${elementRow}:${elementCol}`;
    }
    const existingKey = battleHealthSourceElementKeys.get(element);
    if (existingKey) {
      return existingKey;
    }
    const generatedKey = `health-source-${battleHealthSourceElementKeyCounter += 1}`;
    battleHealthSourceElementKeys.set(element, generatedKey);
    return generatedKey;
  };

  const seen = new Set();
  const mergedElements = [];

  const addElement = (element) => {
    if (!element) {
      return;
    }
    const key = getElementKey(element);
    if (!key) {
      return;
    }

    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    mergedElements.push(element);
  };

  for (const element of existingSourceElements || []) {
    addElement(element);
  }
  for (const element of incomingSourceElements || []) {
    addElement(element);
  }

  return mergedElements;
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
  if (!context?.battleState) {
    return;
  }
  context.battleState.healthFeedbackSuppression = context.battleState.healthFeedbackSuppression || {};
  context.battleState.healthFeedbackSuppression[statId] = {
    ...(context.battleState.healthFeedbackSuppression[statId] || {}),
    ...options,
  };
}

function consumeBattleHealthFeedbackSuppression(context, statId) {
  if (!context?.battleState?.healthFeedbackSuppression) {
    return null;
  }

  const suppression = context.battleState.healthFeedbackSuppression[statId] || null;
  if (suppression) {
    delete context.battleState.healthFeedbackSuppression[statId];
    if (Object.keys(context.battleState.healthFeedbackSuppression).length === 0) {
      context.battleState.healthFeedbackSuppression = {};
    }
  }
  return suppression;
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
  const normalizedDelta = Number(delta) || 0;
  if (!iconWrapper || !Number.isFinite(normalizedDelta) || normalizedDelta === 0) {
    return;
  }
  const resolvedOptions = Array.isArray(options) ? {} : options;

  const lifecycleToken = context?.battleRenderTargets?.lifecycleToken;
  const animationConfig = getBattleHealthChangeAnimation(context, modifier);
  context.battleHealthFeedbackAnimationState = context.battleHealthFeedbackAnimationState || {};
  const feedbackState = context.battleHealthFeedbackAnimationState[modifier] || {
    running: false,
    pending: 0,
    timerId: null,
    delayTimerId: null,
  };
  feedbackState.pending += normalizedDelta;
  context.battleHealthFeedbackAnimationState[modifier] = feedbackState;

  const runAnimation = () => {
    if (!feedbackState.pending) {
      feedbackState.running = false;
      iconWrapper.classList.remove("is-health-changing");
      iconWrapper.classList.remove("is-shield-changing");
      return;
    }

    const currentDelta = feedbackState.pending;
    feedbackState.pending = 0;
    feedbackState.running = true;

    const risePx = Math.max(0, Number(animationConfig.floatRisePx) || 0);
    const riseStart = Math.max(8, Math.min(risePx * 0.35, 80));
    const riseMid = Math.max(24, Math.min(risePx * 0.85, 180));
    const riseEnd = risePx;
    iconWrapper.style.setProperty("--battle-health-change-ms", `${animationConfig.durationMs}ms`);
    iconWrapper.style.setProperty("--battle-health-change-scale", String(animationConfig.scale));
    iconWrapper.style.setProperty("--battle-health-change-float-ms", `${animationConfig.floatMs}ms`);
    iconWrapper.style.setProperty("--battle-health-change-float-rise-start-px", `${riseStart}px`);
    iconWrapper.style.setProperty("--battle-health-change-float-rise-mid-px", `${riseMid}px`);
    iconWrapper.style.setProperty("--battle-health-change-float-rise-end-px", `${riseEnd}px`);

    const oldDeltaElement = iconWrapper.querySelector(".battle-health-change-float");
    if (oldDeltaElement) {
      oldDeltaElement.remove();
    }

    const deltaElement = document.createElement("span");
    deltaElement.className = `battle-health-change-float ${currentDelta > 0 ? "is-positive" : "is-negative"}`;
    if (resolvedOptions.forceShieldProjectiles) {
      deltaElement.classList.add("is-shield");
    }
    deltaElement.textContent = `${currentDelta > 0 ? "+" : ""}${currentDelta}`;
    iconWrapper.append(deltaElement);

    const animationClass = resolvedOptions.forceShieldProjectiles ? "is-shield-changing" : "is-health-changing";
    const animatedElement = resolvedOptions.forceShieldProjectiles
      ? iconWrapper.querySelector(".battle-scaffold-meter-shield")
      : iconWrapper.querySelector(".battle-scaffold-meter-base-icon");

    iconWrapper.classList.remove(animationClass);
    void iconWrapper.offsetWidth;
    iconWrapper.classList.add(animationClass);

    const previousAnimationState = getBattleElementAnimationState(iconWrapper, animationClass);
    const animationToken = (previousAnimationState.token || 0) + 1;
    previousAnimationState.token = animationToken;

    if (previousAnimationState.timerId) {
      window.clearTimeout(previousAnimationState.timerId);
      previousAnimationState.timerId = null;
    }

    const clearAnimation = () => {
      const currentAnimationState = getBattleElementAnimationState(iconWrapper, animationClass);
      if (currentAnimationState.token !== animationToken) {
        return;
      }
      iconWrapper.classList.remove(animationClass);
      if (currentAnimationState.healthEndElement && currentAnimationState.healthEndHandler) {
        currentAnimationState.healthEndElement.removeEventListener("animationend", currentAnimationState.healthEndHandler);
        currentAnimationState.healthEndHandler = null;
        currentAnimationState.healthEndElement = null;
      }
      if (currentAnimationState.timerId) {
        window.clearTimeout(currentAnimationState.timerId);
        currentAnimationState.timerId = null;
      }
      currentAnimationState.token = 0;
      if (!isBattleLifecycleActive(context, context.battleRenderTargets?.lifecycleToken)) {
        feedbackState.running = false;
        feedbackState.pending = 0;
        return;
      }

      feedbackState.running = false;
      if (feedbackState.pending) {
        runAnimation();
      }
    };

    if (previousAnimationState.healthEndElement && previousAnimationState.healthEndHandler) {
      previousAnimationState.healthEndElement.removeEventListener("animationend", previousAnimationState.healthEndHandler);
      previousAnimationState.healthEndHandler = null;
      previousAnimationState.healthEndElement = null;
    }
    const finishHandler = (event) => {
      if (event && animatedElement && event.target !== animatedElement) {
        return;
      }
      clearAnimation();
    };
    if (animatedElement && typeof animatedElement.addEventListener === "function") {
      animatedElement.addEventListener("animationend", finishHandler);
      previousAnimationState.healthEndHandler = finishHandler;
      previousAnimationState.healthEndElement = animatedElement;
    }

    if (feedbackState.timerId) {
      clearTimeout(feedbackState.timerId);
    }
    const clearMs = Math.max(animationConfig.durationMs, animationConfig.floatMs);
    if (clearMs >= 0) {
      feedbackState.timerId = window.setTimeout(() => {
        feedbackState.timerId = null;
        clearAnimation();
      }, clearMs);
      previousAnimationState.timerId = feedbackState.timerId;
    } else {
      clearAnimation();
    }
  };

  const shouldDeferByProjectiles = (() => {
    if (modifier !== "player-health" && modifier !== "enemy-health" && modifier !== "enemy-aggression" && modifier !== "player-heal") {
      return false;
    }
    return true;
  })();
  const deferredProjectilesMs = shouldDeferByProjectiles
    ? triggerBattleLightDamageProjectiles(
      context,
      iconWrapper,
      normalizedDelta,
      modifier,
      sourceElements,
      resolvedOptions,
    )
    : 0;

  const hasProjectileDelay = Number.isFinite(deferredProjectilesMs) && deferredProjectilesMs > 0;
  if (hasProjectileDelay) {
    if (feedbackState.delayTimerId || feedbackState.running) {
      return;
    }
    feedbackState.delayTimerId = window.setTimeout(() => {
      feedbackState.delayTimerId = null;
      if (!isBattleLifecycleActive(context, lifecycleToken)) {
        feedbackState.pending = 0;
        feedbackState.running = false;
        return;
      }
      runAnimation();
    }, deferredProjectilesMs);
    return;
  }

  if (feedbackState.running) {
    return;
  }

  runAnimation();
}

function triggerBattleLightDamageProjectiles(context, iconWrapper, statDelta, modifier, sourceElements = [], options = {}) {
  const normalizedStatDelta = Number(statDelta) || 0;
  const resolvedOptions = Array.isArray(options) ? {} : options;
  const sourceConfig = getBattleStatProjectileConfig(context, modifier, normalizedStatDelta, resolvedOptions);
  if (!sourceConfig?.enabled || !iconWrapper) {
    return 0;
  }
  const rawAmount = Math.abs(normalizedStatDelta);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    return 0;
  }
  const targetIcon = sourceConfig.targetSelector
    ? iconWrapper.querySelector(sourceConfig.targetSelector)
    : iconWrapper.querySelector("img");
  const resolvedSourceElements = Array.isArray(sourceElements)
    ? sourceElements.filter((element) => element && element.isConnected)
    : [];
  const allowFallbackSource = !resolvedOptions.disableFallbackSource;
  if (!targetIcon) {
    return 0;
  }
  const fxLayer = context?.battleRenderTargets?.battleFxLayer;
  if (!fxLayer) {
    return 0;
  }
  const iconPath = resolveAssetPath(sourceConfig.iconPath);

  const animationConfig = getBattleAnimationConfig(context);
  const perDamage = Number(animationConfig.lightDamageProjectilesPerDamage);
  const baseCount = Number(animationConfig.lightDamageProjectileCount);
  let firstImpactMs = Number.POSITIVE_INFINITY;
  const projectileCount = Number.isFinite(perDamage) && perDamage > 0
    ? Math.max(1, Math.round(rawAmount * perDamage))
    : Number.isFinite(baseCount) && baseCount > 0
      ? Math.round(baseCount)
      : DEFAULT_LIGHT_PROJECTILE_COUNT;
  const finalCount = Math.max(
    MIN_DAMAGE_PROJECTILES,
    Math.min(
      MAX_DAMAGE_PROJECTILES,
      Math.round(projectileCount) || MIN_DAMAGE_PROJECTILES,
    ),
  );
  if (!finalCount) {
    return 0;
  }

  const durationMs = Math.max(0, Number(animationConfig.lightDamageProjectileMs || DEFAULT_LIGHT_PROJECTILE_MS));
  const arcHeightPx = Math.max(0, Number(animationConfig.lightDamageProjectileArcHeightPx || DEFAULT_LIGHT_PROJECTILE_ARC_HEIGHT_PX));
  const spreadPx = Math.max(0, Number(animationConfig.lightDamageProjectileSpreadPx || DEFAULT_LIGHT_PROJECTILE_SPREAD_PX));
  const sizePx = Math.max(8, Number(animationConfig.lightDamageProjectileSizePx || DEFAULT_LIGHT_PROJECTILE_SIZE_PX));

  const layerRect = fxLayer.getBoundingClientRect();
  const getSourceRect = (sourceElement) => {
    if (sourceElement) {
      return sourceElement.getBoundingClientRect();
    }
    if (!allowFallbackSource) {
      return null;
    }
    const fallbackSource = getBattleProjectileSourceIcon(context, sourceConfig.sourceSelector);
    return fallbackSource ? fallbackSource.getBoundingClientRect() : null;
  };
  const targetRect = targetIcon.getBoundingClientRect();
  const end = {
    x: targetRect.left + targetRect.width * 0.5 - layerRect.left,
    y: targetRect.top + targetRect.height * 0.5 - layerRect.top,
  };
  const defaultSourceRect = (() => {
    if (!allowFallbackSource) {
      return null;
    }
    const fallbackSource = getBattleProjectileSourceIcon(context, sourceConfig.sourceSelector);
    return fallbackSource ? fallbackSource.getBoundingClientRect() : null;
  })();
  if (!defaultSourceRect && resolvedSourceElements.length === 0) {
    return 0;
  }

  for (let index = 0; index < finalCount; index += 1) {
    const sourceElement = resolvedSourceElements[index % resolvedSourceElements.length]
      || (allowFallbackSource ? getBattleProjectileSourceIcon(context, sourceConfig.sourceSelector) : null);
    const sourceRect = getSourceRect(sourceElement);
    if (!sourceRect) {
      continue;
    }
    const start = {
      x: sourceRect.left + sourceRect.width * 0.5 - layerRect.left,
      y: sourceRect.top + sourceRect.height * 0.5 - layerRect.top,
    };
    const projectile = document.createElement("div");
    projectile.className = "battle-damage-light-projectile";
    projectile.style.left = `${start.x}px`;
    projectile.style.top = `${start.y}px`;
    projectile.style.width = `${sizePx}px`;
    projectile.style.height = `${sizePx}px`;

    const img = document.createElement("img");
    img.src = iconPath;
    img.alt = "";
    img.draggable = false;
    projectile.append(img);
    fxLayer.append(projectile);

    const sideSign = Math.random() < 0.5 ? -1 : 1;
    const sideSpread = spreadPx > 0 ? (Math.random() * 2 - 1) * spreadPx : 0;
    const heightSpread = arcHeightPx > 0
      ? arcHeightPx * (0.75 + Math.random() * 0.45)
      : 0;
    const mid = {
      x: ((start.x + end.x) * 0.5) + sideSpread,
      y: ((start.y + end.y) * 0.5) - sideSign * heightSpread,
    };
    const delayMs = Math.max(0, Math.floor(index * 40));
    const thisDuration = Math.max(250, durationMs + Math.floor((Math.random() * 0.2 - 0.1) * durationMs));
    const thisImpactMs = delayMs + thisDuration;
    if (thisImpactMs < firstImpactMs) {
      firstImpactMs = thisImpactMs;
    }

    const animation = projectile.animate([
      {
        transform: "translate(0px, 0px) scale(0.7)",
        opacity: 0,
      },
      {
        offset: 0.15,
        opacity: 1,
        transform: "translate(0px, 0px) scale(1)",
      },
      {
        offset: 0.72,
        transform: `translate(${mid.x - start.x}px, ${mid.y - start.y}px) scale(1.1)`,
        opacity: 1,
      },
      {
        transform: `translate(${end.x - start.x}px, ${end.y - start.y}px) scale(0.75)`,
        opacity: 0,
      },
    ], {
      duration: thisDuration,
      delay: delayMs,
      easing: "ease-in-out",
      fill: "forwards",
    });

    const cleanupProjectile = () => {
      if (projectile.isConnected) {
        projectile.remove();
      }
    };
    projectile.addEventListener("animationend", cleanupProjectile, { once: true });
    window.setTimeout(cleanupProjectile, thisDuration + delayMs + 50);

    if (animation.playState !== "finished") {
      animation.play();
    }
  }

  return Number.isFinite(firstImpactMs) && firstImpactMs !== Number.POSITIVE_INFINITY
    ? Math.floor(firstImpactMs)
    : 0;
}

function getBattleProjectileSourceIcon(context, selector) {
  if (!context?.battleRenderTargets) {
    return null;
  }
  const searchRoots = [
    context.battleRenderTargets.enemyVisual,
    context.battleRenderTargets.enemyStats,
    context.battleRenderTargets.playerMeters,
    context.battleRenderTargets.overlay,
  ].filter(Boolean);

  for (const root of searchRoots) {
    if (!root) {
      continue;
    }
    const found = root.querySelector(selector);
    if (found) {
      return found;
    }
  }
  return null;
}

function getBattleStatProjectileConfig(context, modifier, normalizedStatDelta, options = {}) {
  const icons = getBattleUiConfig(context).icons || {};
  const resolvedOptions = options || {};
  const sourceSelectorByModifier = {
    "enemy-health": '[data-battle-stat="enemy-damage"] img',
    "player-health": '[data-battle-stat="enemy-damage"] img',
    "enemy-aggression": '[data-battle-stat-id="enemy-aggression"] img',
    "player-heal": '[data-battle-stat="player-heal"] img',
  };
  const config = {
    enabled: false,
    sourceSelector: sourceSelectorByModifier[modifier] || '[data-battle-stat="enemy-damage"] img',
    iconPath: DEFAULT_LIGHT_PROJECTILE_ICON,
  };

  if (modifier === "player-health" && normalizedStatDelta > 0 && resolvedOptions.forceDamageProjectiles) {
    return {
      ...config,
      enabled: true,
      sourceSelector: '[data-battle-stat-id="player-heal"] img',
      iconPath: icons.lightRed || DEFAULT_LIGHT_PROJECTILE_ICON,
    };
  }

  if (modifier === "enemy-health" && normalizedStatDelta > 0 && resolvedOptions.forceHealProjectiles) {
    return {
      ...config,
      enabled: true,
      sourceSelector: '[data-battle-stat-id="enemy-health"] img',
      iconPath: icons.lightGreen || icons.light_green || DEFAULT_LIGHT_GREEN_PROJECTILE_ICON,
    };
  }

  if (modifier === "enemy-health" && normalizedStatDelta > 0 && resolvedOptions.forceShieldProjectiles) {
    return {
      ...config,
      enabled: true,
      sourceSelector: '[data-battle-stat-id="enemy-health"] img',
      targetSelector: ".battle-scaffold-meter-shield-icon",
      iconPath: icons.lightBlue || icons.light_blue || DEFAULT_LIGHT_BLUE_PROJECTILE_ICON,
    };
  }

  if (modifier === "enemy-health" || modifier === "player-health") {
    if (normalizedStatDelta < 0) {
      return {
        ...config,
        enabled: true,
        iconPath: icons.lightRed || DEFAULT_LIGHT_PROJECTILE_ICON,
      };
    }
    return config;
  }

  if (modifier === "enemy-aggression" && normalizedStatDelta !== 0) {
    return {
      ...config,
      enabled: true,
      iconPath: icons.lightBlue || icons.light_blue || DEFAULT_LIGHT_BLUE_PROJECTILE_ICON,
    };
  }

  if (modifier === "player-heal" && normalizedStatDelta > 0) {
    return {
      ...config,
      enabled: true,
      iconPath: icons.lightGreen || icons.light_green || icons.lightYellow || DEFAULT_LIGHT_GREEN_PROJECTILE_ICON,
    };
  }

  return config;
}

function getBattlePlayerHealthSourceElements(context) {
  const enemyDamageElement = getBattleEnemyStatRoot(context)?.querySelector('[data-battle-stat="enemy-damage"]');
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

function createEnemyValuesRow(context, values) {
  const row = document.createElement("div");
  row.className = "battle-scaffold-value-row";
  row.replaceChildren(...values.map((value) => createEnemyValue(context, value)));
  return row;
}

function getBattleEnemyStatRoot(context) {
  return context?.battleRenderTargets?.enemyHeaderValues
    || context?.battleRenderTargets?.enemyStats
    || null;
}

function createEnemyValue(context, { label, icon, value, stat }) {
  const item = document.createElement("div");
  item.className = "battle-scaffold-value";
  item.setAttribute("aria-label", label);
  if (stat) {
    item.dataset.battleStat = stat;
  }

  const iconElement = document.createElement("img");
  iconElement.src = resolveAssetPath(icon);
  iconElement.alt = "";

  const currentElement = document.createElement("strong");
  currentElement.textContent = String(value);

  attachBattleTooltip(context, item, {
    name: label,
    description: label,
    icon,
  });

  item.append(iconElement, currentElement);
  return item;
}

function renderBattleInventory(specialItemsElement, handItemsElement, context, renderTargets = null) {
  const littleMenuSlot = createInventorySlot(context, LITTLE_MENU_ITEM_ID, {
    iconOverride: "data/Assets/icons/little_menu.png",
    showQuantity: false,
    name: translate(context.request.locale, "ui.battleMenu") || translate(context.request.locale, "menu.settings") || "Menu",
    description: "",
  });
  const specialSlots = SPECIAL_ITEM_IDS.map((itemId) => createInventorySlot(
      context,
      itemId,
      {
        onClick: (slot) => handleSpecialItemClick(context, itemId, slot, renderTargets),
      },
    ));
  const goldSlot = createInventorySlot(context, GOLD_ITEM_ID);
  const bagSlot = createInventorySlot(context, "bag", {
    iconOverride: "data/Assets/icons/bag.png",
    showQuantity: false,
    name: translate(context.request.locale, "ui.bag") || "Bag",
    description: "",
  });

  specialItemsElement.replaceChildren(
    littleMenuSlot,
    ...specialSlots,
    goldSlot,
    bagSlot,
  );
  handItemsElement.replaceChildren(...getBattleHandItemIds(context).map((itemId) => createInventorySlot(context, itemId)));
}

function createInventorySlot(context, itemId, options = {}) {
  const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
  const slot = document.createElement("div");
  slot.className = "battle-scaffold-inventory-slot";
  slot.dataset.itemId = itemId;
  const itemLabel = options.name || getItemLabel(context, item, itemId);
  slot.dataset.itemLabel = itemLabel;
  const itemDescription = options.description || getItemDescription(context, item, itemId);
  slot.dataset.itemDescription = itemDescription;
  slot.setAttribute("aria-label", itemLabel);
  const itemIcon = options.iconOverride || item?.icon;
  if (itemIcon) {
    slot.dataset.itemIcon = resolveAssetPath(itemIcon);
  }
  const isClock = itemId === CLOCK_ITEM_ID;
  const activeSpecialItemId = context.battleState.activeSpecialItemId;
  const clockCooldownSeconds = isClock ? getClockCooldownSeconds(context) : 0;
  const isActiveSpecial = activeSpecialItemId === itemId;
  const isBlockedByOtherSpecial = Boolean(activeSpecialItemId && activeSpecialItemId !== itemId && SPECIAL_ITEM_IDS.includes(itemId));
  const isClockUnavailable = isClock && (clockCooldownSeconds > 0 || getInventoryQuantity(context.battleState.playerState, itemId) <= 0);
  const isSpecialUnavailable = SPECIAL_ITEM_IDS.includes(itemId)
    && !isActiveSpecial
    && (isBlockedByOtherSpecial || getInventoryQuantity(context.battleState.playerState, itemId) <= 0);

  if (isActiveSpecial) {
    slot.classList.add("is-active");
  }

  if (isClockUnavailable || isSpecialUnavailable) {
    slot.classList.add("is-disabled");
  }

  if (itemIcon) {
    const image = document.createElement("img");
    image.src = resolveAssetPath(itemIcon);
    image.alt = "";
    slot.append(image);
  }

  const shouldShowQuantity = options.showQuantity !== false;
  if (shouldShowQuantity) {
    const quantity = document.createElement("span");
    quantity.className = "battle-scaffold-inventory-quantity";
    quantity.textContent = String(getInventoryQuantity(context.battleState.playerState, itemId));
    slot.append(quantity);
  }

  if (clockCooldownSeconds > 0) {
    const cooldown = document.createElement("strong");
    cooldown.className = "battle-scaffold-clock-cooldown";
    cooldown.textContent = String(clockCooldownSeconds);
    slot.append(cooldown);
  }

  if (typeof options.onClick === "function") {
    slot.classList.add("is-clickable");
    slot.setAttribute("role", "button");
    slot.tabIndex = 0;
    slot.addEventListener("click", () => options.onClick(slot));
    slot.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        options.onClick(slot);
      }
    });
  }

  attachBattleInventoryTooltip(context, slot, {
    name: itemLabel,
    description: itemDescription,
    icon: slot.dataset.itemIcon,
  });

  return slot;
}

function attachBattleInventoryTooltip(context, element, { name, description, icon }) {
  attachBattleTooltip(context, element, {
    name,
    description,
    icon,
  });
}

function attachBattleTooltip(context, element, { name, description, icon, getContent }, options = {}) {
  const getTextValue = (value) => {
    if (typeof value === "function") {
      return String(value());
    }
    return String(value || "");
  };
  const getTooltipContent = () => {
    if (typeof getContent === "function") {
      return getContent();
    }
    return {
      name: getTextValue(name),
      description: getTextValue(description),
      icon,
    };
  };
  const positionTooltip = (event, tooltip) => {
    if (!event || !tooltip) {
      return;
    }

    const rect = tooltip.getBoundingClientRect();
    const margin = 12;
    const x = Math.max(margin, Math.min(event.clientX + 14, window.innerWidth - rect.width - margin));
    const y = Math.max(margin, Math.min(event.clientY + 14, window.innerHeight - rect.height - margin));
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  };

  const clearBattleTooltipHideTimeout = () => {
    if (battleTooltipHideTimeoutId) {
      window.clearTimeout(battleTooltipHideTimeoutId);
      battleTooltipHideTimeoutId = null;
    }
  };

  const show = (event) => {
    const tooltip = ensureBattleInventoryTooltip();
    const tooltipContent = getTooltipContent();
    tooltip.classList.remove("is-visible");
    tooltip.classList.add("item-tooltip", "battle-item-tooltip", "is-visible");
    tooltip.querySelector("strong").textContent = tooltipContent.name || "";
    renderInlineRichText(tooltip.querySelector("p"), tooltipContent.description || "", {
      itemCatalog: context.request.itemCatalog,
      resolveAssetPath,
      translateTextKey: (key) => translate(context.request.locale, key),
    });
    positionTooltip(event, tooltip);
    clearBattleTooltipHideTimeout();
    const hideDelay = getBattleTooltipDurationMs(context);
    if (hideDelay > 0) {
      battleTooltipHideTimeoutId = window.setTimeout(() => {
        hide();
      }, hideDelay);
    }
  };

  const clearBattleTooltipShowTimeout = () => {
    if (battleTooltipShowTimeoutId) {
      window.clearTimeout(battleTooltipShowTimeoutId);
      battleTooltipShowTimeoutId = null;
    }
  };

  const hide = () => {
    clearBattleTooltipHideTimeout();
    hideBattleTooltip();
  };

  const onContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    scheduleShow(event, false);
  };

  const scheduleShow = (event, immediate = false) => {
    clearBattleTooltipShowTimeout();
    if (immediate || getBattleTooltipDelayMs(context) <= 0) {
      show(event);
      return;
    }
    battleTooltipShowTimeoutId = window.setTimeout(() => {
      show(event);
    }, getBattleTooltipDelayMs(context));
  };

  const onPointerEnter = (event) => {
    if (options.onlyContextMenu) {
      return;
    }
    scheduleShow(event, false);
  };

  const onPointerMove = (event) => {
    if (options.onlyContextMenu) {
      return;
    }
    const tooltip = ensureBattleInventoryTooltip();
    if (tooltip.classList.contains("is-visible")) {
      positionTooltip(event, tooltip);
    }
  };

  const onPointerLeave = () => {
    if (options.onlyContextMenu) {
      return;
    }
    clearBattleTooltipShowTimeout();
    hideBattleTooltip();
  };

  element.addEventListener("contextmenu", onContextMenu);
  const supportsPointer = typeof window !== "undefined" && typeof window.PointerEvent !== "undefined";
  if (!options.onlyContextMenu) {
    if (supportsPointer) {
      element.addEventListener("pointermove", onPointerMove);
      element.addEventListener("pointerenter", onPointerEnter);
      element.addEventListener("pointerleave", onPointerLeave);
      element.addEventListener("pointercancel", onPointerLeave);
    } else {
      element.addEventListener("mousemove", onPointerMove);
      element.addEventListener("mouseenter", onPointerEnter);
      element.addEventListener("mouseleave", onPointerLeave);
    }
  }
}

function ensureBattleInventoryTooltip() {
  let tooltip = document.querySelector(".battle-item-tooltip");
  if (tooltip) {
    return tooltip;
  }

  tooltip = document.createElement("div");
  tooltip.className = "battle-item-tooltip item-tooltip";
  tooltip.setAttribute("role", "status");

  const title = document.createElement("strong");
  const descriptionLine = document.createElement("p");
  tooltip.append(title, descriptionLine);
  document.body.append(tooltip);
  return tooltip;
}

function hideBattleTooltip() {
  if (battleTooltipHideTimeoutId) {
    window.clearTimeout(battleTooltipHideTimeoutId);
    battleTooltipHideTimeoutId = null;
  }

  const tooltips = document.querySelectorAll(".battle-item-tooltip, .item-tooltip");
  tooltips.forEach((tooltip) => tooltip.classList.remove("is-visible"));
}

function startBattleRuntime(context, renderTargets) {
  stopBattleRuntime(context);
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  context.battleState.ragePausedUntil = context.battleState.ragePausedUntil || 0;
  const runtimeState = {
    intervalId: null,
    idleTimeoutId: null,
    attemptToken: renderTargets.attemptToken,
  };
  context.battleRuntime = runtimeState;
  const lifecycleToken = renderTargets.lifecycleToken;
  runtimeState.intervalId = window.setInterval(() => {
    if (context.battleRuntime !== runtimeState) {
      window.clearInterval(runtimeState.intervalId);
      return;
    }
    if (!isBattleLifecycleActive(context, lifecycleToken) || !isBattleAttemptActive(context, runtimeState.attemptToken)) {
      stopBattleRuntime(context);
      return;
    }
    tickBattleRuntime(context, renderTargets);
  }, 1000);
  resetBattleIdleTimer(context, renderTargets);
}

function stopBattleRuntime(context) {
  if (context.battleRuntime?.intervalId) {
    window.clearInterval(context.battleRuntime.intervalId);
  }
  if (context.battleRuntime?.idleTimeoutId) {
    window.clearTimeout(context.battleRuntime.idleTimeoutId);
  }
  context.battleRuntime = null;
}

function pauseBattleRuntime(context) {
  if (context.battleRuntime?.intervalId) {
    window.clearInterval(context.battleRuntime.intervalId);
  }
  if (context.battleRuntime?.idleTimeoutId) {
    window.clearTimeout(context.battleRuntime.idleTimeoutId);
  }
  context.battleRuntime = null;
}

function resumeBattleRuntime(context, renderTargets) {
  if (context.battleState.isComplete || context.battleRuntime || !shouldContinueBattle(context, renderTargets)) {
    return;
  }
  startBattleRuntime(context, renderTargets);
}

function resetBattleIdleTimer(context, renderTargets) {
  if (!context.battleRuntime || !renderTargets?.boardElement || !shouldContinueBattle(context, renderTargets)) {
    return;
  }

  if (context.battleRuntime.idleTimeoutId) {
    window.clearTimeout(context.battleRuntime.idleTimeoutId);
  }

  const delayMs = getBattleAnimationConfig(context).idleHintDelayMs;
  const lifecycleToken = renderTargets.lifecycleToken;
  const runtimeState = context.battleRuntime;
  context.battleRuntime.idleTimeoutId = window.setTimeout(() => {
    if (
      context.battleRuntime !== runtimeState
      || !isBattleLifecycleActive(context, lifecycleToken)
      || !isBattleAttemptActive(context, runtimeState?.attemptToken)
    ) {
      return;
    }
    handleBattleIdle(context, renderTargets);
  }, Math.max(0, Number(delayMs) || 5000));
}

async function handleBattleIdle(context, renderTargets) {
  if (!context.battleRuntime || context.battleState.isComplete || !shouldContinueBattle(context, renderTargets)) {
    return;
  }

  if (context.battleState.isResolving) {
    resetBattleIdleTimer(context, renderTargets);
    return;
  }

  const availableMove = context.engine.findBattleAvailableMove(
    context.battleState.board,
    context.request.itemCatalog,
    {
      ...getBattleUiConfig(context).availableMoveSearch,
      walls: context.battleState.walls,
      boxes: context.battleState.boxes,
      vines: context.battleState.vines,
    },
  );

  if (availableMove) {
    await animateBattleShakeCells(
      renderTargets.boardElement,
      [availableMove.hintCell || availableMove.from],
      getBattleAnimationConfig(context).idleHintShakeMs,
    );
    if (!shouldContinueBattle(context, renderTargets)) {
      return;
    }
    resetBattleIdleTimer(context, renderTargets);
    return;
  }

  await handleNoBattleMoves(context, renderTargets);
}

async function handleNoBattleMoves(context, renderTargets) {
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  if (context.battleState.noMovesMessageVisible) {
    return;
  }

  const { boardElement, status } = renderTargets;
  const uiConfig = getBattleUiConfig(context);
  const animationConfig = getBattleAnimationConfig(context);

  context.battleState.noMovesMessageVisible = true;
  context.battleState.selectedCell = null;
  showBattleBoardMessage(
    boardElement,
    translate(context.request.locale, uiConfig.textKeys.noMovesTitle),
    translate(context.request.locale, uiConfig.textKeys.noMovesBody),
  );

  setBattleStatus(context, status, translate(context.request.locale, uiConfig.textKeys.noMovesBody));
  await wait(animationConfig.noMovesMessageMs);
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  clearBattleBoardMessage(boardElement);
  context.battleState.noMovesMessageVisible = false;
  resetBattleIdleTimer(context, renderTargets);
}

async function handleManualBattleShuffle(context, renderTargets) {
  if (
    context.battleState.isResolving
    || context.battleState.isComplete
    || !shouldContinueBattle(context, renderTargets)
  ) {
    return;
  }

  const { boardElement, status, enemyStats, playerMeters, ultimateText } = renderTargets;
  context.battleState.isResolving = true;
  context.battleState.noMovesMessageVisible = false;
  context.battleState.selectedCell = null;
  clearBattleBoardMessage(boardElement);
  clearActiveBattleSpecial(context);
  updateBattleShuffleButtonState(context);
  renderBattleInventory(renderTargets.specialItems, renderTargets.handItems, context, renderTargets);

  const damage = context.battleState.enemyState?.aggression?.damage || 0;
  context.engine.applyBattlePlayerDamage(context.battleState.playerState, damage);
  if (damage > 0) {
    setBattleHealthFeedbackDelta(context, "player-health", -damage, {
      sourceElements: getBattlePlayerHealthSourceElements(context),
    });
  }
  renderBattleStats(enemyStats, playerMeters, ultimateText, context);
  setBattleStatus(context, status, translate(context.request.locale, getBattleUiConfig(context).textKeys.noMovesBody));
  if (isBattlePlayerDefeated(context)) {
    context.battleState.isResolving = false;
    showBattleDefeat(context, renderTargets);
    return;
  }

  await shuffleCurrentBattleBoard(context, renderTargets, getBattleAnimationConfig(context).noMovesShuffleMs);
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }

  context.battleState.isResolving = false;
  setBattleStatus(context, status, translateBattleText(context, "shuffleBoardDone"));
  updateBattleShuffleButtonState(context);
  renderBattleBoard(boardElement, context, status, enemyStats, playerMeters, ultimateText);
  await finishBattleMoveIfNeeded(context, renderTargets);
}

async function shuffleCurrentBattleBoard(context, renderTargets, durationMs) {
  const { boardElement, status, enemyStats, playerMeters, ultimateText } = renderTargets;
  const shuffleResult = createNoMovesBattleShuffle(context);
  await animateBattleBoardShuffleMovement(boardElement, shuffleResult.movement, durationMs);
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }

  context.battleState.board = shuffleResult.board;
  context.battleState.reserveBoard = createBattleReserveBoardForCurrentStage(context);
  syncBattleWallsWithStage(context, { force: true });
  syncBattleBoxesWithStage(context, { force: true });
  syncBattleVinesWithStage(context, { force: true });
  renderBattleBoard(boardElement, context, status, enemyStats, playerMeters, ultimateText);
}

function areBattleBoardsEqual(firstBoard, secondBoard) {
  if (firstBoard === secondBoard) {
    return true;
  }
  if (!Array.isArray(firstBoard) || !Array.isArray(secondBoard)) {
    return false;
  }
  if (firstBoard.length !== secondBoard.length) {
    return false;
  }

  for (let row = 0; row < firstBoard.length; row += 1) {
    if (!Array.isArray(firstBoard[row]) || !Array.isArray(secondBoard[row])) {
      return false;
    }
    if (firstBoard[row].length !== secondBoard[row].length) {
      return false;
    }
    for (let col = 0; col < firstBoard[row].length; col += 1) {
      if (firstBoard[row][col] !== secondBoard[row][col]) {
        return false;
      }
    }
  }

  return true;
}

function createNoMovesBattleShuffle(context) {
  const maxAttempts = 80;
  let fallbackResult = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const shuffleResult = context.engine.shuffleBattleBoardWithMovement(context.battleState.board, {
      boxes: context.battleState.boxes,
      vines: context.battleState.vines,
      random: Math.random,
    });
    if (!areBattleBoardsEqual(context.battleState.board, shuffleResult.board)) {
      const hasStartingMatches = context.engine.findBattleMatches(
        shuffleResult.board,
        context.request.itemCatalog,
        { boxes: context.battleState.boxes, vines: context.battleState.vines },
      ).length > 0;
      const hasAvailableMove = context.engine.findBattleAvailableMove(
        shuffleResult.board,
        context.request.itemCatalog,
        {
          ...getBattleUiConfig(context).availableMoveSearch,
          walls: context.battleState.walls,
          boxes: context.battleState.boxes,
          vines: context.battleState.vines,
        },
      );

      if (!hasStartingMatches && hasAvailableMove) {
        return shuffleResult;
      }

      if (!hasStartingMatches && !fallbackResult) {
        fallbackResult = shuffleResult;
      }

      if (!fallbackResult) {
        fallbackResult = shuffleResult;
      }
    }
  }

  return fallbackResult || {
    board: context.battleState.board,
    movement: [],
  };
}

function tickBattleRuntime(context, renderTargets) {
  if (Date.now() < (context.battleState.ragePausedUntil || 0)) {
    if (renderTargets) {
      updateBattleClockCooldownDisplay(context, renderTargets.specialItems);
    }
    return;
  }

  if (context.battleState.isRageResolving || context.battleState.isComplete) {
    return;
  }

  if (context.battleState.pendingRageAction) {
    if (renderTargets) {
      updateBattleRageTimerDisplay(context, getBattleEnemyStatRoot(context));
      applyBattleRageWarningVisualState(context, getBattleEnemyStatRoot(context));
      void runPendingBattleRageIfReady(context, renderTargets);
    }
    return;
  }

  const result = context.engine.tickBattleRage(context.battleState.enemyState, 1);
  if (result.triggered > 0) {
    markBattleRagePending(context, renderTargets);
    if (renderTargets?.status) {
      void runPendingBattleRageIfReady(context, renderTargets);
    }
    return;
  }

  if (renderTargets) {
    updateBattleRageTimerDisplay(context, getBattleEnemyStatRoot(context));
    applyBattleRageWarningVisualState(context, getBattleEnemyStatRoot(context));
  }
}

function markBattleRagePending(context, renderTargets) {
  const rageState = context.battleState.enemyState?.rage;
  context.battleState.pendingRageAction = true;
  if (rageState) {
    rageState.current = 0;
  }
  if (renderTargets) {
    updateBattleRageTimerDisplay(context, getBattleEnemyStatRoot(context));
    applyBattleRageWarningVisualState(context, getBattleEnemyStatRoot(context));
  }
}

async function runPendingBattleRageIfReady(context, renderTargets) {
  if (
    !context.battleState.pendingRageAction
    || context.battleState.isRageResolving
    || context.battleState.isComplete
    || !shouldContinueBattle(context, renderTargets)
  ) {
    return false;
  }

  if (isBattleFieldBusyForRage(context)) {
    return false;
  }

  await runBattleRageAction(context, renderTargets);
  return true;
}

function isBattleFieldBusyForRage(context) {
  return Boolean(
    context.battleState.isResolving
    || hasActiveBattleResolutionAnimation(context)
  );
}

async function runBattleRageAction(context, renderTargets) {
  if (
    context.battleState.isRageResolving
    || context.battleState.isComplete
    || !shouldContinueBattle(context, renderTargets)
  ) {
    return;
  }

  const enemyState = context.battleState.enemyState;
  const rageState = enemyState?.rage;
  if (!rageState) {
    return;
  }

  const uiConfig = getBattleUiConfig(context);
  let transformLights = [];
  let shouldFinalizeRage = true;
  context.battleState.pendingRageAction = false;
  context.battleState.isRageResolving = true;
  context.battleState.isResolving = true;
  context.battleState.selectedCell = null;
  rageState.current = 0;
  pauseBattleRuntime(context);

  try {
    setBattleStatus(context, renderTargets.status, translate(context.request.locale, uiConfig.textKeys.rageEvent));
    updateBattleRageTimerDisplay(context, getBattleEnemyStatRoot(context));
    renderBattleBoard(
      renderTargets.boardElement,
      context,
      renderTargets.status,
      renderTargets.enemyStats,
      renderTargets.playerMeters,
      renderTargets.ultimateText,
    );

    await animateBattleRageWave(context, renderTargets.boardElement);
    if (!shouldContinueBattle(context, renderTargets)) {
      return;
    }

    let shouldResolveUltimateCascades = false;
    const ultimateEffects = getCurrentBattleUltimateEffects(context);
    if (ultimateEffects.length === 0) {
      await animateBattleRageProjectiles(context, renderTargets.boardElement);
      if (!shouldContinueBattle(context, renderTargets)) {
        return;
      }
    }
    for (const effect of ultimateEffects) {
      transformLights = animateBattleRageTransformTargetLights(context, renderTargets.boardElement, [effect]);
      await animateBattleRageProjectiles(
        context,
        renderTargets.boardElement,
        getBattleRageEffectTargetIcons(context, renderTargets.boardElement, effect, transformLights),
      );
      if (!shouldContinueBattle(context, renderTargets)) {
        return;
      }

      if (isBattleUltimateKamikazeEffect(effect)) {
        stopBattleRageTransformTargetLights(transformLights);
        transformLights = [];
        const kamikazeResult = await handleBattleUltimateKamikazeEffect(context, renderTargets);
        if (kamikazeResult?.shouldFinalizeRage === false) {
          shouldFinalizeRage = false;
        }
        if (kamikazeResult?.shouldStop) {
          return;
        }
        continue;
      }

      const effectSummary = context.engine.applyBattleUltimateEffects(
        context.battleState,
        context.request.itemCatalog,
        [effect],
        {
          boxes: context.battleState.boxes,
          enemyShieldMax: getBattleEnemyShieldMax(context),
        },
      );
      stopBattleRageTransformTargetLights(transformLights);
      transformLights = [];
      if (!shouldContinueBattle(context, renderTargets)) {
        return;
      }
      if (effectSummary.playerDamage > 0) {
        setBattleHealthFeedbackDelta(context, "player-health", -effectSummary.playerDamage, {
          sourceElements: getBoardElementsForSourceCells(context, effectSummary.damageSourceCells),
        });
        renderBattleStats(renderTargets.enemyStats, renderTargets.playerMeters, renderTargets.ultimateText, context);
        await wait(getBattleUltimateDamageFeedbackWaitMs(context));
        if (!shouldContinueBattle(context, renderTargets)) {
          return;
        }
        if (isBattlePlayerDefeated(context)) {
          context.battleState.isResolving = false;
          shouldFinalizeRage = false;
          showBattleDefeat(context, renderTargets);
          return;
        }
      }
      if (effectSummary.enemyHealing > 0) {
        setBattleHealthFeedbackDelta(context, "enemy-health", effectSummary.enemyHealing, {
          sourceElements: getBoardElementsForSourceCells(context, effectSummary.healingSourceCells),
          forceHealProjectiles: true,
          disableFallbackSource: true,
        });
        renderBattleStats(renderTargets.enemyStats, renderTargets.playerMeters, renderTargets.ultimateText, context);
        await wait(getBattleUltimateDamageFeedbackWaitMs(context));
        if (!shouldContinueBattle(context, renderTargets)) {
          return;
        }
      }
      if (effectSummary.enemyShieldHealing > 0) {
        setBattleHealthFeedbackDelta(context, "enemy-health", effectSummary.enemyShieldHealing, {
          sourceElements: getBoardElementsForSourceCells(context, effectSummary.shieldHealingSourceCells),
          forceShieldProjectiles: true,
          disableFallbackSource: true,
        });
        renderBattleStats(renderTargets.enemyStats, renderTargets.playerMeters, renderTargets.ultimateText, context);
        await wait(getBattleUltimateDamageFeedbackWaitMs(context));
        if (!shouldContinueBattle(context, renderTargets)) {
          return;
        }
      }
      if (effectSummary.convertedItems > 0) {
        shouldResolveUltimateCascades = true;
        renderBattleBoard(
          renderTargets.boardElement,
          context,
          renderTargets.status,
          renderTargets.enemyStats,
          renderTargets.playerMeters,
          renderTargets.ultimateText,
        );
      }
    }

    rageState.current = rageState.resetAfterUltimate === false ? 0 : rageState.max;
    updateBattleRageTimerDisplay(context, getBattleEnemyStatRoot(context));

    if (shouldResolveUltimateCascades) {
      renderBattleBoard(
        renderTargets.boardElement,
        context,
        renderTargets.status,
        renderTargets.enemyStats,
        renderTargets.playerMeters,
        renderTargets.ultimateText,
      );
      const cascadeResult = await resolveBattleCascades(context.battleState.board, context, {
        boardElement: renderTargets.boardElement,
        statusElement: renderTargets.status,
        enemyStatsElement: renderTargets.enemyStats,
        playerMetersElement: renderTargets.playerMeters,
        ultimateTextElement: renderTargets.ultimateText,
        bonusCell: null,
        lifecycleToken: renderTargets.lifecycleToken,
        attemptToken: renderTargets.attemptToken,
      });
      if (cascadeResult.cancelled || !shouldContinueBattle(context, renderTargets)) {
        return;
      }
      context.battleState.board = cascadeResult.board;
      context.battleState.lastMoveSummary = cascadeResult;
      if (cascadeResult.cascades > 0) {
        setBattleStatus(context, renderTargets.status, formatMoveStatus(context, cascadeResult, enemyState));
      }
      context.battleState.isResolving = false;
      if (await finishBattleMoveIfNeeded(context, renderTargets)) {
        shouldFinalizeRage = false;
        return;
      }
      context.battleState.isResolving = true;
    }

  } finally {
    stopBattleRageTransformTargetLights(transformLights);
    context.battleState.isRageResolving = false;

    if (shouldFinalizeRage && shouldContinueBattle(context, renderTargets) && !context.battleState.isComplete) {
      if (Number(rageState.current) <= 0) {
        rageState.current = rageState.resetAfterUltimate === false ? 0 : rageState.max;
      }
      context.battleState.isResolving = false;
      updateBattleRageTimerDisplay(context, getBattleEnemyStatRoot(context));
      applyBattleRageWarningVisualState(context, getBattleEnemyStatRoot(context));
      renderBattleBoard(
        renderTargets.boardElement,
        context,
        renderTargets.status,
        renderTargets.enemyStats,
        renderTargets.playerMeters,
        renderTargets.ultimateText,
      );
      resumeBattleRuntime(context, renderTargets);
      resetBattleIdleTimer(context, renderTargets);
    }
  }
}

async function handleBattleUltimateKamikazeEffect(context, renderTargets) {
  const playerDamageResult = context.engine.applyBattleKamikazePlayerDamage(context.battleState);
  const kamikazeDamage = Number(playerDamageResult.kamikazeDamage || 0);
  if (kamikazeDamage <= 0) {
    return { shouldStop: false };
  }

  if (playerDamageResult.playerDamage > 0) {
    setBattleHealthFeedbackDelta(context, "player-health", -playerDamageResult.playerDamage, {
      sourceElements: getBattleEnemyHealthSourceElements(context),
      disableFallbackSource: true,
    });
    renderBattleStats(
      renderTargets.enemyStats,
      renderTargets.playerMeters,
      renderTargets.ultimateText,
      context,
    );
    await wait(getBattleUltimateDamageFeedbackWaitMs(context));
    if (!shouldContinueBattle(context, renderTargets)) {
      return { shouldStop: true };
    }
  }

  await animateBattleKamikazeSelfDamageBurst(context, kamikazeDamage);
  if (!shouldContinueBattle(context, renderTargets)) {
    return { shouldStop: true };
  }

  const selfDamageResult = context.engine.applyBattleKamikazeEnemySelfDamage(context.battleState, kamikazeDamage);
  if (selfDamageResult.enemySelfDamage > 0) {
    setBattleHealthFeedbackDelta(context, "enemy-health", -selfDamageResult.enemySelfDamage, {
      disableFallbackSource: true,
    });
  }
  renderBattleStats(
    renderTargets.enemyStats,
    renderTargets.playerMeters,
    renderTargets.ultimateText,
    context,
  );
  await wait(getBattleUltimateDamageFeedbackWaitMs(context));
  if (!shouldContinueBattle(context, renderTargets)) {
    return { shouldStop: true };
  }

  if (await finishBattleMoveIfNeeded(context, renderTargets)) {
    return { shouldStop: true, shouldFinalizeRage: false };
  }
  return { shouldStop: false };
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
  if (!boardElement) {
    return;
  }
  const animationConfig = getBattleAnimationConfig(context);
  const durationMs = Math.max(0, Number(animationConfig.rageWaveMs) || 0);
  if (durationMs <= 0) {
    return;
  }

  const icons = Array.from(boardElement.querySelectorAll(".battle-cell-icon"));
  icons.forEach((iconWrap, index) => {
    iconWrap.style.setProperty("--battle-rage-wave-ms", `${durationMs}ms`);
    iconWrap.style.setProperty("--battle-rage-wave-delay-ms", `${Math.min(220, index * 12)}ms`);
    iconWrap.classList.remove("is-rage-wave");
    void iconWrap.offsetWidth;
    iconWrap.classList.add("is-rage-wave");
  });

  await wait(durationMs + Math.min(220, Math.max(0, icons.length - 1) * 12));
  icons.forEach((iconWrap) => {
    iconWrap.classList.remove("is-rage-wave");
    iconWrap.style.removeProperty("--battle-rage-wave-ms");
    iconWrap.style.removeProperty("--battle-rage-wave-delay-ms");
  });
}

async function animateBattleRageProjectiles(context, boardElement, targetIcons = null) {
  const targets = Array.isArray(targetIcons) ? targetIcons : getBattleRageTargetIcons(context, boardElement);
  const sourceIcon = getBattleEnemyStatRoot(context)?.querySelector('[data-battle-stat="enemy-rage"] img');
  const fxLayer = context.battleRenderTargets?.battleFxLayer;
  if (!sourceIcon || !fxLayer || targets.length === 0) {
    return;
  }

  const animationConfig = getBattleAnimationConfig(context);
  const uiConfig = getBattleUiConfig(context);
  const projectileCount = Math.max(1, Math.floor(Number(animationConfig.rageProjectileCount) || 1));
  const durationMs = Math.max(0, Number(animationConfig.rageProjectileMs) || DEFAULT_LIGHT_PROJECTILE_MS);
  const arcHeightPx = Math.max(0, Number(animationConfig.rageProjectileArcHeightPx) || DEFAULT_LIGHT_PROJECTILE_ARC_HEIGHT_PX);
  const spreadPx = Math.max(0, Number(animationConfig.rageProjectileSpreadPx) || DEFAULT_LIGHT_PROJECTILE_SPREAD_PX);
  const sizePx = Math.max(8, Number(animationConfig.rageProjectileSizePx) || DEFAULT_LIGHT_PROJECTILE_SIZE_PX);
  const iconPath = resolveAssetPath(uiConfig.icons.lightGold || DEFAULT_LIGHT_GOLD_PROJECTILE_ICON);
  const layerRect = fxLayer.getBoundingClientRect();
  const sourceRect = sourceIcon.getBoundingClientRect();
  const start = {
    x: sourceRect.left + sourceRect.width * 0.5 - layerRect.left,
    y: sourceRect.top + sourceRect.height * 0.5 - layerRect.top,
  };
  let maxEndMs = 0;

  targets.forEach((targetIcon, targetIndex) => {
    const targetRect = targetIcon.getBoundingClientRect();
    const end = {
      x: targetRect.left + targetRect.width * 0.5 - layerRect.left,
      y: targetRect.top + targetRect.height * 0.5 - layerRect.top,
    };

    for (let index = 0; index < projectileCount; index += 1) {
      const projectile = document.createElement("div");
      projectile.className = "battle-damage-light-projectile battle-rage-light-projectile";
      projectile.style.left = `${start.x}px`;
      projectile.style.top = `${start.y}px`;
      projectile.style.width = `${sizePx}px`;
      projectile.style.height = `${sizePx}px`;

      const img = document.createElement("img");
      img.src = iconPath;
      img.alt = "";
      img.draggable = false;
      projectile.append(img);
      fxLayer.append(projectile);

      const sideSign = Math.random() < 0.5 ? -1 : 1;
      const sideSpread = spreadPx > 0 ? (Math.random() * 2 - 1) * spreadPx : 0;
      const heightSpread = arcHeightPx > 0 ? arcHeightPx * (0.75 + Math.random() * 0.45) : 0;
      const mid = {
        x: ((start.x + end.x) * 0.5) + sideSpread,
        y: ((start.y + end.y) * 0.5) - sideSign * heightSpread,
      };
      const delayMs = Math.max(0, targetIndex * 55 + index * 35);
      const thisDuration = Math.max(220, durationMs + Math.floor((Math.random() * 0.2 - 0.1) * durationMs));
      maxEndMs = Math.max(maxEndMs, delayMs + thisDuration);

      const animation = projectile.animate([
        { transform: "translate(0px, 0px) scale(0.55)", opacity: 0 },
        { offset: 0.15, transform: "translate(0px, 0px) scale(1)", opacity: 1 },
        {
          offset: 0.72,
          transform: `translate(${mid.x - start.x}px, ${mid.y - start.y}px) scale(1.12)`,
          opacity: 1,
        },
        {
          transform: `translate(${end.x - start.x}px, ${end.y - start.y}px) scale(0.75)`,
          opacity: 0,
        },
      ], {
        duration: thisDuration,
        delay: delayMs,
        easing: "ease-in-out",
        fill: "forwards",
      });

      const cleanupProjectile = () => {
        if (projectile.isConnected) {
          projectile.remove();
        }
      };
      projectile.addEventListener("animationend", cleanupProjectile, { once: true });
      window.setTimeout(cleanupProjectile, thisDuration + delayMs + 50);
      if (animation.playState !== "finished") {
        animation.play();
      }
    }
  });

  await wait(maxEndMs);
}

async function animateBattleKamikazeSelfDamageBurst(context, amount = 0) {
  const sourceElement = getBattleEnemyHealthSourceElements(context)[0];
  const fxLayer = context?.battleRenderTargets?.battleFxLayer;
  if (!sourceElement || !fxLayer) {
    return;
  }

  const animationConfig = getBattleAnimationConfig(context);
  const rawAmount = Math.max(0, Math.abs(Number(amount) || 0));
  const perDamage = Number(animationConfig.lightDamageProjectilesPerDamage);
  const baseCount = Number(animationConfig.lightDamageProjectileCount);
  const projectileCount = Number.isFinite(perDamage) && perDamage > 0
    ? Math.max(1, Math.round(rawAmount * perDamage))
    : Number.isFinite(baseCount) && baseCount > 0
      ? Math.round(baseCount)
      : DEFAULT_LIGHT_PROJECTILE_COUNT;
  const finalCount = Math.max(
    MIN_DAMAGE_PROJECTILES,
    Math.min(MAX_DAMAGE_PROJECTILES, Math.round(projectileCount) || MIN_DAMAGE_PROJECTILES),
  );
  const durationMs = Math.max(250, Number(animationConfig.lightDamageProjectileMs || DEFAULT_LIGHT_PROJECTILE_MS));
  const sizePx = Math.max(8, Number(animationConfig.lightDamageProjectileSizePx || DEFAULT_LIGHT_PROJECTILE_SIZE_PX));
  const burstDistancePx = Math.max(90, Number(animationConfig.kamikazeBurstDistancePx || 190));
  const iconPath = resolveAssetPath(getBattleUiConfig(context).icons.lightRed || DEFAULT_LIGHT_PROJECTILE_ICON);
  const layerRect = fxLayer.getBoundingClientRect();
  const sourceRect = sourceElement.getBoundingClientRect();
  const start = {
    x: sourceRect.left + sourceRect.width * 0.5 - layerRect.left,
    y: sourceRect.top + sourceRect.height * 0.5 - layerRect.top,
  };

  for (let index = 0; index < finalCount; index += 1) {
    const angle = ((Math.PI * 2) / finalCount) * index + (Math.random() * 0.5 - 0.25);
    const distance = burstDistancePx * (0.75 + Math.random() * 0.55);
    const end = {
      x: start.x + Math.cos(angle) * distance,
      y: start.y + Math.sin(angle) * distance,
    };
    const projectile = document.createElement("div");
    projectile.className = "battle-damage-light-projectile";
    projectile.style.left = `${start.x}px`;
    projectile.style.top = `${start.y}px`;
    projectile.style.width = `${sizePx}px`;
    projectile.style.height = `${sizePx}px`;

    const img = document.createElement("img");
    img.src = iconPath;
    img.alt = "";
    img.draggable = false;
    projectile.append(img);
    fxLayer.append(projectile);

    const delayMs = Math.max(0, Math.floor(index * 28));
    const thisDuration = Math.max(220, durationMs + Math.floor((Math.random() * 0.18 - 0.09) * durationMs));
    const animation = projectile.animate([
      {
        transform: "translate(0px, 0px) scale(0.6)",
        opacity: 0,
        filter: "blur(0px)",
      },
      {
        offset: 0.12,
        opacity: 1,
        transform: "translate(0px, 0px) scale(1.1)",
        filter: "blur(0px)",
      },
      {
        offset: 0.7,
        opacity: 0.75,
        transform: `translate(${(end.x - start.x) * 0.72}px, ${(end.y - start.y) * 0.72}px) scale(1.45)`,
        filter: "blur(1.5px)",
      },
      {
        transform: `translate(${end.x - start.x}px, ${end.y - start.y}px) scale(1.8)`,
        opacity: 0,
        filter: "blur(3px)",
      },
    ], {
      duration: thisDuration,
      delay: delayMs,
      easing: "ease-out",
      fill: "forwards",
    });

    const cleanupProjectile = () => {
      if (projectile.isConnected) {
        projectile.remove();
      }
    };
    projectile.addEventListener("animationend", cleanupProjectile, { once: true });
    window.setTimeout(cleanupProjectile, thisDuration + delayMs + 50);
    if (animation.playState !== "finished") {
      animation.play();
    }
  }

  await wait(durationMs + finalCount * 28 + 80);
}

function animateBattleRageTransformTargetLights(context, boardElement, effects = null) {
  if (!boardElement) {
    return [];
  }
  const targets = getBattleUltimateConvertTargetIcons(context, boardElement, effects);
  targets.forEach((iconWrap) => {
    iconWrap.classList.add("is-rage-transform-target");
  });
  return targets;
}

function stopBattleRageTransformTargetLights(targets) {
  if (!Array.isArray(targets)) {
    return;
  }
  targets.forEach((iconWrap) => {
    iconWrap.classList.remove("is-rage-transform-target");
  });
}

function getBattleUltimateConvertTargetIcons(context, boardElement, effects = null) {
  const sourceEffects = Array.isArray(effects) ? effects : getCurrentBattleUltimateEffects(context);
  const sourceItemIds = new Set();
  const sourceItemTypes = new Set();

  sourceEffects
    .filter((effect) => isBattleUltimateConvertEffect(effect))
    .forEach((effect) => {
      normalizeStringList(effect.from?.itemIds ?? effect.from?.itemId ?? effect.fromItemIds ?? effect.fromItemId ?? effect.itemIds ?? effect.itemId)
        .forEach((itemId) => sourceItemIds.add(itemId));
      normalizeStringList(effect.from?.itemTypes ?? effect.fromItemTypes ?? effect.itemTypes)
        .forEach((itemType) => sourceItemTypes.add(itemType));
    });

  if (sourceItemIds.size === 0 && sourceItemTypes.size === 0) {
    return [];
  }

  const targets = [];
  context.battleState.board.forEach((row, rowIndex) => {
    row.forEach((itemId, colIndex) => {
      if (isBattleCellBoxed(context, { row: rowIndex, col: colIndex })) {
        return;
      }
      const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
      const matchesItem = sourceItemIds.has(itemId) || sourceItemIds.has(item?.itemId);
      const matchesType = item?.type && sourceItemTypes.has(item.type);
      if (!matchesItem && !matchesType) {
        return;
      }
      const iconWrap = boardElement.querySelector(`.battle-cell-icon[data-row="${rowIndex}"][data-col="${colIndex}"]`);
      if (iconWrap) {
        targets.push(iconWrap);
      }
    });
  });
  return targets;
}

function isBattleUltimateConvertEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return ["convertItems", "convert", "conversion", "преобразование"].includes(effectType);
}

function isBattleUltimateDamagePlayerByBoardItemsEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return ["damagePlayerByBoardItems", "damagePlayerByItems", "damageByBoardItems", "damagePlayer", "урон"].includes(effectType);
}

function isBattleUltimateHealingEnemyByBoardItemsEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return [
    "HealingEnemyByBoardItems",
    "healingEnemyByBoardItems",
    "healEnemyByBoardItems",
    "enemyHealByBoardItems",
    "лечение",
  ].includes(effectType);
}

function isBattleUltimateRestoreEnemyShieldByBoardItemsEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return [
    "RestoreEnemyShieldByBoardItems",
    "restoreEnemyShieldByBoardItems",
    "HealingEnemyShieldByBoardItems",
    "healingEnemyShieldByBoardItems",
    "enemyShieldByBoardItems",
    "щит",
  ].includes(effectType);
}

function isBattleUltimateKamikazeEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return ["kamikaze", "Kamikaze", "enemyKamikaze", "kamikazeEnemy"].includes(effectType);
}

function getBattleRageEffectTargetIcons(context, boardElement, effect, transformLights = []) {
  if (isBattleUltimateConvertEffect(effect)) {
    return transformLights
      .map((iconWrap) => iconWrap?.querySelector("img"))
      .filter(Boolean);
  }

  if (isBattleUltimateDamagePlayerByBoardItemsEffect(effect)) {
    return getBattleUltimateDamageTargetIcons(context, boardElement, effect);
  }

  if (isBattleUltimateHealingEnemyByBoardItemsEffect(effect)) {
    return getBattleUltimateDamageTargetIcons(context, boardElement, effect);
  }

  if (isBattleUltimateRestoreEnemyShieldByBoardItemsEffect(effect)) {
    return getBattleUltimateDamageTargetIcons(context, boardElement, effect);
  }

  if (isBattleUltimateKamikazeEffect(effect)) {
    return getBattlePlayerHealthTargetIcons(context);
  }

  return getBattleRageTargetIcons(context, boardElement);
}

function getBattlePlayerHealthTargetIcons(context) {
  const playerHealthMeter = context?.battleRenderTargets?.playerMeters?.querySelector('[data-battle-stat-id="player-health"]');
  if (!playerHealthMeter) {
    return [];
  }
  const playerHealthIcon = playerHealthMeter.querySelector(".battle-scaffold-meter-base-icon")
    || playerHealthMeter.querySelector("img");
  return playerHealthIcon ? [playerHealthIcon] : [];
}

function getBattleUltimateDamageTargetIcons(context, boardElement, effect) {
  if (!boardElement) {
    return [];
  }

  const targetTypes = new Set(normalizeStringList(effect.count?.itemTypes ?? effect.countItemTypes ?? effect.itemTypes));
  const targetItemIds = new Set(normalizeStringList(effect.count?.itemIds ?? effect.count?.itemId ?? effect.countItemIds ?? effect.countItemId ?? effect.itemIds ?? effect.itemId));
  if (targetTypes.size === 0 && targetItemIds.size === 0) {
    return [];
  }

  const targets = [];
  context.battleState.board.forEach((row, rowIndex) => {
    row.forEach((itemId, colIndex) => {
      if (isBattleCellBoxed(context, { row: rowIndex, col: colIndex })) {
        return;
      }
      const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
      if (!item) {
        return;
      }
      const matchesItem = targetItemIds.has(itemId) || targetItemIds.has(item.itemId);
      const matchesType = item.type && targetTypes.has(item.type);
      if (!matchesItem && !matchesType) {
        return;
      }
      const icon = boardElement.querySelector(`.battle-cell-icon[data-row="${rowIndex}"][data-col="${colIndex}"] img`);
      if (icon) {
        targets.push(icon);
      }
    });
  });
  return targets;
}

function getBattleUltimateDamageFeedbackWaitMs(context) {
  const animationConfig = getBattleAnimationConfig(context);
  const projectileMs = Math.max(0, Number(animationConfig.lightDamageProjectileMs || DEFAULT_LIGHT_PROJECTILE_MS));
  const healthChangeMs = Math.max(0, Number(animationConfig.healthChangeMs || 0));
  return projectileMs + healthChangeMs;
}

function getBattleRageTargetIcons(context, boardElement) {
  if (!boardElement) {
    return [];
  }

  const rageConfig = getCurrentBattleRageConfig(context);
  const targetTypes = new Set(normalizeStringList(rageConfig?.targetTypes));
  const targetItemIds = new Set(normalizeStringList(rageConfig?.targetItemIds));
  if (targetTypes.size === 0 && targetItemIds.size === 0) {
    return [];
  }

  const targets = [];
  context.battleState.board.forEach((row, rowIndex) => {
    row.forEach((itemId, colIndex) => {
      const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
      if (!item) {
        return;
      }
      const matchesItem = targetItemIds.has(itemId) || targetItemIds.has(item.itemId);
      const matchesType = item.type && targetTypes.has(item.type);
      if (!matchesItem && !matchesType) {
        return;
      }
      const icon = boardElement.querySelector(`.battle-cell-icon[data-row="${rowIndex}"][data-col="${colIndex}"] img`);
      if (icon) {
        targets.push(icon);
      }
    });
  });
  return targets;
}

function getCurrentBattleRageConfig(context) {
  const stage = getCurrentBattleStageConfig(context);
  return stage?.rage || {};
}

function getCurrentBattleUltimateEffects(context) {
  const stage = getCurrentBattleStageConfig(context);
  return Array.isArray(stage?.ultimate?.effects) ? stage.ultimate.effects : [];
}

function getCurrentBattleStageConfig(context) {
  return context.engine.getCurrentBattleStage(context.battleData.enemyConfig, context.battleState.enemyState);
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim());
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function updateBattleRageTimerDisplay(context, enemyStatsElement) {
  if (!enemyStatsElement) {
    return;
  }

  const rageValueElement = enemyStatsElement.querySelector('[data-battle-stat="enemy-rage"] strong:last-child');
  if (!rageValueElement) {
    return;
  }

  const enemyState = context.battleState.enemyState;
  rageValueElement.textContent = formatBattleSeconds(enemyState?.rage?.current || 0);
}

function applyBattleRageWarningVisualState(context, enemyStatsElement) {
  if (!enemyStatsElement) {
    return;
  }

  const warningSeconds = getClockWarningSeconds(context);
  if (!Array.isArray(warningSeconds) || warningSeconds.length === 0) {
    return;
  }

  const enemyState = context.battleState.enemyState || {};
  const currentRage = Math.max(0, Math.floor(Number(enemyState.rage?.current) || 0));
  const shouldWarn = warningSeconds.includes(currentRage);
  const warningMs = Math.max(0, Math.floor(Number(getClockWarningChangeMs(context)) || 0));
  const warningScale = Number.isFinite(Number(getClockWarningChangeScale(context)))
    ? Number(getClockWarningChangeScale(context))
    : DEFAULT_CLOCK_WARNING_CHANGE_SCALE;

  const rageIcon = enemyStatsElement.querySelector('[data-battle-stat="enemy-rage"] img');
  if (!rageIcon) {
    return;
  }

  if (!shouldWarn) {
    rageIcon.style.removeProperty("--battle-clock-warning-ms");
    rageIcon.style.removeProperty("--battle-clock-warning-scale");
    rageIcon.style.removeProperty("animation");
    rageIcon.classList.remove("battle-scaffold-rage-warning");
    rageIcon.removeAttribute("data-rage-warning");
    return;
  }

  const warningMsValue = `${warningMs}ms`;
  const warningScaleValue = String(Math.max(1, warningScale));
  const warningKey = `${currentRage}:${warningMsValue}:${warningScaleValue}`;
  if (rageIcon.dataset.rageWarning === warningKey && rageIcon.classList.contains("battle-scaffold-rage-warning")) {
    return;
  }

  rageIcon.style.setProperty("--battle-clock-warning-ms", warningMsValue);
  rageIcon.style.setProperty("--battle-clock-warning-scale", warningScaleValue);
  rageIcon.style.animation = "none";
  void rageIcon.offsetWidth;
  rageIcon.classList.add("battle-scaffold-rage-warning");
  rageIcon.style.animation = `battle-clock-warning ${warningMsValue} ease-in-out 1`;
  rageIcon.dataset.rageWarning = warningKey;
}

function updateBattleClockCooldownDisplay(context, specialItemsElement) {
  if (!specialItemsElement) {
    return 0;
  }

  const slot = specialItemsElement.querySelector(`[data-item-id="${CLOCK_ITEM_ID}"]`);
  if (!slot) {
    return;
  }

  const cooldownValue = getClockCooldownSeconds(context);
  let cooldownNode = slot.querySelector(".battle-scaffold-clock-cooldown");

  if (cooldownValue <= 0) {
    if (cooldownNode) {
      cooldownNode.remove();
    }
    return cooldownValue;
  }

  if (!cooldownNode) {
    cooldownNode = document.createElement("strong");
    cooldownNode.className = "battle-scaffold-clock-cooldown";
    slot.append(cooldownNode);
  }

  cooldownNode.textContent = String(cooldownValue);

  return cooldownValue;
}

function handleSpecialItemClick(context, itemId, slot, renderTargets) {
  if (itemId === CLOCK_ITEM_ID) {
    handleClockClick(context, slot, renderTargets);
    return;
  }

  handleToggleActiveSpecial(context, itemId, slot, renderTargets);
}

function handleToggleActiveSpecial(context, itemId, slot, renderTargets) {
  resetBattleIdleTimer(context, renderTargets);
  const uiConfig = getBattleUiConfig(context);
  const activeItemId = context.battleState.activeSpecialItemId;

  if (activeItemId === itemId) {
    changeInventoryQuantity(context.battleState.playerState, itemId, 1);
    clearActiveBattleSpecial(context);
    if (renderTargets) {
      renderBattleInventory(renderTargets.specialItems, renderTargets.handItems, context, renderTargets);
    }
    return;
  }

  if (activeItemId || getInventoryQuantity(context.battleState.playerState, itemId) <= 0) {
    showFloatMessage(
      slot,
      translate(context.request.locale, uiConfig.textKeys.clockUnavailable),
      uiConfig.feedback.floatMessageMs,
    );
    return;
  }

  changeInventoryQuantity(context.battleState.playerState, itemId, -1);
  context.battleState.activeSpecialItemId = itemId;
  context.battleState.specialSwapCell = null;
  renderActiveBattleSpecialCursor(context);
  if (renderTargets) {
    renderBattleInventory(renderTargets.specialItems, renderTargets.handItems, context, renderTargets);
  }
}

function handleClockClick(context, slot, renderTargets) {
  resetBattleIdleTimer(context, renderTargets);
  const uiConfig = getBattleUiConfig(context);
  const quantity = getInventoryQuantity(context.battleState.playerState, CLOCK_ITEM_ID);

  if (context.battleState.activeSpecialItemId || Date.now() < (context.battleState.ragePausedUntil || 0) || quantity <= 0) {
    showFloatMessage(
      slot,
      translate(context.request.locale, uiConfig.textKeys.clockUnavailable),
      uiConfig.feedback.floatMessageMs,
    );
    return;
  }

  const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, CLOCK_ITEM_ID);
  const stopSeconds = Math.max(0, Number(item?.battleTimeStopSeconds) || 0);
  changeInventoryQuantity(context.battleState.playerState, CLOCK_ITEM_ID, -1);
  const pauseStart = Math.max(Date.now(), context.battleState.ragePausedUntil || 0);
  context.battleState.ragePausedUntil = pauseStart + stopSeconds * 1000;

  if (renderTargets?.status) {
    setBattleStatus(context, renderTargets.status, translate(context.request.locale, uiConfig.textKeys.clockUsed));
  }
  if (renderTargets) {
    renderBattleInventory(renderTargets.specialItems, renderTargets.handItems, context, renderTargets);
    updateBattleClockCooldownDisplay(context, renderTargets.specialItems);
  }
}

function getClockCooldownSeconds(context) {
  const remainingMs = (context.battleState.ragePausedUntil || 0) - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function showFloatMessage(anchor, text, durationMs) {
  if (!text) {
    return;
  }

  const duration = Math.max(0, Number(durationMs) || 3000);
  const message = document.createElement("span");
  message.className = "battle-scaffold-float-message";
  message.style.setProperty("--battle-float-ms", `${duration}ms`);
  message.textContent = text;
  anchor.append(message);
  window.setTimeout(() => {
    message.remove();
  }, duration);
}

function attachBattlePointerTracker(context, overlay) {
  context.battlePointer = {
    x: 24,
    y: 24,
    moveHandler: (event) => {
      context.battlePointer.x = event.clientX;
      context.battlePointer.y = event.clientY;
      positionActiveBattleSpecialCursor(context);
    },
  };
  overlay.addEventListener("pointermove", context.battlePointer.moveHandler);
}

function renderActiveBattleSpecialCursor(context) {
  removeActiveBattleSpecialCursor(context);
  const itemId = context.battleState.activeSpecialItemId;
  if (!itemId) {
    return;
  }

  const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
  if (!item?.icon) {
    return;
  }

  const marker = document.createElement("div");
  marker.className = "battle-active-special-cursor";
  marker.dataset.itemId = itemId;

  const image = document.createElement("img");
  image.src = resolveAssetPath(item.icon);
  image.alt = "";
  marker.append(image);
  document.body.append(marker);
  context.battleActiveSpecialCursor = marker;
  positionActiveBattleSpecialCursor(context);
}

function positionActiveBattleSpecialCursor(context) {
  const marker = context.battleActiveSpecialCursor;
  if (!marker || !context.battlePointer) {
    return;
  }

  marker.style.left = `${context.battlePointer.x - 34}px`;
  marker.style.top = `${context.battlePointer.y - 34}px`;
}

function removeActiveBattleSpecialCursor(context) {
  context.battleActiveSpecialCursor?.remove();
  context.battleActiveSpecialCursor = null;
}

function clearActiveBattleSpecial(context) {
  context.battleState.activeSpecialItemId = null;
  context.battleState.specialSwapCell = null;
  removeActiveBattleSpecialCursor(context);
}

function renderBattleBoard(
  boardElement,
  context,
  statusElement,
  enemyStatsElement,
  playerMetersElement,
  ultimateTextElement,
) {
  updateBattleShuffleButtonState(context);
  applyBattleBoardLayout(boardElement, context);
  boardElement.replaceChildren();

  context.battleState.board.forEach((row, rowIndex) => {
    row.forEach((itemId, colIndex) => {
      const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
      const isSelected = isSameCell(context.battleState.selectedCell, { row: rowIndex, col: colIndex });
      const isBoxed = isBattleCellBoxed(context, { row: rowIndex, col: colIndex });
      const isVined = isBattleCellVined(context, { row: rowIndex, col: colIndex });
      const cell = document.createElement("div");

      cell.className = `battle-scaffold-cell${isSelected ? " is-selected" : ""}${isBoxed ? " is-boxed" : ""}${isVined ? " is-vined" : ""}`;
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", getItemLabel(context, item, itemId));
      cell.setAttribute("aria-disabled", String(context.battleState.isResolving || isBoxed || isVined));
      cell.setAttribute("aria-rowindex", String(rowIndex + 1));
      cell.setAttribute("aria-colindex", String(colIndex + 1));
      cell.dataset.row = String(rowIndex);
      cell.dataset.col = String(colIndex);
      cell.style.gridColumn = String(colIndex + 1);
      cell.style.gridRow = String(rowIndex + 1);

      const iconWrap = document.createElement("span");
      iconWrap.className = "battle-cell-icon";
      iconWrap.dataset.row = String(rowIndex);
      iconWrap.dataset.col = String(colIndex);
      iconWrap.style.gridColumn = String(colIndex + 1);
      iconWrap.style.gridRow = String(rowIndex + 1);
      if (item?.icon) {
        const icon = document.createElement("img");
        icon.src = resolveAssetPath(item.icon);
        icon.alt = "";
        iconWrap.append(icon);
      } else {
        iconWrap.textContent = itemId || "?";
      }

      cell.addEventListener("click", async () => {
        const lifecycleToken = context.battleRenderTargets?.lifecycleToken;
        const attemptToken = context.battleRenderTargets?.attemptToken;
        await handleBattleCellClick(context, { row: rowIndex, col: colIndex }, {
          boardElement,
          statusElement,
          enemyStatsElement,
          playerMetersElement,
          ultimateTextElement,
          overlay: context.battleRenderTargets?.overlay,
          resolve: context.battleRenderTargets?.resolve,
          lifecycleToken,
          attemptToken,
        });
        if (!isBattleLifecycleActive(context, lifecycleToken) || !isBattleAttemptActive(context, attemptToken)) {
          return;
        }
        renderBattleStats(enemyStatsElement, playerMetersElement, ultimateTextElement, context);
        renderBattleBoard(
          boardElement,
          context,
          statusElement,
          enemyStatsElement,
          playerMetersElement,
          ultimateTextElement,
        );
      });

      boardElement.append(cell);
      boardElement.append(iconWrap);
    });
  });
  renderBattleWalls(boardElement, context);
  renderBattleBoxes(boardElement, context);
  renderBattleVines(boardElement, context);
}

function renderBattleWalls(boardElement, context) {
  const walls = Array.isArray(context.battleState.walls) ? context.battleState.walls : [];
  const uiConfig = getBattleUiConfig(context);
  const wallIconA = uiConfig.icons.wall_1 || uiConfig.icons.wall || "";
  const wallIconB = uiConfig.icons.wall_2 || uiConfig.icons.wall || wallIconA;
  const wallToggleMs = Math.max(120, Math.floor(Number(uiConfig.animations?.wallToggleMs) || 500));
  const cycleMs = wallToggleMs * 2;
  if (walls.length === 0 || !wallIconA) {
    return;
  }

  for (const wall of walls) {
    const anchor = getBattleWallAnchor(wall);
    if (!anchor) {
      continue;
    }

    const wallElement = document.createElement("span");
    wallElement.className = `battle-board-wall battle-board-wall--${anchor.orientation}`;
    wallElement.setAttribute("aria-hidden", "true");
    wallElement.dataset.wallKey = getBattleWallKey(wall.from, wall.to);
    wallElement.style.gridColumn = String(anchor.rowCol.col + 1);
    wallElement.style.gridRow = String(anchor.rowCol.row + 1);
    wallElement.style.setProperty("--battle-wall-toggle-ms", `${wallToggleMs}ms`);
    wallElement.style.setProperty("--battle-wall-toggle-cycle-ms", `${cycleMs}ms`);

    const imageA = document.createElement("img");
    imageA.className = "battle-board-wall-frame battle-board-wall-frame-a";
    imageA.src = resolveAssetPath(wallIconA);
    imageA.alt = "";
    const imageB = document.createElement("img");
    imageB.className = "battle-board-wall-frame battle-board-wall-frame-b";
    imageB.src = resolveAssetPath(wallIconB);
    imageB.alt = "";
    wallElement.append(imageA, imageB);
    boardElement.append(wallElement);
  }
}

function renderBattleBoxes(boardElement, context) {
  const boxes = Array.isArray(context.battleState.boxes) ? context.battleState.boxes : [];
  const boxIcon = getBattleUiConfig(context).icons.box || "";
  if (boxes.length === 0 || !boxIcon) {
    return;
  }

  for (const box of boxes) {
    if (!box || box.row < 0 || box.col < 0) {
      continue;
    }

    const boxElement = document.createElement("span");
    boxElement.className = "battle-board-box";
    boxElement.setAttribute("aria-hidden", "true");
    boxElement.dataset.row = String(box.row);
    boxElement.dataset.col = String(box.col);
    boxElement.style.gridColumn = String(box.col + 1);
    boxElement.style.gridRow = String(box.row + 1);

    const image = document.createElement("img");
    image.src = resolveAssetPath(boxIcon);
    image.alt = "";
    boxElement.append(image);
    boardElement.append(boxElement);
  }
}

function renderBattleVines(boardElement, context) {
  const vines = Array.isArray(context.battleState.vines) ? context.battleState.vines : [];
  const vineIcon = getBattleUiConfig(context).icons.vines || "";
  if (vines.length === 0 || !vineIcon) {
    return;
  }

  for (const vine of vines) {
    if (!vine || vine.row < 0 || vine.col < 0 || isBattleCellBoxed(context, vine)) {
      continue;
    }

    const vineElement = document.createElement("span");
    vineElement.className = "battle-board-vine";
    vineElement.setAttribute("aria-hidden", "true");
    vineElement.dataset.row = String(vine.row);
    vineElement.dataset.col = String(vine.col);
    vineElement.style.gridColumn = String(vine.col + 1);
    vineElement.style.gridRow = String(vine.row + 1);

    const image = document.createElement("img");
    image.src = resolveAssetPath(vineIcon);
    image.alt = "";
    vineElement.append(image);
    boardElement.append(vineElement);
  }
}

function getBattleWallAnchor(wall) {
  const from = wall?.from;
  const to = wall?.to;
  if (!from || !to) {
    return null;
  }
  if (from.row === to.row && Math.abs(from.col - to.col) === 1) {
    return {
      rowCol: {
        row: from.row,
        col: Math.min(from.col, to.col),
      },
      orientation: "vertical",
    };
  }
  if (from.col === to.col && Math.abs(from.row - to.row) === 1) {
    return {
      rowCol: {
        row: Math.min(from.row, to.row),
        col: from.col,
      },
      orientation: "horizontal",
    };
  }
  return null;
}

async function handleSkullBoardClick(context, cell, renderTargets) {
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  const { boardElement, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement } = renderTargets;
  resetBattleIdleTimer(context, renderTargets);
  context.battleState.isResolving = true;
  context.battleState.selectedCell = null;
  clearActiveBattleSpecial(context);
  renderBattleInventory(context.battleRenderTargets.specialItems, context.battleRenderTargets.handItems, context, context.battleRenderTargets);

  const activatedCells = getBattleAreaCells(context.battleState.board, cell, 1)
    .filter((targetCell) => !isBattleCellBoxed(context, targetCell));
  await animateBattleShakeCells(boardElement, activatedCells, getBattleAnimationConfig(context).matchShakeMs);
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }

  const manualMatches = [{ type: "manual", kind: "special", cells: activatedCells }];
  const beforeEnemyState = {
    health: { current: Number(context.battleState.enemyState?.health?.current || 0) },
    aggression: { current: Number(context.battleState.enemyState?.aggression?.current || 0) },
  };
  const beforePlayerState = context.engine.cloneBattlePlayerState(context.battleState.playerState);
  const effectSummary = context.engine.applyBattleMatchEffects(
    { ...context.battleState, board: context.battleState.board },
    manualMatches,
    context.request.itemCatalog,
    { suppressAggression: true },
  );
  setMatchFeedbackForBattleChange(
    context,
    beforeEnemyState,
    context.battleState.enemyState,
    beforePlayerState,
    context.battleState.playerState,
    effectSummary,
    context.battleState.board,
    manualMatches,
  );
    if (effectSummary.stageChanged) {
      syncBattleWallsWithStage(context, { force: true });
      syncBattleVinesWithStage(context, { force: true });
    }
    renderBattleStats(enemyStatsElement, playerMetersElement, ultimateTextElement, context);
    playBattleItemActivationSounds(context, context.battleState.board, activatedCells);
    await animateBattleDeaths(boardElement, context.battleState.board, activatedCells, context);
    if (!shouldContinueBattle(context, renderTargets)) {
      return;
    }

  const beforeGravityBoard = context.engine.removeBattleMatches(context.battleState.board, manualMatches, {
    boxes: context.battleState.boxes,
  });
  const refillResult = refillBattleBoardFromReserve(context, beforeGravityBoard);
  const nextBoard = refillResult.board;
  const boardMovement = refillResult.movement;
  context.battleState.board = nextBoard;
  if (effectSummary.stageChanged) {
    syncBattleBoxesWithStage(context, { force: true });
    syncBattleVinesWithStage(context, { force: true });
  }
  renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);
  await animateBattleBoardMove(boardElement, boardMovement, context);
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }

  const cascadeResult = await resolveBattleCascades(context.battleState.board, context, {
    boardElement,
    statusElement,
    enemyStatsElement,
    playerMetersElement,
    ultimateTextElement,
    bonusCell: null,
    lifecycleToken: renderTargets.lifecycleToken,
    attemptToken: renderTargets.attemptToken,
  });
  if (cascadeResult.cancelled || !shouldContinueBattle(context, renderTargets)) {
    return;
  }
  mergeEffectSummary(cascadeResult.effects, effectSummary);
  cascadeResult.removedCells += activatedCells.length;
  context.battleState.board = cascadeResult.board;
  context.battleState.lastMoveSummary = cascadeResult;
  context.battleState.isResolving = false;
  setBattleStatus(context, statusElement, formatMoveStatus(context, cascadeResult, context.battleState.enemyState));
  await finishBattleMoveIfNeeded(context, renderTargets);
}

async function handleFreeSwapBoardClick(context, cell, renderTargets) {
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  const { boardElement, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement } = renderTargets;
  resetBattleIdleTimer(context, renderTargets);
  const selectedCell = context.battleState.specialSwapCell;

  if (!selectedCell) {
    context.battleState.specialSwapCell = cell;
    context.battleState.selectedCell = cell;
    renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);
    return;
  }

  if (isSameCell(selectedCell, cell)) {
    context.battleState.specialSwapCell = null;
    context.battleState.selectedCell = null;
    renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);
    return;
  }

  context.battleState.isResolving = true;
  context.battleState.selectedCell = null;
  context.battleState.specialSwapCell = null;
  clearActiveBattleSpecial(context);
  renderBattleInventory(context.battleRenderTargets.specialItems, context.battleRenderTargets.handItems, context, context.battleRenderTargets);

  const swappedBoard = context.engine.swapBattleCells(context.battleState.board, selectedCell, cell);
  await animateBattleSwap(boardElement, selectedCell, cell, getBattleSwapDurationMs(context));
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  context.battleState.board = swappedBoard;
  renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);

  const firstMatches = context.engine.findBattleMatches(swappedBoard, context.request.itemCatalog, {
    boxes: context.battleState.boxes,
    vines: context.battleState.vines,
  });
  if (firstMatches.length > 0) {
    const result = await resolveBattleCascades(swappedBoard, context, {
      boardElement,
      statusElement,
      enemyStatsElement,
      playerMetersElement,
      ultimateTextElement,
      bonusCell: cell,
      lifecycleToken: renderTargets.lifecycleToken,
      attemptToken: renderTargets.attemptToken,
    });
    if (result.cancelled || !shouldContinueBattle(context, renderTargets)) {
      return;
    }
    context.battleState.board = result.board;
    context.battleState.lastMoveSummary = result;
    setBattleStatus(context, statusElement, formatMoveStatus(context, result, context.battleState.enemyState));
  } else {
    setBattleStatus(context, statusElement, translateBattleText(context, "freeSwapDone"));
  }

  context.battleState.isResolving = false;
  await finishBattleMoveIfNeeded(context, renderTargets);
}

async function handleBatteryBoardClick(context, activation, renderTargets) {
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  const { boardElement, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement } = renderTargets;
  resetBattleIdleTimer(context, renderTargets);
  context.battleState.isResolving = true;
  context.battleState.selectedCell = null;

  const activatedCells = activation.cells.filter((targetCell) => (
    !isBattleCellBoxed(context, targetCell) && !isBattleCellVined(context, targetCell)
  ));
  await animateBattleShakeCells(boardElement, activatedCells, getBattleAnimationConfig(context).matchShakeMs);
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }

  const manualMatches = [{
    type: activation.targetType || "battery",
    kind: activation.kind,
    cells: activatedCells,
  }];
  const beforeEnemyState = {
    health: { current: Number(context.battleState.enemyState?.health?.current || 0) },
    aggression: { current: Number(context.battleState.enemyState?.aggression?.current || 0) },
  };
  const beforePlayerState = context.engine.cloneBattlePlayerState(context.battleState.playerState);
  const effectSummary = context.engine.applyBattleMatchEffects(
    { ...context.battleState, board: context.battleState.board },
    manualMatches,
    context.request.itemCatalog,
    { suppressAggression: true },
  );
  setMatchFeedbackForBattleChange(
    context,
    beforeEnemyState,
    context.battleState.enemyState,
    beforePlayerState,
    context.battleState.playerState,
    effectSummary,
    context.battleState.board,
    manualMatches,
  );
  if (effectSummary.stageChanged) {
    syncBattleWallsWithStage(context, { force: true });
    syncBattleVinesWithStage(context, { force: true });
  }
  renderBattleStats(enemyStatsElement, playerMetersElement, ultimateTextElement, context);
  playBattleItemActivationSounds(context, context.battleState.board, activatedCells);
  await animateBattleDeaths(boardElement, context.battleState.board, activatedCells, context);
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }

  const beforeGravityBoard = context.engine.removeBattleMatches(context.battleState.board, manualMatches, {
    boxes: context.battleState.boxes,
    vines: context.battleState.vines,
  });
  const refillResult = refillBattleBoardFromReserve(context, beforeGravityBoard);
  const nextBoard = refillResult.board;
  const boardMovement = refillResult.movement;
  context.battleState.board = nextBoard;
  if (effectSummary.stageChanged) {
    syncBattleBoxesWithStage(context, { force: true });
    syncBattleVinesWithStage(context, { force: true });
  }
  renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);
  await animateBattleBoardMove(boardElement, boardMovement, context);
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }

  const cascadeResult = await resolveBattleCascades(context.battleState.board, context, {
    boardElement,
    statusElement,
    enemyStatsElement,
    playerMetersElement,
    ultimateTextElement,
    bonusCell: null,
    lifecycleToken: renderTargets.lifecycleToken,
    attemptToken: renderTargets.attemptToken,
  });
  if (cascadeResult.cancelled || !shouldContinueBattle(context, renderTargets)) {
    return;
  }
  mergeEffectSummary(cascadeResult.effects, effectSummary);
  cascadeResult.removedCells += activatedCells.length;
  context.battleState.board = cascadeResult.board;
  context.battleState.lastMoveSummary = cascadeResult;
  context.battleState.isResolving = false;
  setBattleStatus(context, statusElement, formatMoveStatus(context, cascadeResult, context.battleState.enemyState));
  await finishBattleMoveIfNeeded(context, renderTargets);
}

async function handleBattleBoxedCellClick(context, cell, renderTargets) {
  const { boardElement, statusElement } = renderTargets;
  resetBattleIdleTimer(context, renderTargets);
  context.battleState.isResolving = true;
  const selectedCell = context.battleState.specialSwapCell || context.battleState.selectedCell;
  await animateBattleBoxBlockedClick(
    boardElement,
    cell,
    selectedCell && !isSameCell(selectedCell, cell) ? selectedCell : null,
    getBattleAnimationConfig(context).invalidShakeMs,
  );
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  if (!context.battleState.activeSpecialItemId) {
    context.battleState.selectedCell = null;
  }
  context.battleState.isResolving = false;
  setBattleStatus(context, statusElement, translateBattleText(context, "boxBlocked"));
  await finishBattleMoveIfNeeded(context, renderTargets);
}

async function handleBattleVinedCellClick(context, cell, renderTargets) {
  const { boardElement, statusElement } = renderTargets;
  resetBattleIdleTimer(context, renderTargets);
  context.battleState.isResolving = true;
  const selectedCell = context.battleState.selectedCell;
  await animateBattleVineBlockedClick(
    boardElement,
    cell,
    selectedCell && !isSameCell(selectedCell, cell) ? selectedCell : null,
    getBattleAnimationConfig(context).invalidShakeMs,
  );
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  context.battleState.selectedCell = null;
  context.battleState.isResolving = false;
  setBattleStatus(context, statusElement, translateBattleText(context, "vinesBlocked"));
  await finishBattleMoveIfNeeded(context, renderTargets);
}

async function handleBattleCellClick(context, cell, renderTargets) {
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  const { boardElement, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement } = renderTargets;
  if (context.battleState.isResolving) {
    return;
  }

  if (isBattleCellBoxed(context, cell)) {
    await handleBattleBoxedCellClick(context, cell, renderTargets);
    return;
  }

  if (context.battleState.activeSpecialItemId === SKULL_ITEM_ID) {
    await handleSkullBoardClick(context, cell, renderTargets);
    return;
  }

  if (context.battleState.activeSpecialItemId === SWAP_ITEM_ID) {
    await handleFreeSwapBoardClick(context, cell, renderTargets);
    return;
  }

  if (isBattleCellVined(context, cell)) {
    await handleBattleVinedCellClick(context, cell, renderTargets);
    return;
  }

  resetBattleIdleTimer(context, renderTargets);
  const selectedCell = context.battleState.selectedCell;
  if (!selectedCell) {
    context.battleState.selectedCell = cell;
    setBattleStatus(context, statusElement, translateBattleText(context, "cellSelected"));
    return;
  }

  if (isSameCell(selectedCell, cell)) {
    context.battleState.selectedCell = null;
    setBattleStatus(context, statusElement, translateBattleText(context, "selectionCleared"));
    return;
  }

  if (!areAdjacentCells(selectedCell, cell)) {
    context.battleState.selectedCell = cell;
    setBattleStatus(context, statusElement, translateBattleText(context, "newCellSelected"));
    return;
  }

  if (context.engine.hasBattleWallBetween(context.battleState.walls, selectedCell, cell)) {
    context.battleState.selectedCell = null;
    context.battleState.isResolving = true;
    await animateBattleWallBlockedSwap(
      boardElement,
      selectedCell,
      cell,
      getBattleAnimationConfig(context).invalidShakeMs,
    );
    if (!shouldContinueBattle(context, renderTargets)) {
      return;
    }
    context.battleState.isResolving = false;
    setBattleStatus(context, statusElement, translateBattleText(context, "wallBlocked"));
    await finishBattleMoveIfNeeded(context, renderTargets);
    return;
  }

  const batteryActivation = context.engine.findBattleBatteryActivation(
    context.battleState.board,
    context.request.itemCatalog,
    selectedCell,
    cell,
    { boxes: context.battleState.boxes, vines: context.battleState.vines },
  );
  if (batteryActivation) {
    await handleBatteryBoardClick(context, batteryActivation, renderTargets);
    return;
  }

  const swappedBoard = context.engine.swapBattleCells(context.battleState.board, selectedCell, cell);
  const firstMatches = context.engine.findBattleMatches(swappedBoard, context.request.itemCatalog, {
    boxes: context.battleState.boxes,
    vines: context.battleState.vines,
  });

  context.battleState.selectedCell = null;
  context.battleState.isResolving = true;
  await animateBattleSwap(boardElement, selectedCell, cell, getBattleSwapDurationMs(context));
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  if (firstMatches.length === 0) {
    await animateBattleShakeCells(boardElement, [selectedCell, cell], getBattleAnimationConfig(context).invalidShakeMs);
    if (!shouldContinueBattle(context, renderTargets)) {
      return;
    }
    context.battleState.isResolving = false;
    setBattleStatus(context, statusElement, translateBattleText(context, "noMatchSwapCancelled"));
    await finishBattleMoveIfNeeded(context, renderTargets);
    return;
  }

  context.battleState.board = swappedBoard;
  renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);
  const turnDamageSummary = applyBattleOrdinarySwapTurnDamage(context);
  if (turnDamageSummary.playerDamage > 0) {
    renderBattleStats(enemyStatsElement, playerMetersElement, ultimateTextElement, context);
    if (isBattlePlayerDefeated(context)) {
      context.battleState.isResolving = false;
      showBattleDefeat(context, renderTargets);
      return;
    }
  }
  const result = await resolveBattleCascades(swappedBoard, context, {
    ...renderTargets,
    bonusCell: cell,
  });
  if (result.cancelled || !shouldContinueBattle(context, renderTargets)) {
    return;
  }
  mergeEffectSummary(result.effects, turnDamageSummary);
  context.battleState.board = result.board;
  context.battleState.lastMoveSummary = result;
  context.battleState.isResolving = false;
  setBattleStatus(context, statusElement, formatMoveStatus(context, result, context.battleState.enemyState));
  await finishBattleMoveIfNeeded(context, renderTargets);
}

function applyBattleOrdinarySwapTurnDamage(context) {
  const summary = createEmptyEffectSummary();
  const turnDamage = context.engine.applyBattleTurnDamage(
    context.battleState,
    context.request.itemCatalog,
    { boxes: context.battleState.boxes },
  );
  const playerDamage = Number(turnDamage?.playerDamage || 0);
  if (playerDamage <= 0) {
    return summary;
  }

  summary.playerDamage = playerDamage;
  setBattleHealthFeedbackDelta(context, "player-health", -playerDamage, {
    sourceElements: getBoardElementsForSourceCells(context, turnDamage.sourceCells),
    disableFallbackSource: true,
  });
  return summary;
}

async function resolveBattleCascades(board, context, renderTargets) {
  const { boardElement, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement } = renderTargets;
  let currentBoard = board;
  let cascades = 0;
  let removedCells = 0;
  let createdBonuses = 0;
  const effects = createEmptyEffectSummary();
  const animationConfig = getBattleAnimationConfig(context);
  const cascadeStepMs = Math.max(0, Number(animationConfig.cascadeStepMs || 0));
  const makeResult = (cancelled = false) => ({
    board: currentBoard,
    cascades,
    removedCells,
    createdBonuses,
    effects,
    cascadeLimitReached: false,
    cancelled,
  });

  while (cascades < MAX_CASCADE_STEPS) {
    if (!shouldContinueBattle(context, renderTargets)) {
      return makeResult(true);
    }
    const matches = context.engine.findBattleMatches(currentBoard, context.request.itemCatalog, {
      boxes: context.battleState.boxes,
      vines: context.battleState.vines,
    });
    if (matches.length === 0) {
      break;
    }

    const matchCells = context.engine.collectBattleMatchCells(matches);
    await animateBattleShakeCells(boardElement, matchCells, getBattleAnimationConfig(context).matchShakeMs);
    if (!shouldContinueBattle(context, renderTargets)) {
      return makeResult(true);
    }
    const beforeEnemyState = {
      health: { current: Number(context.battleState.enemyState?.health?.current || 0) },
      aggression: { current: Number(context.battleState.enemyState?.aggression?.current || 0) },
    };
    const beforePlayerState = context.engine.cloneBattlePlayerState(context.battleState.playerState);
    const effectSummary = context.engine.applyBattleMatchEffects(
      { ...context.battleState, board: currentBoard },
      matches,
      context.request.itemCatalog,
    );
    setMatchFeedbackForBattleChange(
      context,
      beforeEnemyState,
      context.battleState.enemyState,
      beforePlayerState,
      context.battleState.playerState,
      effectSummary,
      currentBoard,
      matches,
    );
    const bonuses = context.engine.createBattleMatchBonuses(currentBoard, matches, context.request.itemCatalog, {
      preferredCell: cascades === 0 ? renderTargets.bonusCell : null,
    });

    cascades += 1;
    removedCells += matchCells.length;
    createdBonuses += bonuses.length;
    mergeEffectSummary(effects, effectSummary);
    if (effectSummary.stageChanged) {
      syncBattleWallsWithStage(context, { force: true });
    }

    renderBattleStats(enemyStatsElement, playerMetersElement, ultimateTextElement, context);
    playBattleItemActivationSounds(context, currentBoard, matchCells);
    await animateBattleDeaths(boardElement, currentBoard, matchCells, context);
    if (!shouldContinueBattle(context, renderTargets)) {
      return makeResult(true);
    }

    const beforeGravityBoard = context.engine.placeBattleBonuses(
      context.engine.removeBattleMatches(currentBoard, matches, {
        boxes: context.battleState.boxes,
        vines: context.battleState.vines,
      }),
      bonuses,
    );
    const refillResult = refillBattleBoardFromReserve(context, beforeGravityBoard);
    currentBoard = refillResult.board;
    const boardMovement = refillResult.movement;
    context.battleState.board = currentBoard;
    if (effectSummary.stageChanged) {
      syncBattleBoxesWithStage(context, { force: true });
      syncBattleVinesWithStage(context, { force: true });
    }
    renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);
    await animateBattleBoardMove(boardElement, boardMovement, context);
    if (!shouldContinueBattle(context, renderTargets)) {
      return makeResult(true);
    }

    if (
      cascadeStepMs > 0
      && context.engine.findBattleMatches(currentBoard, context.request.itemCatalog, {
        boxes: context.battleState.boxes,
        vines: context.battleState.vines,
      }).length > 0
    ) {
      await wait(cascadeStepMs);
      if (!shouldContinueBattle(context, renderTargets)) {
        return makeResult(true);
      }
    }
  }

  const cascadeLimitReached = cascades >= MAX_CASCADE_STEPS
    && context.engine.findBattleMatches(currentBoard, context.request.itemCatalog, {
      boxes: context.battleState.boxes,
      vines: context.battleState.vines,
    }).length > 0;
  if (cascadeLimitReached) {
    addBattleLog(context, translateBattleText(context, "cascadeLimitReached"));
  }

  return { board: currentBoard, cascades, removedCells, createdBonuses, effects, cascadeLimitReached, cancelled: false };
}

async function animateBattleSwap(boardElement, firstCell, secondCell, durationMs) {
  const firstCellElement = getBattleCellElement(boardElement, firstCell);
  const secondCellElement = getBattleCellElement(boardElement, secondCell);
  const firstElement = getBattleCellIconElement(boardElement, firstCell);
  const secondElement = getBattleCellIconElement(boardElement, secondCell);

  if (!firstCellElement || !secondCellElement || !firstElement || !secondElement) {
    await wait(durationMs);
    return;
  }

  const firstRect = firstCellElement.getBoundingClientRect();
  const secondRect = secondCellElement.getBoundingClientRect();
  const firstDelta = {
    x: secondRect.left - firstRect.left,
    y: secondRect.top - firstRect.top,
  };
  const secondDelta = {
    x: firstRect.left - secondRect.left,
    y: firstRect.top - secondRect.top,
  };

  runCellAnimation(firstElement, "is-swapping", durationMs, firstDelta);
  runCellAnimation(secondElement, "is-swapping", durationMs, secondDelta);
  await wait(durationMs);
}

async function animateBattleShakeCells(boardElement, cells, durationMs) {
  for (const cell of cells) {
    const element = getBattleCellIconElement(boardElement, cell);
    if (element) {
      runCellAnimation(element, "is-shaking", durationMs);
    }
  }
  await wait(durationMs);
}

async function animateBattleWallBlockedSwap(boardElement, itemCell, blockedCell, durationMs) {
  const itemElement = getBattleCellIconElement(boardElement, itemCell);
  const wallElement = getBattleWallElement(boardElement, itemCell, blockedCell);

  if (itemElement) {
    runCellAnimation(itemElement, "is-shaking", durationMs);
  }
  if (wallElement) {
    runCellAnimation(wallElement, "is-shaking", durationMs);
  }

  await wait(durationMs);
}

async function animateBattleBoxBlockedClick(boardElement, boxCell, selectedCell, durationMs) {
  const selectedElement = selectedCell ? getBattleCellIconElement(boardElement, selectedCell) : null;
  const boxElement = getBattleBoxElement(boardElement, boxCell);

  if (selectedElement) {
    runCellAnimation(selectedElement, "is-shaking", durationMs);
  }
  if (boxElement) {
    runCellAnimation(boxElement, "is-shaking", durationMs);
  }

  await wait(durationMs);
}

async function animateBattleVineBlockedClick(boardElement, vineCell, selectedCell, durationMs) {
  const selectedElement = selectedCell ? getBattleCellIconElement(boardElement, selectedCell) : null;
  const vineElement = getBattleVineElement(boardElement, vineCell);

  if (selectedElement) {
    runCellAnimation(selectedElement, "is-shaking", durationMs);
  }
  if (vineElement) {
    runCellAnimation(vineElement, "is-shaking", durationMs);
  }

  await wait(durationMs);
}

async function animateBattleDeaths(boardElement, board, cells, context) {
  let maxDurationMs = 0;
  const flightPx = getBattleAnimationConfig(context).deathFlightPx;

  for (const cell of cells) {
    const element = getBattleCellIconElement(boardElement, cell);
    const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, board[cell.row]?.[cell.col]);
    if (!element || !item) {
      continue;
    }

    const durationMs = Math.max(0, Number(item.death_time) || 0.5) * 1000;
    const angle = normalizeDegrees(Number(item.Leave_side) || 0);
    const radians = (angle * Math.PI) / 180;
    element.style.setProperty("--battle-death-x", `${Math.sin(radians) * flightPx}px`);
    element.style.setProperty("--battle-death-y", `${-Math.cos(radians) * flightPx}px`);
    runCellAnimation(element, "is-dying", durationMs);
    maxDurationMs = Math.max(maxDurationMs, durationMs);
  }

  await wait(maxDurationMs);
}

function playBattleItemActivationSounds(context, board, cells) {
  if (typeof Audio === "undefined" || !Array.isArray(cells) || cells.length === 0) {
    return;
  }

  const volume = getBattleSoundVolume(context);
  if (volume <= 0) {
    return;
  }

  const soundPaths = new Set();
  for (const cell of cells) {
    const itemId = board?.[cell.row]?.[cell.col];
    const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
    const soundPath = typeof item?.sound_effect === "string" ? item.sound_effect.trim() : "";
    if (soundPath) {
      soundPaths.add(soundPath);
    }
  }

  if (soundPaths.size === 0) {
    return;
  }

  context.battleActiveItemSounds = context.battleActiveItemSounds || new Set();
  for (const soundPath of soundPaths) {
    const audio = new Audio(resolveAssetPath(soundPath));
    audio.volume = volume;
    const cleanup = () => {
      context.battleActiveItemSounds?.delete(audio);
    };
    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });
    context.battleActiveItemSounds.add(audio);
    audio.play().catch(cleanup);
  }
}

function getBattleSoundVolume(context) {
  const rawVolume = Number(context.request?.settings?.soundVolume);
  if (!Number.isFinite(rawVolume)) {
    return 1;
  }
  return Math.min(1, Math.max(0, rawVolume));
}

async function animateBattleBoardMove(boardElement, movement, context) {
  const animationConfig = getBattleAnimationConfig(context);
  const stepMs = Math.max(0, Number(animationConfig.boardDropMs ?? animationConfig.boardMoveStepMs));
  const newItemSpawnOffsetPx = Math.max(0, Number(animationConfig.newItemSpawnOffsetPx ?? 16));
  const newItemStackGapPx = Math.max(0, Number(animationConfig.newItemStackGapPx || 10));
  const animationPlans = [];

  for (const move of movement) {
    const element = getBattleCellIconElement(boardElement, move.to);
    if (!element) {
      continue;
    }

    const cellElement = getBattleCellElement(boardElement, move.to);
    const cellRect = cellElement?.getBoundingClientRect();
    const cellHeight = Math.max(1, cellRect?.height || 1);
    const newItemStackStepPx = cellHeight + newItemStackGapPx;
    const moveDistanceRows = Math.max(
      1,
      move.isNew
        ? move.to.row + (move.newIndex * (newItemStackStepPx / cellHeight))
        : Math.abs(move.fromRow - move.to.row),
    );
    const delayMs = 0;
    const durationMs = Math.max(stepMs, moveDistanceRows * stepMs);
    const startTranslateY = move.isNew
      ? -((move.to.row * cellHeight) + newItemSpawnOffsetPx + (move.newIndex * newItemStackStepPx))
      : (move.fromRow - move.to.row) * cellHeight;

    animationPlans.push({ element, startTranslateY, durationMs, delayMs });
  }

  const maxDurationMs = animationPlans.reduce(
    (max, plan) => Math.max(max, plan.durationMs + plan.delayMs),
    0,
  );

  for (const plan of animationPlans) {
    const durationMs = Math.max(0, maxDurationMs - plan.delayMs);
    plan.element.style.setProperty("--battle-move-y", `${plan.startTranslateY}px`);
    runCellAnimation(plan.element, "is-moving", durationMs, null, plan.delayMs);
  }

  await wait(maxDurationMs);
}

async function animateBattleShuffle(boardElement, durationMs) {
  for (const element of boardElement.querySelectorAll(".battle-cell-icon")) {
    runCellAnimation(element, "is-shuffling", durationMs);
  }
  await wait(durationMs);
}

async function animateBattleBoardShuffleMovement(boardElement, movement, durationMs) {
  if (!Array.isArray(movement) || movement.length === 0) {
    await wait(durationMs);
    return;
  }

  for (const move of movement) {
    const element = getBattleCellIconElement(boardElement, move.from);
    const fromCellElement = getBattleCellElement(boardElement, move.from);
    const toCellElement = getBattleCellElement(boardElement, move.to);
    if (!element || !fromCellElement || !toCellElement) {
      continue;
    }

    const fromRect = fromCellElement.getBoundingClientRect();
    const toRect = toCellElement.getBoundingClientRect();
    runCellAnimation(element, "is-board-shuffling", durationMs, {
      x: toRect.left - fromRect.left,
      y: toRect.top - fromRect.top,
    });
  }

  await wait(durationMs);
}

function refillBattleBoardFromReserve(context, beforeGravityBoard) {
  ensureBattleReserveBoardForCurrentStage(context);

  const generationConfig = getBattleGenerationConfig(context);
  const refillResult = context.engine.refillBattleBoardFromReserve(
    beforeGravityBoard,
    context.battleState.reserveBoard,
    context.request.itemCatalog,
    {
      ...generationConfig,
      boxes: context.battleState.boxes,
    },
  );
  context.battleState.reserveBoard = refillResult.reserveBoard;
  context.battleState.reserveStageIndex = getCurrentBattleStageIndex(context);
  return refillResult;
}

function showBattleBoardMessage(boardElement, title, body) {
  clearBattleBoardMessage(boardElement);

  const message = document.createElement("div");
  message.className = "battle-scaffold-board-message";

  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  const bodyElement = document.createElement("span");
  bodyElement.textContent = body;

  message.append(titleElement, bodyElement);
  boardElement.append(message);
}

function clearBattleBoardMessage(boardElement) {
  boardElement.querySelector(".battle-scaffold-board-message")?.remove();
}

function runCellAnimation(element, className, durationMs, delta = null, delayMs = 0) {
  if (!element || !className) {
    return;
  }

  const animationState = getBattleElementAnimationState(element, className);
  const safeDurationMs = Math.max(0, Number(durationMs) || 0);
  const safeDelayMs = Math.max(0, Number(delayMs) || 0);
  const clearMs = safeDurationMs + safeDelayMs;

  element.style.setProperty("--battle-animation-ms", `${safeDurationMs}ms`);
  element.style.setProperty("--battle-animation-delay-ms", `${safeDelayMs}ms`);
  if (delta) {
    element.style.setProperty("--battle-swap-x", `${delta.x}px`);
    element.style.setProperty("--battle-swap-y", `${delta.y}px`);
  }

  if (animationState.timeoutId) {
    window.clearTimeout(animationState.timeoutId);
    animationState.timeoutId = null;
  }
  if (animationState.animationEndHandler) {
    element.removeEventListener("animationend", animationState.animationEndHandler);
    animationState.animationEndHandler = null;
  }

  animationState.token += 1;
  const token = animationState.token;

  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);

  const clearAnimation = () => {
    const currentState = getBattleElementAnimationState(element, className);
    if (!currentState || currentState.token !== token) {
      return;
    }
    element.classList.remove(className);
    if (currentState.animationEndHandler) {
      element.removeEventListener("animationend", currentState.animationEndHandler);
      currentState.animationEndHandler = null;
    }
    if (currentState.timeoutId) {
      window.clearTimeout(currentState.timeoutId);
      currentState.timeoutId = null;
    }
  };

  const onAnimationEnd = (event) => {
    if (event && event.target !== element) {
      return;
    }
    clearAnimation();
  };
  element.addEventListener("animationend", onAnimationEnd);
  animationState.animationEndHandler = onAnimationEnd;

  animationState.timeoutId = window.setTimeout(clearAnimation, clearMs);
}

function getBattleElementAnimationState(element, className) {
  let elementAnimationState = battleCellAnimationState.get(element);
  if (!elementAnimationState) {
    elementAnimationState = {};
    battleCellAnimationState.set(element, elementAnimationState);
  }

  let classState = elementAnimationState[className];
  if (!classState) {
    classState = {
      token: 0,
      timeoutId: null,
      timerId: null,
      animationEndHandler: null,
      healthEndHandler: null,
      healthEndElement: null,
    };
    elementAnimationState[className] = classState;
  }

  return classState;
}

function getBattleCellElement(boardElement, cell) {
  return boardElement.querySelector(`.battle-scaffold-cell[data-row="${cell.row}"][data-col="${cell.col}"]`);
}

function getBattleCellIconElement(boardElement, cell) {
  return boardElement.querySelector(`.battle-cell-icon[data-row="${cell.row}"][data-col="${cell.col}"]`);
}

function getBattleWallElement(boardElement, firstCell, secondCell) {
  return boardElement.querySelector(`.battle-board-wall[data-wall-key="${getBattleWallKey(firstCell, secondCell)}"]`);
}

function getBattleBoxElement(boardElement, cell) {
  return boardElement.querySelector(`.battle-board-box[data-row="${cell.row}"][data-col="${cell.col}"]`);
}

function getBattleVineElement(boardElement, cell) {
  return boardElement.querySelector(`.battle-board-vine[data-row="${cell.row}"][data-col="${cell.col}"]`);
}

function getBattleWallKey(firstCell, secondCell) {
  if (!firstCell || !secondCell) {
    return "";
  }
  const firstKey = `${firstCell.row}:${firstCell.col}`;
  const secondKey = `${secondCell.row}:${secondCell.col}`;
  return firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
}

function wait(durationMs) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, durationMs)));
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
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
  const parts = [
    formatBattleStatusPart(context, "moveCells", { value: result.removedCells }),
    formatBattleStatusPart(context, "moveCascades", { value: result.cascades }),
    formatBattleStatusPart(context, "moveDamage", { value: result.effects.damage }),
  ];

  if (result.createdBonuses > 0) {
    parts.push(formatBattleStatusPart(context, "moveBonuses", { value: result.createdBonuses }));
  }
  if (result.effects.healthRecovered > 0) {
    parts.push(formatBattleStatusPart(context, "moveHealthRecovered", { value: result.effects.healthRecovered }));
  }
  if (result.effects.playerDamage > 0) {
    parts.push(formatBattleStatusPart(context, "movePlayerDamage", { value: result.effects.playerDamage }));
  }
  if (enemyState.isDefeated) {
    parts.push(translateBattleText(context, "enemyDefeated"));
  }
  if (result.cascadeLimitReached) {
    parts.push(translateBattleText(context, "cascadeLimitReached"));
  }

  return formatText(
    translateBattleText(context, "moveProcessed"),
    { details: parts.join(", ") },
  );
}

function formatBattleStatusPart(context, key, values) {
  return formatText(translateBattleText(context, key), values);
}

function createScaffoldResult(context, outcome) {
  return createBattleResult({
    outcome,
    nodeId: context.request.nodeId,
    nodeType: context.request.nodeType,
    playerState: context.battleState.playerState,
    rewards: [],
    reward: outcome === BATTLE_OUTCOMES.victory ? context.battleData.enemyConfig?.reward : null,
    logMessages: [...(context.battleLog || [])].reverse(),
  });
}

function closeScaffold(overlay) {
  overlay.remove();
}

function startBattleLifecycle(context) {
  cancelBattleLifecycle(context);
  const token = { cancelled: false };
  context.battleLifecycle = {
    token,
    isFinishing: false,
  };
  return token;
}

function cancelBattleLifecycle(context) {
  if (context.battleLifecycle?.token) {
    context.battleLifecycle.token.cancelled = true;
  }
  cancelBattleAttempt(context);
}

function isBattleLifecycleActive(context, token = context.battleLifecycle?.token) {
  return Boolean(
    token &&
    context.battleLifecycle?.token === token &&
    !token.cancelled
  );
}

function startBattleAttemptLifecycle(context) {
  cancelBattleAttempt(context);
  const token = { cancelled: false };
  context.battleAttempt = { token };
  return token;
}

function cancelBattleAttempt(context) {
  if (context.battleAttempt?.token) {
    context.battleAttempt.token.cancelled = true;
  }
}

function isBattleAttemptActive(context, token = context.battleAttempt?.token) {
  if (!token) {
    return true;
  }

  return Boolean(
    context.battleAttempt?.token === token &&
    !token.cancelled
  );
}

function shouldContinueBattle(context, renderTargets) {
  const token = renderTargets?.lifecycleToken || context.battleRenderTargets?.lifecycleToken;
  const attemptToken = renderTargets?.attemptToken || context.battleRenderTargets?.attemptToken;
  return Boolean(
    isBattleLifecycleActive(context, token) &&
    isBattleAttemptActive(context, attemptToken) &&
    (!renderTargets?.overlay || renderTargets.overlay.isConnected)
  );
}

function normalizeBattleRenderTargets(context, renderTargets = {}) {
  const fullTargets = context.battleRenderTargets || {};
  const normalized = {
    ...fullTargets,
    ...renderTargets,
  };

  normalized.status = renderTargets.status || renderTargets.statusElement || fullTargets.status;
  normalized.statusElement = renderTargets.statusElement || renderTargets.status || fullTargets.status;
  normalized.enemyStats = renderTargets.enemyStats || renderTargets.enemyStatsElement || fullTargets.enemyStats;
  normalized.enemyStatsElement = renderTargets.enemyStatsElement || renderTargets.enemyStats || fullTargets.enemyStats;
  normalized.playerMeters = renderTargets.playerMeters || renderTargets.playerMetersElement || fullTargets.playerMeters;
  normalized.playerMetersElement = renderTargets.playerMetersElement || renderTargets.playerMeters || fullTargets.playerMeters;
  normalized.ultimateText = renderTargets.ultimateText || renderTargets.ultimateTextElement || fullTargets.ultimateText;
  normalized.ultimateTextElement = renderTargets.ultimateTextElement || renderTargets.ultimateText || fullTargets.ultimateText;
  normalized.boardElement = renderTargets.boardElement || fullTargets.boardElement;
  normalized.specialItems = renderTargets.specialItems || fullTargets.specialItems;
  normalized.handItems = renderTargets.handItems || fullTargets.handItems;
  normalized.overlay = renderTargets.overlay || fullTargets.overlay;
  normalized.resolve = renderTargets.resolve || fullTargets.resolve;
  normalized.lifecycleToken = renderTargets.lifecycleToken || fullTargets.lifecycleToken;
  normalized.attemptToken = renderTargets.attemptToken || fullTargets.attemptToken;

  return normalized;
}

function cleanupBattleScaffold(context, overlay) {
  hideBattleTooltip();
  if (typeof context.unsubscribeLanguageChange === "function") {
    context.unsubscribeLanguageChange();
  }
  context.unsubscribeLanguageChange = null;
  removeActiveBattleSpecialCursor(context);
  if (context.battlePointer?.moveHandler) {
    overlay.removeEventListener("pointermove", context.battlePointer.moveHandler);
  }
  context.battlePointer = null;
  if (context.battleHealthFeedbackAnimationState) {
    Object.values(context.battleHealthFeedbackAnimationState).forEach((state) => {
      if (state?.timerId) {
        window.clearTimeout(state.timerId);
      }
    });
    context.battleHealthFeedbackAnimationState = null;
  }
  if (context.battleActiveItemSounds) {
    context.battleActiveItemSounds.forEach((audio) => {
      audio.pause();
      audio.src = "";
    });
    context.battleActiveItemSounds.clear();
  }
}

function translate(locale, key) {
  if (!key) {
    return "";
  }
  return locale?.[key] || key;
}

function translateBattleText(context, textKeyName) {
  return translate(context.request.locale, getBattleUiConfig(context).textKeys[textKeyName]);
}

function formatText(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
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

function ensureBattleStateShape(context) {
  const { battleState, battleData, engine } = context;
  if (!battleState.enemyState) {
    battleState.enemyState = engine.createBattleEnemyState(battleData.enemyConfig);
  }
  if (!battleState.playerState) {
    battleState.playerState = {};
  }
  if (!battleState.playerState.health) {
    battleState.playerState.health = { current: 0, max: 0 };
  }
  if (!battleState.playerState.heal) {
    battleState.playerState.heal = { current: 0, max: 0, health: 0 };
  }
  if (!battleState.initialPlayerState) {
    battleState.initialPlayerState = engine.cloneBattlePlayerState(battleState.playerState);
  }
  if (!("activeSpecialItemId" in battleState)) {
    battleState.activeSpecialItemId = null;
  }
  if (!("specialSwapCell" in battleState)) {
    battleState.specialSwapCell = null;
  }
  if (!("pendingRageAction" in battleState)) {
    battleState.pendingRageAction = false;
  }
  if (!Array.isArray(battleState.walls)) {
    battleState.walls = [];
  }
  if (!Array.isArray(battleState.boxes)) {
    battleState.boxes = [];
  }
  if (!Array.isArray(battleState.vines)) {
    battleState.vines = [];
  }
  if (battleState.board && !battleState.reserveBoard) {
    battleState.reserveBoard = createBattleReserveBoardForCurrentStage(context);
  }
}

function getItemLabel(context, item, itemId) {
  return translate(context.request.locale, item?.nameTextKey) || itemId || "";
}

function getItemDescription(context, item, itemId) {
  return translate(context.request.locale, item?.descriptionTextKey) || "";
}

function getBattleHandItemIds(context) {
  const itemIds = getBattleUiConfig(context).handItemIds;
  return Array.isArray(itemIds) && itemIds.length > 0 ? itemIds : DEFAULT_HAND_ITEM_IDS;
}

function getBattleTooltipDurationMs(context) {
  const settingsValue = Number(context.request?.settings?.battleTooltipMs);
  if (Number.isFinite(settingsValue) && settingsValue >= 0) {
    return settingsValue;
  }

  const configuredValue = Number(getBattleUiConfig(context).feedback?.battleTooltipMs);
  if (Number.isFinite(configuredValue) && configuredValue >= 0) {
    return configuredValue;
  }
  return 3000;
}

function getBattleTooltipDelayMs(context) {
  const settingsValue = Number(context.request?.settings?.battleTooltipDelayMs);
  if (Number.isFinite(settingsValue) && settingsValue >= 0) {
    return settingsValue;
  }

  const configuredValue = Number(getBattleUiConfig(context).feedback?.battleTooltipDelayMs);
  if (Number.isFinite(configuredValue) && configuredValue >= 0) {
    return configuredValue;
  }
  return 3000;
}

function getBattleEnemyShieldMax(context) {
  const configuredValue = Number(getBattleUiConfig(context).limits?.enemyShieldMax);
  if (!Number.isFinite(configuredValue)) {
    return 99;
  }
  return Math.max(0, Math.min(99, Math.floor(configuredValue)));
}

function getBattleUiConfig(context) {
  const config = context.battleData.uiConfig || {};
  return {
    textKeys: {
      enemyStage: "battle.enemy.stage",
      enemyHealth: "battle.enemy.health",
      enemyAggression: "battle.enemy.aggression",
      enemyDamage: "battle.enemy.damage",
      enemyRage: "battle.enemy.rage",
      playerHealth: "battle.player.health",
      playerHeal: "battle.player.heal",
      clockUnavailable: "battle.clock.unavailable",
      clockUsed: "battle.clock.used",
      rageEvent: "battle.rage.event",
      shuffleBoard: "battle.shuffle.button",
      noMovesTitle: "battle.noMoves.title",
      noMovesBody: "battle.noMoves.body",
      victoryTitle: "battle.outcome.victory",
      defeatTitle: "battle.outcome.defeat",
      restartBattle: "battle.outcome.restart",
      restartBattlePending: "battle.outcome.restartPending",
      selectFirstCell: "battle.status.selectFirstCell",
      cellSelected: "battle.status.cellSelected",
      selectionCleared: "battle.status.selectionCleared",
      newCellSelected: "battle.status.newCellSelected",
      wallBlocked: "battle.status.wallBlocked",
      boxBlocked: "battle.status.boxBlocked",
      vinesBlocked: "battle.status.vinesBlocked",
      noMatchSwapCancelled: "battle.status.noMatchSwapCancelled",
      freeSwapDone: "battle.status.freeSwapDone",
      moveProcessed: "battle.status.moveProcessed",
      moveCells: "battle.status.moveCells",
      moveCascades: "battle.status.moveCascades",
      moveDamage: "battle.status.moveDamage",
      moveBonuses: "battle.status.moveBonuses",
      moveHealthRecovered: "battle.status.moveHealthRecovered",
      movePlayerDamage: "battle.status.movePlayerDamage",
      enemyDefeated: "battle.status.enemyDefeated",
      cascadeLimitReached: "battle.status.cascadeLimitReached",
      shuffleBoardDone: "battle.status.shuffleBoardDone",
      ...(config.textKeys || {}),
    },
    topButtons: {
      surrender: {
        textKey: "ui.surrender",
        icon: "data/Assets/icons/surrend.png",
        iconSizePx: 38,
      },
      settings: {
        textKey: "menu.settings",
        icon: "data/Assets/icons/setting.png",
        iconSizePx: 38,
      },
      log: {
        textKey: "ui.eventLog",
        icon: "data/Assets/icons/log.png",
        iconSizePx: 38,
      },
      ...(config.topButtons || {}),
    },
    shuffleButton: {
      textKey: "battle.shuffle.button",
      icon: "data/Assets/icons/mix.png",
      iconSizePx: 64,
      ...(config.shuffleButton || {}),
    },
    handItemIds: Array.isArray(config.handItemIds) ? config.handItemIds : DEFAULT_HAND_ITEM_IDS,
    icons: {
      playerHealth: "data/Assets/icons/hearts.png",
      playerHeal: "data/Assets/item/bandage.png",
      enemyHealth: "data/Assets/icons/hearts.png",
      enemyShield: "data/Assets/item/Shield.png",
      enemyAggression: "data/Assets/icons/agressive.png",
      enemyDamage: "data/Assets/icons/damage.png",
      lightRed: "data/Assets/icons/light_red.png",
      lightBlue: "data/Assets/icons/light_blue.png",
      lightGreen: "data/Assets/icons/light_green.png",
      lightGold: "data/Assets/icons/light_gold.png",
      enemyRage: "data/Assets/icons/rage.png",
      wall: "data/Assets/icons/wall.png",
      wall_1: "data/Assets/icons/wall.png",
      wall_2: "data/Assets/icons/wall.png",
      box: "data/Assets/icons/box.png",
      vines: "data/Assets/icons/vines.png",
      ...(config.icons || {}),
    },
    bars: {
      playerHealthColor: "#c8322a",
      playerHealColor: "#72a343",
      enemyHealthColor: "#c8322a",
      enemyAggressionColor: "#b9d4ec",
      ...(config.bars || {}),
    },
    backgrounds: {
      battleWindow: "data/Assets/backgrounds/battle.png",
      ...(config.backgrounds || {}),
    },
    limits: {
      enemyShieldMax: 99,
      ...(config.limits || {}),
    },
    board: {
      width: 12,
      height: 9,
      ...(config.board || {}),
    },
    feedback: {
      floatMessageMs: 3000,
      battleTooltipMs: 3000,
      battleTooltipDelayMs: 3000,
      ...(config.feedback || {}),
    },
    availableMoveSearch: {
      typeGroups: [
        ["granate", "Knife", "bullet"],
        ["Bandage", "Shield"],
        ["*"],
      ],
      ...(config.availableMoveSearch || {}),
    },
    animations: {
      swapMs: 1000,
      invalidShakeMs: 500,
      matchShakeMs: 500,
      boardMoveMs: 500,
      boardMoveStepMs: 250,
      idleHintDelayMs: 5000,
      idleHintShakeMs: 500,
      boardDropMs: 250,
      itemDropGapMs: 125,
      cascadeStepMs: 150,
      newItemSpawnOffsetPx: 16,
      newItemStackGapPx: 10,
      wallToggleMs: 500,
      lightDamageProjectileCount: DEFAULT_LIGHT_PROJECTILE_COUNT,
      lightDamageProjectilesPerDamage: DEFAULT_LIGHT_PROJECTILES_PER_DAMAGE,
      lightDamageProjectileMs: DEFAULT_LIGHT_PROJECTILE_MS,
      lightDamageProjectileArcHeightPx: DEFAULT_LIGHT_PROJECTILE_ARC_HEIGHT_PX,
      lightDamageProjectileSpreadPx: DEFAULT_LIGHT_PROJECTILE_SPREAD_PX,
      lightDamageProjectileSizePx: DEFAULT_LIGHT_PROJECTILE_SIZE_PX,
      kamikazeBurstDistancePx: 190,
      rageWaveMs: 900,
      rageProjectileCount: 3,
      rageProjectileMs: 800,
      rageProjectileArcHeightPx: DEFAULT_LIGHT_PROJECTILE_ARC_HEIGHT_PX,
      rageProjectileSpreadPx: DEFAULT_LIGHT_PROJECTILE_SPREAD_PX,
      rageProjectileSizePx: 35,
      noMovesMessageMs: 3000,
      noMovesShuffleMs: 2000,
      outcomeBannerMs: 2000,
      healthChangeMs: 3000,
      healthChangeScale: 1.5,
      healthChangeFloatMs: 3000,
      healthChangeFloatRisePx: 120,
      healChangeMs: 3000,
      healChangeScale: 1.5,
      healChangeFloatMs: 3000,
      healChangeFloatRisePx: 120,
      aggressionChangeMs: 3000,
      aggressionChangeScale: 1.5,
      aggressionChangeFloatMs: 3000,
      aggressionChangeFloatRisePx: 120,
      clockWarningSeconds: [1, 3, 5, 10, 15, 20, 30],
      clockWarningChangeMs: 1000,
      clockWarningChangeScale: 1.5,
      deathFlightPx: 96,
      ...(config.animations || {}),
    },
  };
}

function getClockWarningSeconds(context) {
  const parsed = normalizeClockWarningSeconds(getClockWarningConfig(context).seconds);
  return parsed.length > 0 ? parsed : [...DEFAULT_CLOCK_WARNING_SECONDS];
}

function getClockWarningChangeMs(context) {
  return parseClockWarningPositiveNumber(
    getClockWarningConfig(context).changeMs,
    DEFAULT_CLOCK_WARNING_CHANGE_MS,
  );
}

function getClockWarningChangeScale(context) {
  const scale = parseClockWarningPositiveNumber(
    getClockWarningConfig(context).changeScale,
    DEFAULT_CLOCK_WARNING_CHANGE_SCALE,
  );
  return scale < 1 ? DEFAULT_CLOCK_WARNING_CHANGE_SCALE : scale;
}

function getClockWarningConfig(context) {
  const uiConfig = getBattleUiConfig(context);
  const animations = uiConfig?.animations || {};

  const explicitConfig = pickClockWarningConfig(animations.clockWarning)
    || pickClockWarningConfig(uiConfig?.clockWarning);
  if (explicitConfig) {
    return {
      seconds: explicitConfig.seconds,
      changeMs: explicitConfig.changeMs,
      changeScale: explicitConfig.changeScale,
    };
  }

  const fromAnimations = {
    seconds: animations.clockWarningSeconds ?? animations.clockSeconds ?? animations.clockWarning,
    changeMs: animations.clockWarningChangeMs
      ?? animations.clockChangeMs
      ?? animations.clockWarningMs,
    changeScale: animations.clockWarningChangeScale
      ?? animations.clockScale
      ?? animations.clockWarningScale,
  };
  const fromRoot = {
    seconds: uiConfig?.clockWarningSeconds
      ?? uiConfig?.clockSeconds
      ?? uiConfig?.clockWarning,
    changeMs: uiConfig?.clockWarningChangeMs
      ?? uiConfig?.clockChangeMs
      ?? uiConfig?.clockWarningMs
      ?? uiConfig?.feedback?.clockWarningChangeMs,
    changeScale: uiConfig?.clockWarningChangeScale
      ?? uiConfig?.clockScale
      ?? uiConfig?.clockWarningScale
      ?? uiConfig?.feedback?.clockWarningChangeScale,
  };
  return {
    seconds: fromRoot.seconds || fromAnimations.seconds,
    changeMs: fromRoot.changeMs || fromAnimations.changeMs,
    changeScale: fromRoot.changeScale || fromAnimations.changeScale,
  };
}

function pickClockWarningConfig(candidate) {
  if (!candidate) {
    return null;
  }

  if (Array.isArray(candidate)) {
    return { seconds: candidate, changeMs: null, changeScale: null };
  }

  if (typeof candidate !== "object") {
    return null;
  }

  return {
    seconds: candidate.seconds || candidate.secondsList || candidate.warningSeconds || candidate.thresholds,
    changeMs: candidate.changeMs
      || candidate.ms
      || candidate.durationMs
      || candidate.warningMs
      || candidate.clockWarningMs,
    changeScale: candidate.changeScale
      || candidate.scale
      || candidate.warningScale
      || candidate.clockWarningScale,
  };
}

function parseClockWarningPositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function normalizeClockWarningSeconds(rawValue) {
  if (Array.isArray(rawValue)) {
    const parsed = rawValue
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .map((value) => Math.floor(value));
    if (parsed.length > 0 && parsed.every((value) => value > 120)) {
      return parsed
        .map((value) => Math.floor(value / 1000))
        .filter((value) => value >= 0);
    }
    const uniqueSorted = Array.from(new Set(parsed)).sort((left, right) => left - right);
    return uniqueSorted;
  }

  if (typeof rawValue === "string") {
    const parsed = rawValue
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .map((value) => Math.floor(value));
    const uniqueSorted = Array.from(new Set(parsed)).sort((left, right) => left - right);
    return uniqueSorted;
  }

  return [];
}

function getBattleBoardConfig(context) {
  const boardConfig = getBattleUiConfig(context).board;
  return {
    width: normalizeBattleBoardSize(boardConfig.width, 12),
    height: normalizeBattleBoardSize(boardConfig.height, 9),
  };
}

function getBattleGenerationConfig(context) {
  return {
    ...getBattleBoardConfig(context),
    playerState: context.battleState.playerState,
    enemyConvertEffects: getCurrentBattleConvertEffects(context),
  };
}

function getCurrentBattleStageIndex(context) {
  return Math.max(0, Number(context.battleState.enemyState?.stageIndex) || 0);
}

function createBattleReserveBoardForCurrentStage(context) {
  const reserveBoard = context.engine.createBattleReserveBoard(
    context.request.itemCatalog,
    getBattleGenerationConfig(context),
  );
  context.battleState.reserveStageIndex = getCurrentBattleStageIndex(context);
  return reserveBoard;
}

function ensureBattleReserveBoardForCurrentStage(context) {
  if (
    !context.battleState.reserveBoard
    || context.battleState.reserveStageIndex !== getCurrentBattleStageIndex(context)
  ) {
    context.battleState.reserveBoard = createBattleReserveBoardForCurrentStage(context);
  }
}

function getCurrentBattleConvertEffects(context) {
  if (context.battleState.enemyState?.isDefeated) {
    return [];
  }

  const stage = context.engine.getCurrentBattleStage(context.battleData.enemyConfig, context.battleState.enemyState);
  if (stage && Object.prototype.hasOwnProperty.call(stage, "convert")) {
    return Array.isArray(stage.convert) ? stage.convert : [];
  }

  return [];
}

function prepareBattleAttemptState(context) {
  context.battleHealthFeedbackState = {};
  context.battleState.healthFeedbackSuppression = {};
  context.battleState.pendingRageAction = false;
  context.battleState.board = context.engine.createBattleBoard(
    context.request.itemCatalog,
    getBattleGenerationConfig(context),
  );
  context.battleState.reserveBoard = createBattleReserveBoardForCurrentStage(context);
  context.battleState.walls = [];
  context.battleState.boxes = [];
  context.battleState.vines = [];
  context.battleState.wallsInitialized = false;
  context.battleState.boxesInitialized = false;
  context.battleState.vinesInitialized = false;
  syncBattleBoxesWithStage(context, { forceReset: true });
  syncBattleWallsWithStage(context, { forceReset: true });
  syncBattleVinesWithStage(context, { forceReset: true });
}

function syncBattleWallsWithStage(context, options = {}) {
  if (!context.battleState.board) {
    context.battleState.walls = [];
    return;
  }

  const wallCount = getCurrentBattleWallCount(context);

  if (context.battleState.wallsInitialized && !options.forceReset) {
    return;
  }

  context.battleState.walls = context.engine.createBattleWalls(context.battleState.board, {
    count: wallCount,
    boxes: context.battleState.boxes,
  });
  context.battleState.wallCount = wallCount;
  context.battleState.wallsInitialized = true;
}

function syncBattleBoxesWithStage(context, options = {}) {
  if (!context.battleState.board) {
    context.battleState.boxes = [];
    return;
  }

  const boxCount = getCurrentBattleBoxCount(context);

  if (context.battleState.boxesInitialized && !options.forceReset) {
    return;
  }

  context.battleState.boxes = context.engine.createBattleBoxes(context.battleState.board, {
    count: boxCount,
  });
  context.battleState.boxCount = boxCount;
  context.battleState.boxesInitialized = true;
}

function syncBattleVinesWithStage(context, options = {}) {
  if (!context.battleState.board) {
    context.battleState.vines = [];
    return;
  }

  const vineCount = getCurrentBattleVineCount(context);

  if (context.battleState.vinesInitialized && !options.forceReset) {
    return;
  }

  context.battleState.vines = context.engine.createBattleVines(context.battleState.board, {
    count: vineCount,
    boxes: context.battleState.boxes,
  });
  context.battleState.vineCount = vineCount;
  context.battleState.vinesInitialized = true;
}

function getCurrentBattleWallCount(context) {
  if (context.battleState.enemyState?.isDefeated) {
    return 0;
  }

  const stage = context.engine.getCurrentBattleStage(context.battleData.enemyConfig, context.battleState.enemyState);
  const hasStageWall = stage && Object.prototype.hasOwnProperty.call(stage, "wall");
  const rawCount = hasStageWall ? stage.wall : context.battleData.enemyConfig?.wall;
  return Math.max(0, Math.floor(Number(rawCount) || 0));
}

function getCurrentBattleBoxCount(context) {
  if (context.battleState.enemyState?.isDefeated) {
    return 0;
  }

  const stage = context.engine.getCurrentBattleStage(context.battleData.enemyConfig, context.battleState.enemyState);
  const hasStageBox = stage && Object.prototype.hasOwnProperty.call(stage, "box");
  const rawCount = hasStageBox ? stage.box : context.battleData.enemyConfig?.box;
  return Math.max(0, Math.floor(Number(rawCount) || 0));
}

function getCurrentBattleVineCount(context) {
  if (context.battleState.enemyState?.isDefeated) {
    return 0;
  }

  const stage = context.engine.getCurrentBattleStage(context.battleData.enemyConfig, context.battleState.enemyState);
  const hasStageVines = stage && Object.prototype.hasOwnProperty.call(stage, "vines");
  const rawCount = hasStageVines ? stage.vines : context.battleData.enemyConfig?.vines;
  return Math.max(0, Math.floor(Number(rawCount) || 0));
}

function normalizeBattleBoardSize(value, fallback) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(30, Math.max(3, number));
}

function applyBattleBoardLayout(boardElement, context) {
  const boardConfig = getBattleBoardConfig(context);
  boardElement.style.setProperty("--battle-board-width", String(boardConfig.width));
  boardElement.style.setProperty("--battle-board-height", String(boardConfig.height));
  boardElement.setAttribute("aria-colcount", String(boardConfig.width));
  boardElement.setAttribute("aria-rowcount", String(boardConfig.height));
}

function getBattleAnimationConfig(context) {
  return getBattleUiConfig(context).animations;
}

function getBattleSwapDurationMs(context) {
  const animationConfig = getBattleAnimationConfig(context);
  return Math.max(0, Number(animationConfig.swapMoveMs ?? animationConfig.swapMs));
}

function formatBattleSeconds(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
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
  const localizedLabel = translate(context.request.locale, labelTextKey);
  const descriptionKey = `${labelTextKey}.description`;
  const localizedDescription = translate(context.request.locale, descriptionKey);

  return {
    label: localizedLabel,
    description: localizedDescription,
  };
}

function getInventoryQuantity(playerState, itemId) {
  return playerState?.inventory?.find((item) => item.itemId === itemId)?.quantity || 0;
}

function changeInventoryQuantity(playerState, itemId, delta) {
  if (!playerState.inventory) {
    playerState.inventory = [];
  }

  const item = playerState.inventory.find((entry) => entry.itemId === itemId);
  if (item) {
    item.quantity = Math.max(0, (Number(item.quantity) || 0) + delta);
    return item.quantity;
  }

  const quantity = Math.max(0, delta);
  playerState.inventory.push({ itemId, quantity });
  return quantity;
}

function resolveAssetPath(assetPath) {
  if (!assetPath || assetPath.startsWith("http") || assetPath.startsWith("data:") || assetPath.startsWith("blob:")) {
    return assetPath;
  }
  if (assetPath.startsWith("./") || assetPath.startsWith("/")) {
    return appendAssetCacheBuster(assetPath);
  }
  return appendAssetCacheBuster(`./${assetPath}`);
}

function appendAssetCacheBuster(assetPath) {
  const [pathWithoutHash, hash = ""] = assetPath.split("#");
  const separator = pathWithoutHash.includes("?") ? "&" : "?";
  return `${pathWithoutHash}${separator}v=${ASSET_CACHE_BUSTER}${hash ? `#${hash}` : ""}`;
}

function areAdjacentCells(firstCell, secondCell) {
  return Math.abs(firstCell.row - secondCell.row) + Math.abs(firstCell.col - secondCell.col) === 1;
}

function isSameCell(firstCell, secondCell) {
  return firstCell?.row === secondCell?.row && firstCell?.col === secondCell?.col;
}
