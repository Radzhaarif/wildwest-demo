export function renderBattleInventory(deps, specialItemsElement, handItemsElement, context, renderTargets = null) {
  const specialSlots = deps.SPECIAL_ITEM_IDS.map((itemId) => createInventorySlot(
      deps,
      context,
      itemId,
      {
        onClick: (slot) => handleSpecialItemClick(deps, context, itemId, slot, renderTargets),
      },
    ));
  const goldSlot = createInventorySlot(deps, context, deps.GOLD_ITEM_ID, {
    onClick: (slot) => handleGoldItemClick(deps, context, slot, renderTargets),
  });
  const bagSlot = createInventorySlot(deps, context, deps.BAG_ITEM_ID, {
    iconOverride: "data/Assets/icons/bag.png",
    showQuantity: false,
    name: deps.translate(context.request.locale, "ui.bag") || "Bag",
    description: "",
    onClick: () => deps.toggleBattleInventory(context, renderTargets),
  });
  if (context.battleState.isInventoryOpen) {
    bagSlot.classList.add("is-active");
  }

  specialItemsElement.replaceChildren(
    ...specialSlots,
    goldSlot,
    bagSlot,
  );
  updateBattleClockCooldownDisplay(deps, context, specialItemsElement);
  updateBattleHeaderMenuButton(deps, context, renderTargets);
  alignBattleBagSlotToHealMeter(deps, renderTargets);
  handItemsElement.replaceChildren(
    ...deps.getBattleHandItemIds(context).map((itemId) => createInventorySlot(deps, context, itemId)),
  );
}

export function alignBattleBagSlotToHealMeter(deps, renderTargets) {
  const specialItemsElement = renderTargets?.specialItems;
  const playerMetersElement = renderTargets?.playerMeters;
  const panel = renderTargets?.panel;
  if (!specialItemsElement || !playerMetersElement || !panel) {
    return;
  }

  const bagSlot = specialItemsElement.querySelector(`[data-item-id="${deps.BAG_ITEM_ID}"]`);
  const healMeter = playerMetersElement.querySelector('[data-battle-stat-id="player-heal"]');
  const bagRect = bagSlot?.getBoundingClientRect();
  const healRect = healMeter?.getBoundingClientRect();
  if (
    !bagSlot ||
    !bagRect ||
    !healRect ||
    !Number.isFinite(bagRect.bottom) ||
    !Number.isFinite(healRect.bottom)
  ) {
    return;
  }

  const battleScale = deps.getBattleRenderedScale(panel);
  const currentMargin = Number.parseFloat(
    bagSlot.style.getPropertyValue("--battle-bag-slot-margin-top")
  ) || 0;
  const nextMargin = Math.max(0, currentMargin + (healRect.bottom - bagRect.bottom) / battleScale);
  bagSlot.style.setProperty("--battle-bag-slot-margin-top", `${nextMargin}px`);
}

export function createBattleHeaderMenuButton(deps, context) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "battle-scaffold-header-menu-button";
  button.dataset.itemId = deps.LITTLE_MENU_ITEM_ID;
  const label = getBattleMenuLabel(deps, context);
  button.dataset.itemLabel = label;
  button.dataset.itemDescription = "";
  button.setAttribute("aria-label", label);
  const icon = "data/Assets/icons/little_menu.png";
  button.dataset.itemIcon = deps.resolveAssetPath(icon);

  const image = document.createElement("img");
  image.src = deps.resolveAssetPath(icon);
  image.alt = "";
  image.loading = "lazy";
  button.append(image);

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    deps.toggleBattleMiniMenu(context, context.battleRenderTargets);
  });

  deps.attachBattleInventoryTooltip(context, button, {
    name: () => getBattleMenuLabel(deps, context),
    description: "",
    icon: button.dataset.itemIcon,
  });

  return button;
}

export function updateBattleHeaderMenuButton(deps, context, renderTargets) {
  const button = renderTargets?.menuButton;
  if (!button) {
    return;
  }

  const label = getBattleMenuLabel(deps, context);
  button.dataset.itemLabel = label;
  button.setAttribute("aria-label", label);
  button.classList.toggle("is-active", Boolean(context?.battleState?.isMiniMenuOpen));
}

export function getBattleMenuLabel(deps, context) {
  const battleMenuKey = deps.translate(context.request.locale, "ui.battleMenu");
  if (battleMenuKey && battleMenuKey !== "ui.battleMenu") {
    return battleMenuKey;
  }
  return deps.translate(context.request.locale, "menu.settings") || "Menu";
}

export function updateBattleClockCooldownDisplay(deps, context, specialItemsElement) {
  if (!specialItemsElement) {
    clearBattleClockCooldownRefresh(context);
    return 0;
  }

  const slot = specialItemsElement.querySelector(`[data-item-id="${deps.CLOCK_ITEM_ID}"]`);
  if (!slot) {
    clearBattleClockCooldownRefresh(context);
    return 0;
  }

  const { remainingMs, seconds: cooldownValue } = getClockCooldownState(context);
  let cooldownNode = slot.querySelector(".battle-scaffold-clock-cooldown");
  syncBattleClockSlotVisualState(deps, context, slot, cooldownValue);

  if (cooldownValue <= 0) {
    if (cooldownNode) {
      cooldownNode.remove();
    }
    clearBattleClockCooldownRefresh(context);
    return cooldownValue;
  }

  if (!cooldownNode) {
    cooldownNode = document.createElement("strong");
    cooldownNode.className = "battle-scaffold-clock-cooldown";
    slot.append(cooldownNode);
  }

  cooldownNode.textContent = String(cooldownValue);
  scheduleBattleClockCooldownRefresh(deps, context, specialItemsElement, remainingMs);

  return cooldownValue;
}

export function attachBattlePointerTracker(deps, context, overlay) {
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

export function renderActiveBattleSpecialCursor(deps, context) {
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
  image.src = deps.resolveAssetPath(item.icon);
  image.alt = "";
  marker.append(image);
  document.body.append(marker);
  context.battleActiveSpecialCursor = marker;
  positionActiveBattleSpecialCursor(context);
}

export function positionActiveBattleSpecialCursor(context) {
  const marker = context.battleActiveSpecialCursor;
  if (!marker || !context.battlePointer) {
    return;
  }

  marker.style.left = `${context.battlePointer.x - 34}px`;
  marker.style.top = `${context.battlePointer.y - 34}px`;
}

export function removeActiveBattleSpecialCursor(context) {
  context.battleActiveSpecialCursor?.remove();
  context.battleActiveSpecialCursor = null;
}

export function clearActiveBattleSpecial(deps, context) {
  context.battleState.activeSpecialItemId = null;
  context.battleState.specialSwapCell = null;
  deps.clearBattleGoldTargetPreview(context);
  removeActiveBattleSpecialCursor(context);
}

function createInventorySlot(deps, context, itemId, options = {}) {
  const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
  const slot = document.createElement("div");
  slot.className = "battle-scaffold-inventory-slot";
  slot.dataset.itemId = itemId;
  const itemLabel = options.name || deps.getItemLabel(context, item, itemId);
  slot.dataset.itemLabel = itemLabel;
  const itemDescription = options.description || deps.getItemDescription(context, item, itemId);
  slot.dataset.itemDescription = itemDescription;
  slot.setAttribute("aria-label", itemLabel);
  const itemIcon = options.iconOverride || item?.icon;
  if (itemIcon) {
    slot.dataset.itemIcon = deps.resolveAssetPath(itemIcon);
  }
  const isClock = itemId === deps.CLOCK_ITEM_ID;
  const shouldShowQuantity = options.showQuantity !== false;
  const itemQuantity = deps.getInventoryQuantity(context.battleState.playerState, itemId);
  const activeSpecialItemId = context.battleState.activeSpecialItemId;
  const clockCooldownSeconds = isClock ? getClockCooldownState(context).seconds : 0;
  const isActiveSpecial = activeSpecialItemId === itemId;
  const isBattleActiveItem = deps.ACTIVE_BATTLE_ITEM_IDS.includes(itemId);
  const isTutorialUnavailable = (isBattleActiveItem || itemId === deps.GOLD_ITEM_ID)
    && !deps.isBattleTutorialInventoryItemAllowed(context, itemId);
  const isBlockedByOtherSpecial = Boolean(activeSpecialItemId && activeSpecialItemId !== itemId && isBattleActiveItem);
  const isClockUnavailable = isClock
    && (clockCooldownSeconds > 0 || itemQuantity <= 0);
  const isSpecialUnavailable = isBattleActiveItem
    && !isActiveSpecial
    && (isBlockedByOtherSpecial || itemQuantity <= 0);
  const isMissingInventoryItem = shouldShowQuantity && itemQuantity <= 0;
  slot.dataset.itemQuantity = String(itemQuantity);

  if (isActiveSpecial) {
    slot.classList.add("is-active");
  }

  if (isClockUnavailable || isSpecialUnavailable || isTutorialUnavailable) {
    slot.classList.add("is-disabled");
  }

  if (isMissingInventoryItem) {
    slot.classList.add("is-missing");
  }

  if (itemIcon) {
    const image = document.createElement("img");
    image.src = deps.resolveAssetPath(itemIcon);
    image.alt = "";
    slot.append(image);
  }

  if (shouldShowQuantity) {
    const quantity = document.createElement("span");
    quantity.className = "battle-scaffold-inventory-quantity";
    quantity.textContent = String(itemQuantity);
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
    slot.addEventListener("click", () => {
      if (!deps.isBattleTutorialInventoryItemAllowed(context, itemId)) {
        return;
      }
      options.onClick(slot);
    });
    slot.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (deps.isBattleTutorialInventoryItemAllowed(context, itemId)) {
          options.onClick(slot);
        }
      }
    });
  }

  deps.attachBattleInventoryTooltip(context, slot, {
    name: itemLabel,
    description: itemDescription,
    icon: slot.dataset.itemIcon,
  });

  return slot;
}

function handleSpecialItemClick(deps, context, itemId, slot, renderTargets) {
  if (itemId === deps.CLOCK_ITEM_ID) {
    handleClockClick(deps, context, slot, renderTargets);
    return;
  }

  handleToggleActiveSpecial(deps, context, itemId, slot, renderTargets);
}

function handleGoldItemClick(deps, context, slot, renderTargets) {
  deps.resetBattleIdleTimer(context, renderTargets);
  const uiConfig = deps.getBattleUiConfig(context);
  const activeItemId = context.battleState.activeSpecialItemId;

  if (activeItemId === deps.GOLD_ITEM_ID) {
    clearActiveBattleSpecial(deps, context);
    deps.clearBattleGoldTargetPreview(context);
    rerenderBattleAfterInventoryAction(deps, context, renderTargets, { board: true });
    return;
  }

  if (activeItemId || deps.getInventoryQuantity(context.battleState.playerState, deps.GOLD_ITEM_ID) <= 0) {
    showFloatMessage(
      slot,
      deps.translate(context.request.locale, uiConfig.textKeys.clockUnavailable),
      uiConfig.feedback.floatMessageMs,
    );
    return;
  }

  context.battleState.activeSpecialItemId = deps.GOLD_ITEM_ID;
  context.battleState.specialSwapCell = null;
  renderActiveBattleSpecialCursor(deps, context);
  rerenderBattleAfterInventoryAction(deps, context, renderTargets, { board: true });
}

function handleToggleActiveSpecial(deps, context, itemId, slot, renderTargets) {
  deps.resetBattleIdleTimer(context, renderTargets);
  const uiConfig = deps.getBattleUiConfig(context);
  const activeItemId = context.battleState.activeSpecialItemId;

  if (activeItemId === itemId) {
    deps.changeInventoryQuantity(context.battleState.playerState, itemId, 1);
    clearActiveBattleSpecial(deps, context);
    rerenderBattleAfterInventoryAction(deps, context, renderTargets);
    return;
  }

  if (activeItemId || deps.getInventoryQuantity(context.battleState.playerState, itemId) <= 0) {
    showFloatMessage(
      slot,
      deps.translate(context.request.locale, uiConfig.textKeys.clockUnavailable),
      uiConfig.feedback.floatMessageMs,
    );
    return;
  }

  deps.changeInventoryQuantity(context.battleState.playerState, itemId, -1);
  context.battleState.activeSpecialItemId = itemId;
  context.battleState.specialSwapCell = null;
  renderActiveBattleSpecialCursor(deps, context);
  rerenderBattleAfterInventoryAction(deps, context, renderTargets);
}

function handleClockClick(deps, context, slot, renderTargets) {
  deps.resetBattleIdleTimer(context, renderTargets);
  const uiConfig = deps.getBattleUiConfig(context);
  const quantity = deps.getInventoryQuantity(context.battleState.playerState, deps.CLOCK_ITEM_ID);

  if (context.battleState.activeSpecialItemId || Date.now() < (context.battleState.ragePausedUntil || 0) || quantity <= 0) {
    showFloatMessage(
      slot,
      deps.translate(context.request.locale, uiConfig.textKeys.clockUnavailable),
      uiConfig.feedback.floatMessageMs,
    );
    return;
  }

  const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, deps.CLOCK_ITEM_ID);
  const stopSeconds = Math.max(0, Number(item?.battleTimeStopSeconds) || 0);
  deps.changeInventoryQuantity(context.battleState.playerState, deps.CLOCK_ITEM_ID, -1);
  const pauseStart = Math.max(Date.now(), context.battleState.ragePausedUntil || 0);
  context.battleState.ragePausedUntil = pauseStart + stopSeconds * 1000;
  deps.advanceBattleTutorialAfterInventoryAction(context, deps.CLOCK_ITEM_ID, renderTargets);

  if (renderTargets?.status) {
    deps.setBattleStatus(context, renderTargets.status, deps.translate(context.request.locale, uiConfig.textKeys.clockUsed));
  }
  if (renderTargets) {
    renderBattleInventory(deps, renderTargets.specialItems, renderTargets.handItems, context, renderTargets);
    updateBattleClockCooldownDisplay(deps, context, renderTargets.specialItems);
  }
}

function getClockCooldownState(context) {
  const remainingMs = Math.max(0, (context.battleState.ragePausedUntil || 0) - getClockCooldownNow(context));
  return {
    remainingMs,
    seconds: remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0,
  };
}

function getClockCooldownNow(context) {
  const pauseState = context?.battleRuntimePause;
  const ragePausedUntil = Number(context?.battleState?.ragePausedUntil) || 0;
  if (pauseState?.startedAt && ragePausedUntil > pauseState.startedAt) {
    return pauseState.startedAt;
  }
  return Date.now();
}

function syncBattleClockSlotVisualState(deps, context, slot, cooldownSeconds) {
  const quantity = deps.getInventoryQuantity(context.battleState.playerState, deps.CLOCK_ITEM_ID);
  const isUnavailable = cooldownSeconds > 0
    || quantity <= 0
    || Boolean(context.battleState.activeSpecialItemId);
  slot.classList.toggle("is-disabled", isUnavailable);
}

function scheduleBattleClockCooldownRefresh(deps, context, specialItemsElement, remainingMs) {
  clearBattleClockCooldownRefresh(context);
  if (typeof window === "undefined" || !specialItemsElement?.isConnected || remainingMs <= 0) {
    return;
  }

  const delayMs = Math.max(50, Math.min(250, remainingMs + 25));
  context.battleClockCooldownTimeoutId = window.setTimeout(() => {
    context.battleClockCooldownTimeoutId = null;
    if (!specialItemsElement.isConnected) {
      return;
    }
    updateBattleClockCooldownDisplay(deps, context, specialItemsElement);
  }, delayMs);
}

function clearBattleClockCooldownRefresh(context) {
  if (typeof window === "undefined" || !context?.battleClockCooldownTimeoutId) {
    return;
  }
  window.clearTimeout(context.battleClockCooldownTimeoutId);
  context.battleClockCooldownTimeoutId = null;
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

function rerenderBattleAfterInventoryAction(deps, context, renderTargets, options = {}) {
  if (!renderTargets) {
    return;
  }

  renderBattleInventory(deps, renderTargets.specialItems, renderTargets.handItems, context, renderTargets);

  if (options.board) {
    deps.renderBattleBoard(
      renderTargets.boardElement,
      context,
      renderTargets.status,
      renderTargets.enemyStats,
      renderTargets.playerMeters,
      renderTargets.ultimateText,
    );
  }
}
