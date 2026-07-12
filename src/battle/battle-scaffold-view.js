const BATTLE_ENEMY_TITLE_MAX_FONT_SIZE_PX = 40;
const BATTLE_ENEMY_TITLE_MIN_FONT_SIZE_PX = 14;
const BATTLE_ENEMY_TITLE_FIT_PADDING_PX = 1;

export function showBattleScaffold(deps, context, root) {
  return new Promise((resolve) => {
    deps.ensureBattleStateShape(context);
    context.battleRuntimeHandlers = deps.createBattleRuntimeHandlers();
    const lifecycleToken = deps.startBattleLifecycle(context);
    context.battleLog = [];
    addBattleSeedLog(deps, context);
    deps.prepareBattleAttemptState(context);
    deps.createBattleTrace(context);
    const attemptToken = deps.startBattleAttemptLifecycle(context);

    const overlay = document.createElement("section");
    overlay.className = "battle-scaffold-overlay";
    overlay.setAttribute("aria-label", "Battle test scaffold");

    const topActions = document.createElement("div");
    topActions.className = "battle-top-actions battle-mini-menu-panel";

    const surrenderButton = createBattleTopActionButton(deps, context, "surrender");
    const settingsButton = createBattleTopActionButton(deps, context, "settings");
    const logButton = createBattleTopActionButton(deps, context, "log", "battle-log-button");

    const surrenderConfig = deps.getBattleTopButtonConfig(context, "surrender");
    const settingsConfig = deps.getBattleTopButtonConfig(context, "settings");
    const logConfig = deps.getBattleTopButtonConfig(context, "log");

    deps.attachBattleTooltip(context, surrenderButton, {
      getContent: () => ({
        name: deps.translate(context.request.locale, surrenderConfig.textKey),
        description: deps.translate(context.request.locale, surrenderConfig.textKey),
        icon: surrenderConfig.icon,
      }),
    });
    deps.attachBattleTooltip(context, settingsButton, {
      getContent: () => ({
        name: deps.translate(context.request.locale, settingsConfig.textKey),
        description: deps.translate(context.request.locale, settingsConfig.textKey),
        icon: settingsConfig.icon,
      }),
    });
    deps.attachBattleTooltip(context, logButton, {
      getContent: () => ({
        name: deps.translate(context.request.locale, logConfig.textKey),
        description: deps.translate(context.request.locale, logConfig.textKey),
        icon: logConfig.icon,
      }),
    });
    topActions.append(surrenderButton, settingsButton, logButton);
    const miniMenuOverlay = deps.createBattleMiniMenuOverlay(topActions, context);

    const logOverlay = deps.createBattleLogOverlay(context);

    const panel = document.createElement("div");
    panel.className = "battle-scaffold-panel";
    panel.style.backgroundImage = `url("${deps.resolveAssetPath(deps.getBattleUiConfig(context).backgrounds.battleWindow)}")`;
    const frame = document.createElement("div");
    frame.className = "battle-scaffold-frame";

    const fxLayer = document.createElement("div");
    fxLayer.className = "battle-scaffold-fx-layer";

    const battleUiConfig = deps.getBattleUiConfig(context);
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
    deps.applyBattleBoardLayout(boardElement, context);

    const playerPanel = document.createElement("div");
    playerPanel.className = "battle-scaffold-player-panel";

    const specialItems = document.createElement("div");
    specialItems.className = "battle-scaffold-special-items";

    const playerMeters = document.createElement("div");
    playerMeters.className = "battle-scaffold-player-meters";

    const handItems = document.createElement("div");
    handItems.className = "battle-scaffold-hand-items";
    handItems.className = "battle-scaffold-hand-items battle-scaffold-hand-items-hidden";
    const inventoryOverlay = deps.createBattleInventoryOverlay(handItems, context);

    const enemyVisual = deps.createEnemyVisual(context);

    const enemyHeaderRow = document.createElement("div");
    enemyHeaderRow.className = "battle-scaffold-enemy-header-row";

    const enemyHeader = document.createElement("div");
    enemyHeader.className = "battle-scaffold-enemy-header";

    const enemyInfo = document.createElement("div");
    enemyInfo.className = "battle-scaffold-enemy-info";

    const title = document.createElement("h2");
    title.textContent = deps.translate(context.request.locale, context.battleData.enemyConfig?.nameTextKey)
      || context.request.enemyId;

    const enemyStats = document.createElement("div");
    enemyStats.className = "battle-scaffold-stats";

    const enemyStage = document.createElement("div");
    enemyStage.className = "battle-scaffold-enemy-stage";

    const enemyHeaderValues = document.createElement("div");
    enemyHeaderValues.className = "battle-scaffold-enemy-header-values";

    const menuButton = deps.createBattleHeaderMenuButton(context);

    const ultimateText = document.createElement("p");
    ultimateText.className = "battle-scaffold-ultimate";

    const shuffleButtonConfig = battleUiConfig.shuffleButton || {};
    const shuffleTextKey = shuffleButtonConfig.textKey || deps.getBattleUiConfig(context).textKeys.shuffleBoard;
    const shuffleIconPath = shuffleButtonConfig.icon
      || battleUiConfig.shuffleIcon
      || deps.getBattleUiConfig(context).shuffleIcon
      || "data/Assets/icons/mix.png";
    const shuffleButtonSize = shuffleButtonConfig.iconSizePx;
    const shuffleButton = document.createElement("button");
    shuffleButton.type = "button";
    shuffleButton.className = "battle-scaffold-shuffle-button";
    shuffleButton.setAttribute("aria-label", deps.translate(context.request.locale, shuffleTextKey));
    const shuffleIcon = document.createElement("img");
    shuffleIcon.className = "battle-scaffold-shuffle-icon";
    shuffleIcon.src = deps.resolveAssetPath(shuffleIconPath);
    shuffleIcon.alt = "";
    shuffleIcon.loading = "lazy";
    const shuffleIconSize = Number(
      Number.isFinite(Number(shuffleButtonSize)) ? Number(shuffleButtonSize) : 64,
    );
    shuffleButton.style.setProperty("--battle-shuffle-size", `${shuffleIconSize}px`);
    shuffleButton.append(shuffleIcon);

    const status = document.createElement("p");
    status.className = "battle-scaffold-status";
    deps.setBattleStatus(context, status, deps.translateBattleText(context, "selectFirstCell"));

    leftColumn.append(boardElement, playerMeters, playerPanel, specialItems);

    const leftBottom = document.createElement("div");
    leftBottom.className = "battle-scaffold-left-bottom";
    const enemyHeaderTitle = document.createElement("div");
    enemyHeaderTitle.className = "battle-scaffold-enemy-title";
    enemyHeaderTitle.append(title, enemyStage);

    enemyHeader.append(enemyHeaderTitle);
    enemyHeaderRow.append(enemyHeader, menuButton);
    enemyInfo.append(enemyStats, ultimateText);
    rightColumn.append(enemyHeaderRow, enemyVisual, enemyInfo, enemyHeaderValues);
    leftBottom.append(shuffleButton);
    layout.append(leftColumn, rightColumn, leftBottom);
    panel.append(layout);
    frame.append(panel);
    overlay.append(frame, miniMenuOverlay, inventoryOverlay, logOverlay, fxLayer);
    root.append(overlay);

    const alignBattleSideWidgetsToBoardRightEdge = () => {
      const boardRect = boardElement.getBoundingClientRect();
      const leftColumnRect = leftColumn.getBoundingClientRect();
      const buttonRect = shuffleButton.getBoundingClientRect();
      if (!Number.isFinite(boardRect.width) || !Number.isFinite(buttonRect.width) || !Number.isFinite(leftColumnRect.left)) {
        return;
      }
      const battleScale = getBattleRenderedScale(panel);
      const offset = Math.max(0, (boardRect.right - leftColumnRect.left - buttonRect.width) / battleScale + 200);
      leftBottom.style.setProperty("--battle-shuffle-container-left-offset", `${offset}px`);
      const specialItemsOffset = (boardRect.left - leftColumnRect.left) / battleScale - 125;
      specialItems.style.setProperty("--battle-special-items-left-offset", `${specialItemsOffset}px`);
      deps.alignBattleBagSlotToHealMeter(renderTargets);
    };

    // renderTargets - общий набор DOM-ручек для всех battle flow. Его кладем в
    // context, чтобы popover/rage/resolution не искали элементы заново.
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
      menuButton,
      miniMenuOverlay,
      inventoryOverlay,
      shuffleButton,
      logOverlay,
      battleFxLayer: fxLayer,
      overlay,
      frame,
      panel,
      resolve,
      lifecycleToken,
      attemptToken,
    };
    renderTargets.fitBattleEnemyTitle = () => fitBattleEnemyTitle(renderTargets);
    context.battleRenderTargets = renderTargets;
    renderTargets.cleanupBattleViewportScale = setupBattleViewportScale(
      deps,
      context,
      overlay,
      frame,
      panel,
      renderTargets,
      alignBattleSideWidgetsToBoardRightEdge,
    );
    deps.attachBattlePointerTracker(context, overlay);
    deps.attachBattleLanguageChangeListener(context, renderTargets);
    deps.attachBattleCheatCommands?.(context, renderTargets);

    deps.renderBattleStats(enemyStats, playerMeters, ultimateText, context);
    deps.renderBattleInventory(specialItems, handItems, context, renderTargets);
    deps.renderBattleBoard(boardElement, context, status, enemyStats, playerMeters, ultimateText);
    deps.startBattleRuntime(context, renderTargets);
    scheduleBattleEnemyTitleFit(renderTargets);
    requestAnimationFrame(alignBattleSideWidgetsToBoardRightEdge);

    logButton.addEventListener("click", () => {
      deps.closeBattleMiniMenu(context, renderTargets);
      deps.renderBattleLog(logOverlay, context);
      logOverlay.classList.remove("hidden");
    });

    settingsButton.addEventListener("click", () => {
      deps.closeBattleMiniMenu(context, renderTargets, { resume: false });
      deps.openBattleSettings(context, renderTargets);
    });

    surrenderButton.addEventListener("click", () => {
      deps.closeBattleMiniMenu(context, renderTargets, { resume: false });
      deps.openBattleSurrender(context, renderTargets);
    });

    shuffleButton.addEventListener("click", () => {
      deps.handleManualBattleShuffle(context, renderTargets);
    });
  });
}

function addBattleSeedLog(deps, context) {
  if (!context.request?.seed || !context.request?.seedName) {
    return;
  }

  deps.addBattleLog(
    context,
    formatText(deps.translate(context.request.locale, "log.battleSeed"), {
      name: context.request.seedName,
      seed: context.request.seed,
    }),
  );
}

function formatText(template, values) {
  return Object.entries(values).reduce((text, [name, value]) => {
    return text.replaceAll(`{${name}}`, String(value));
  }, String(template || ""));
}

export function createBattleTopActionButton(deps, context, actionId, additionalClassName = "") {
  const config = deps.getBattleTopButtonConfig(context, actionId);
  const label = deps.translate(context.request.locale, config.textKey);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `battle-top-button${additionalClassName ? ` ${additionalClassName}` : ""}`;
  button.setAttribute("aria-label", label);
  button.style.setProperty("--battle-top-button-icon-size", `${config.iconSizePx}px`);

  if (config.icon) {
    const icon = document.createElement("img");
    icon.className = "battle-top-button-icon";
    icon.src = deps.resolveAssetPath(config.icon);
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

export function applyBattlePopoverScale(deps, element, scale) {
  if (!element) {
    return;
  }

  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  element.style.setProperty("--battle-current-scale", String(safeScale));
  element.style.setProperty("--battle-popup-menu-gap", `${deps.BATTLE_POPUP_MENU_GAP_PX * safeScale}px`);
  element.style.setProperty("--battle-popup-inventory-gap", `${deps.BATTLE_POPUP_INVENTORY_GAP_PX * safeScale}px`);
  element.style.setProperty("--battle-popup-padding", `${deps.BATTLE_POPUP_PADDING_PX * safeScale}px`);
  element.style.setProperty("--battle-popup-radius", `${deps.BATTLE_POPUP_RADIUS_PX * safeScale}px`);
  element.style.setProperty("--battle-popup-shift", `${deps.BATTLE_POPUP_SHIFT_PX * safeScale}px`);
  element.style.setProperty("--battle-popup-edge-gap", `${deps.BATTLE_POPUP_EDGE_GAP_PX * safeScale}px`);
  element.style.setProperty("--battle-popup-slot-size", `${deps.BATTLE_POPUP_INVENTORY_SLOT_PX * safeScale}px`);
  element.style.setProperty("--battle-popup-top-button-size", `${deps.BATTLE_POPUP_TOP_BUTTON_SIZE_PX * safeScale}px`);
  element.style.setProperty("--battle-popup-top-button-radius", `${deps.BATTLE_POPUP_TOP_BUTTON_RADIUS_PX * safeScale}px`);
  element.style.setProperty(
    "--battle-popup-quantity-font-size",
    `${deps.BATTLE_POPUP_INVENTORY_QUANTITY_FONT_PX * safeScale}px`,
  );
  element.style.setProperty(
    "--battle-popup-quantity-offset-x",
    `${deps.BATTLE_POPUP_INVENTORY_QUANTITY_OFFSET_X_PX * safeScale}px`,
  );
  element.style.setProperty(
    "--battle-popup-quantity-offset-y",
    `${deps.BATTLE_POPUP_INVENTORY_QUANTITY_OFFSET_Y_PX * safeScale}px`,
  );
  element.style.setProperty(
    "--battle-popup-quantity-min-width",
    `${deps.BATTLE_POPUP_INVENTORY_QUANTITY_MIN_WIDTH_PX * safeScale}px`,
  );
}

export function setupBattleViewportScale(deps, context, overlay, frame, panel, renderTargets, afterApply) {
  const applyScale = () => {
    if (!overlay?.isConnected || !frame?.isConnected || !panel?.isConnected) {
      return;
    }

    const layout = getBattleLayoutConfig(deps, context);
    const viewport = getBattleViewportSize(deps);
    const availableWidth = Math.max(1, viewport.width - layout.viewportPaddingPx * 2);
    const availableHeight = Math.max(1, viewport.height - layout.viewportPaddingPx * 2);
    const coverScale = Math.max(
      availableWidth / layout.designWidthPx,
      availableHeight / layout.designHeightPx,
    );
    const scale = coverScale > 1
      ? (layout.allowUpscale ? 1 + (coverScale - 1) * layout.upscaleFactor : 1)
      : Math.max(coverScale, layout.minScale);

    overlay.style.setProperty("--battle-viewport-padding", `${layout.viewportPaddingPx}px`);
    frame.style.width = `${layout.designWidthPx * scale}px`;
    frame.style.height = `${layout.designHeightPx * scale}px`;
    frame.style.setProperty("--battle-design-width", `${layout.designWidthPx}px`);
    frame.style.setProperty("--battle-design-height", `${layout.designHeightPx}px`);
    frame.style.setProperty("--battle-scale", String(scale));
    overlay.style.setProperty("--battle-current-scale", String(scale));
    applyBattlePopoverScale(deps, renderTargets.miniMenuOverlay, scale);
    applyBattlePopoverScale(deps, renderTargets.inventoryOverlay, scale);
    panel.style.setProperty("--battle-design-width", `${layout.designWidthPx}px`);
    panel.style.setProperty("--battle-design-height", `${layout.designHeightPx}px`);
    panel.style.setProperty("--battle-scale", String(scale));
    panel.dataset.battleScale = String(scale);
    renderTargets.battleScale = scale;

    requestAnimationFrame(() => {
      if (!deps.shouldContinueBattle(context, renderTargets)) {
        return;
      }
      fitBattleEnemyTitle(renderTargets);
      if (typeof afterApply === "function") {
        afterApply();
      }
      if (context.battleState?.isMiniMenuOpen) {
        deps.positionBattleMiniMenu(context, renderTargets);
      }
      if (context.battleState?.isInventoryOpen) {
        deps.positionBattleInventory(context, renderTargets);
      }
    });
  };

  const resizeTarget = window.visualViewport || window;
  resizeTarget.addEventListener("resize", applyScale);
  window.addEventListener("orientationchange", applyScale);
  context.cleanupBattleViewportScale = () => {
    resizeTarget.removeEventListener("resize", applyScale);
    window.removeEventListener("orientationchange", applyScale);
  };
  applyScale();
  return context.cleanupBattleViewportScale;
}

export function getBattleViewportSize(deps) {
  if (typeof window === "undefined") {
    return { width: deps.DEFAULT_BATTLE_LAYOUT.designWidthPx, height: deps.DEFAULT_BATTLE_LAYOUT.designHeightPx };
  }
  const visualViewport = window.visualViewport;
  const viewport = {
    width: Number(visualViewport?.width) || window.innerWidth || document.documentElement.clientWidth || deps.DEFAULT_BATTLE_LAYOUT.designWidthPx,
    height: Number(visualViewport?.height) || window.innerHeight || document.documentElement.clientHeight || deps.DEFAULT_BATTLE_LAYOUT.designHeightPx,
  };
  if (document.documentElement.classList.contains("is-forced-landscape")) {
    return {
      width: viewport.height,
      height: viewport.width,
    };
  }
  return viewport;
}

export function scheduleBattleEnemyTitleFit(renderTargets) {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => fitBattleEnemyTitle(renderTargets));
    return;
  }
  fitBattleEnemyTitle(renderTargets);
}

export function fitBattleEnemyTitle(renderTargets) {
  const title = renderTargets?.title;
  if (!title?.isConnected || !title.textContent.trim()) {
    return;
  }

  title.style.setProperty(
    "--battle-enemy-title-font-size",
    `${BATTLE_ENEMY_TITLE_MAX_FONT_SIZE_PX}px`,
  );

  let fontSize = BATTLE_ENEMY_TITLE_MAX_FONT_SIZE_PX;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const availableWidth = Number(title.clientWidth) || 0;
    const requiredWidth = Number(title.scrollWidth) || 0;
    if (availableWidth <= 0 || requiredWidth <= 0) {
      return;
    }
    if (requiredWidth <= availableWidth + BATTLE_ENEMY_TITLE_FIT_PADDING_PX) {
      return;
    }

    const nextFontSize = Math.max(
      BATTLE_ENEMY_TITLE_MIN_FONT_SIZE_PX,
      Math.floor((fontSize * availableWidth / requiredWidth) * 10) / 10,
    );
    if (nextFontSize >= fontSize) {
      return;
    }

    fontSize = nextFontSize;
    title.style.setProperty("--battle-enemy-title-font-size", `${fontSize}px`);
  }
}

export function getBattleLayoutConfig(deps, context) {
  const layout = deps.getBattleUiConfig(context).layout || {};
  const designWidthPx = getPositiveBattleLayoutNumber(
    layout.designWidthPx,
    deps.DEFAULT_BATTLE_LAYOUT.designWidthPx,
  );
  const designHeightPx = getPositiveBattleLayoutNumber(
    layout.designHeightPx,
    deps.DEFAULT_BATTLE_LAYOUT.designHeightPx,
  );
  const viewportPaddingPx = Math.max(0, getFiniteBattleLayoutNumber(
    layout.viewportPaddingPx,
    deps.DEFAULT_BATTLE_LAYOUT.viewportPaddingPx,
  ));
  const upscaleFactor = clampBattleLayoutNumber(
    getFiniteBattleLayoutNumber(layout.upscaleFactor, deps.DEFAULT_BATTLE_LAYOUT.upscaleFactor),
    0,
    1,
  );
  const minScale = clampBattleLayoutNumber(
    getFiniteBattleLayoutNumber(layout.minScale, deps.DEFAULT_BATTLE_LAYOUT.minScale),
    0.1,
    2,
  );

  return {
    designWidthPx,
    designHeightPx,
    viewportPaddingPx,
    allowUpscale: typeof layout.allowUpscale === "boolean"
      ? layout.allowUpscale
      : deps.DEFAULT_BATTLE_LAYOUT.allowUpscale,
    upscaleFactor,
    minScale,
  };
}

function getPositiveBattleLayoutNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getFiniteBattleLayoutNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampBattleLayoutNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getBattleRenderedScale(panel) {
  const parsed = Number(panel?.dataset?.battleScale || panel?.style?.getPropertyValue("--battle-scale"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function normalizeBattleRenderTargets(context, renderTargets = {}) {
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
  normalized.inventoryOverlay = renderTargets.inventoryOverlay || fullTargets.inventoryOverlay;
  normalized.overlay = renderTargets.overlay || fullTargets.overlay;
  normalized.resolve = renderTargets.resolve || fullTargets.resolve;
  normalized.lifecycleToken = renderTargets.lifecycleToken || fullTargets.lifecycleToken;
  normalized.attemptToken = renderTargets.attemptToken || fullTargets.attemptToken;

  return normalized;
}

export function cleanupBattleScaffold(deps, context, overlay) {
  deps.hideBattleTooltip();
  if (typeof context.cleanupBattleViewportScale === "function") {
    context.cleanupBattleViewportScale();
  }
  context.cleanupBattleViewportScale = null;
  if (typeof context.unsubscribeLanguageChange === "function") {
    context.unsubscribeLanguageChange();
  }
  context.unsubscribeLanguageChange = null;
  if (typeof context.cleanupBattleCheatCommands === "function") {
    context.cleanupBattleCheatCommands();
  }
  context.cleanupBattleCheatCommands = null;
  deps.removeActiveBattleSpecialCursor(context);
  if (context.battlePointer?.moveHandler && overlay) {
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
