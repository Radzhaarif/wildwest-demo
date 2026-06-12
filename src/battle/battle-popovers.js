import { renderInlineRichText } from "../rich-text.js";

let battleTooltipHideTimeoutId = null;
let battleTooltipShowTimeoutId = null;

export function createBattleMiniMenuOverlay(deps, panel, context) {
  const overlay = document.createElement("div");
  overlay.className = "battle-mini-menu-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("role", "presentation");

  const menuAnchor = document.createElement("button");
  menuAnchor.type = "button";
  menuAnchor.className = "battle-mini-menu-anchor";
  menuAnchor.setAttribute(
    "aria-label",
    deps.translate(context.request.locale, "ui.battleMenu")
      || deps.translate(context.request.locale, "menu.settings")
      || "Menu",
  );
  const menuAnchorIcon = document.createElement("img");
  menuAnchorIcon.src = deps.resolveAssetPath("data/Assets/icons/little_menu.png");
  menuAnchorIcon.alt = "";
  menuAnchorIcon.loading = "lazy";
  menuAnchor.append(menuAnchorIcon);
  menuAnchor.addEventListener("click", (event) => {
    event.stopPropagation();
    closeBattleMiniMenu(deps, context, context.battleRenderTargets);
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  overlay.addEventListener("click", () => {
    closeBattleMiniMenu(deps, context, context.battleRenderTargets);
  });

  overlay.append(menuAnchor, panel);
  return overlay;
}

export function toggleBattleMiniMenu(deps, context, renderTargets) {
  const activeRenderTargets = deps.normalizeBattleRenderTargets(context, renderTargets);
  if (context.battleState.isMiniMenuOpen) {
    closeBattleMiniMenu(deps, context, activeRenderTargets);
    return;
  }
  openBattleMiniMenu(deps, context, activeRenderTargets);
}

export function openBattleMiniMenu(deps, context, renderTargets) {
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }

  closeBattleInventory(deps, context, renderTargets, { resume: false });
  context.battleState.isMiniMenuOpen = true;
  deps.pauseBattleRuntime(context);
  hideBattleTooltip();
  positionBattleMiniMenu(deps, context, renderTargets);
  renderTargets?.miniMenuOverlay?.classList.add("is-open");
  renderTargets?.miniMenuOverlay?.setAttribute("aria-hidden", "false");
  deps.renderBattleInventory(renderTargets.specialItems, renderTargets.handItems, context, renderTargets);
}

export function closeBattleMiniMenu(deps, context, renderTargets, options = {}) {
  const activeRenderTargets = deps.normalizeBattleRenderTargets(context, renderTargets);
  if (!context?.battleState?.isMiniMenuOpen) {
    return;
  }

  context.battleState.isMiniMenuOpen = false;
  hideBattleTooltip();
  activeRenderTargets?.miniMenuOverlay?.classList.remove("is-open");
  activeRenderTargets?.miniMenuOverlay?.setAttribute("aria-hidden", "true");
  deps.renderBattleInventory(activeRenderTargets.specialItems, activeRenderTargets.handItems, context, activeRenderTargets);

  if (
    options.resume !== false
    && !context.battleState.isInventoryOpen
    && deps.shouldContinueBattle(context, activeRenderTargets)
  ) {
    deps.resumeBattleRuntime(context, activeRenderTargets);
  }
}

export function positionBattleMiniMenu(deps, context, renderTargets) {
  const overlay = renderTargets?.miniMenuOverlay;
  const menuButton = renderTargets?.menuButton;
  if (!overlay || !menuButton) {
    return;
  }

  const menuRect = menuButton.getBoundingClientRect();

  if (menuRect && Number.isFinite(menuRect.left) && Number.isFinite(menuRect.top)) {
    const anchorSize = Math.max(menuRect.width, menuRect.height);
    const anchorLeft = menuRect.left + (menuRect.width - anchorSize) / 2;
    const anchorTop = menuRect.top + (menuRect.height - anchorSize) / 2;
    overlay.style.setProperty("--battle-mini-menu-anchor-left", `${anchorLeft}px`);
    overlay.style.setProperty("--battle-mini-menu-anchor-top", `${anchorTop}px`);
    overlay.style.setProperty("--battle-mini-menu-anchor-width", `${anchorSize}px`);
    overlay.style.setProperty("--battle-mini-menu-anchor-height", `${anchorSize}px`);
  }

  if (menuRect && Number.isFinite(menuRect.right) && Number.isFinite(menuRect.bottom)) {
    const battleScale = deps.getBattleRenderedScale(renderTargets?.panel);
    const buttonSize = deps.BATTLE_POPUP_TOP_BUTTON_SIZE_PX * battleScale;
    const gap = deps.BATTLE_POPUP_MENU_GAP_PX * battleScale;
    const padding = deps.BATTLE_POPUP_PADDING_PX * battleScale;
    const edgeGap = deps.BATTLE_POPUP_EDGE_GAP_PX * battleScale;
    const panelWidth = buttonSize + padding * 2 + 2;
    const panelHeight = buttonSize * 3 + gap * 2 + padding * 2 + 2;
    const frameRect = renderTargets?.frame?.getBoundingClientRect();
    const minLeft = Number.isFinite(frameRect?.left) ? frameRect.left + edgeGap : edgeGap;
    const maxLeft = Number.isFinite(frameRect?.right)
      ? frameRect.right - panelWidth - edgeGap
      : window.innerWidth - panelWidth - edgeGap;
    const minTop = Number.isFinite(frameRect?.top) ? frameRect.top + edgeGap : edgeGap;
    const maxTop = Number.isFinite(frameRect?.bottom)
      ? frameRect.bottom - panelHeight - edgeGap
      : window.innerHeight - panelHeight - edgeGap;
    const preferredLeft = menuRect.right - panelWidth;
    const preferredTop = menuRect.bottom + gap;
    const panelLeft = maxLeft >= minLeft
      ? Math.min(Math.max(preferredLeft, minLeft), maxLeft)
      : minLeft;
    const fallbackTop = menuRect.top - panelHeight - gap;
    const panelTop = preferredTop <= maxTop
      ? Math.max(preferredTop, minTop)
      : Math.max(Math.min(fallbackTop, maxTop), minTop);
    overlay.style.setProperty("--battle-mini-menu-panel-left", `${panelLeft}px`);
    overlay.style.setProperty("--battle-mini-menu-panel-top", `${panelTop}px`);
  }
}

export function createBattleInventoryOverlay(deps, panel, context) {
  const overlay = document.createElement("div");
  overlay.className = "battle-inventory-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("role", "presentation");

  const bagAnchor = document.createElement("button");
  bagAnchor.type = "button";
  bagAnchor.className = "battle-inventory-anchor";
  bagAnchor.setAttribute("aria-label", deps.translate(context.request.locale, "ui.bag") || "Bag");
  const bagAnchorIcon = document.createElement("img");
  bagAnchorIcon.src = deps.resolveAssetPath("data/Assets/icons/bag.png");
  bagAnchorIcon.alt = "";
  bagAnchorIcon.loading = "lazy";
  bagAnchor.append(bagAnchorIcon);
  bagAnchor.addEventListener("click", (event) => {
    event.stopPropagation();
    closeBattleInventory(deps, context, context.battleRenderTargets);
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  overlay.addEventListener("click", () => {
    closeBattleInventory(deps, context, context.battleRenderTargets);
  });

  overlay.append(bagAnchor, panel);
  return overlay;
}

export function toggleBattleInventory(deps, context, renderTargets) {
  const activeRenderTargets = deps.normalizeBattleRenderTargets(context, renderTargets);
  if (context.battleState.isInventoryOpen) {
    closeBattleInventory(deps, context, activeRenderTargets);
    return;
  }
  openBattleInventory(deps, context, activeRenderTargets);
}

export function openBattleInventory(deps, context, renderTargets) {
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }

  closeBattleMiniMenu(deps, context, renderTargets, { resume: false });
  context.battleState.isInventoryOpen = true;
  deps.pauseBattleRuntime(context);
  hideBattleTooltip();
  positionBattleInventory(deps, context, renderTargets);
  renderTargets?.inventoryOverlay?.classList.add("is-open");
  renderTargets?.inventoryOverlay?.setAttribute("aria-hidden", "false");
  deps.renderBattleInventory(renderTargets.specialItems, renderTargets.handItems, context, renderTargets);
}

export function closeBattleInventory(deps, context, renderTargets, options = {}) {
  const activeRenderTargets = deps.normalizeBattleRenderTargets(context, renderTargets);
  if (!context?.battleState?.isInventoryOpen) {
    return;
  }

  context.battleState.isInventoryOpen = false;
  hideBattleTooltip();
  activeRenderTargets?.inventoryOverlay?.classList.remove("is-open");
  activeRenderTargets?.inventoryOverlay?.setAttribute("aria-hidden", "true");
  deps.renderBattleInventory(activeRenderTargets.specialItems, activeRenderTargets.handItems, context, activeRenderTargets);

  if (
    options.resume !== false
    && !context.battleState.isMiniMenuOpen
    && deps.shouldContinueBattle(context, activeRenderTargets)
  ) {
    deps.resumeBattleRuntime(context, activeRenderTargets);
  }
}

export function positionBattleInventory(deps, context, renderTargets) {
  const overlay = renderTargets?.inventoryOverlay;
  const specialItemsElement = renderTargets?.specialItems;
  if (!overlay || !specialItemsElement) {
    return;
  }

  const bagSlot = specialItemsElement.querySelector(`[data-item-id="${deps.BAG_ITEM_ID}"]`);
  const bagRect = bagSlot?.getBoundingClientRect();
  if (!bagRect || !Number.isFinite(bagRect.left) || !Number.isFinite(bagRect.top)) {
    return;
  }

  const battleScale = deps.getBattleRenderedScale(renderTargets?.panel);
  const panelGap = deps.BATTLE_POPUP_MENU_GAP_PX * battleScale;
  const slotSize = deps.BATTLE_POPUP_INVENTORY_SLOT_PX * battleScale;
  const inventoryGap = deps.BATTLE_POPUP_INVENTORY_GAP_PX * battleScale;
  const padding = deps.BATTLE_POPUP_PADDING_PX * battleScale;
  const edgeGap = deps.BATTLE_POPUP_EDGE_GAP_PX * battleScale;
  const slotCount = renderTargets?.handItems?.querySelectorAll(".battle-scaffold-inventory-slot").length
    || deps.getBattleHandItemIds(context).length;
  const rowCount = Math.max(1, Math.ceil(slotCount / deps.BATTLE_POPUP_INVENTORY_COLUMNS));
  const panelWidth = deps.BATTLE_POPUP_INVENTORY_COLUMNS * slotSize
    + (deps.BATTLE_POPUP_INVENTORY_COLUMNS - 1) * inventoryGap
    + 2 * padding
    + 2;
  const panelHeight = rowCount * slotSize
    + (rowCount - 1) * inventoryGap
    + 2 * padding
    + 2;
  const frameRect = renderTargets?.frame?.getBoundingClientRect();
  const minPanelLeft = Number.isFinite(frameRect?.left) ? frameRect.left + edgeGap : edgeGap;
  const maxPanelLeft = Number.isFinite(frameRect?.right)
    ? frameRect.right - panelWidth - edgeGap
    : window.innerWidth - panelWidth - edgeGap;
  const minPanelTop = Number.isFinite(frameRect?.top) ? frameRect.top + edgeGap : edgeGap;
  const maxPanelTop = Number.isFinite(frameRect?.bottom)
    ? frameRect.bottom - panelHeight - edgeGap
    : window.innerHeight - panelHeight - edgeGap;
  const preferredPanelLeft = bagRect.right + panelGap;
  const panelLeft = maxPanelLeft >= minPanelLeft
    ? Math.min(Math.max(preferredPanelLeft, minPanelLeft), maxPanelLeft)
    : minPanelLeft;
  const preferredPanelTop = bagRect.top - panelHeight * deps.BATTLE_POPUP_INVENTORY_VERTICAL_OFFSET_RATIO;
  const panelTop = maxPanelTop >= minPanelTop
    ? Math.min(Math.max(preferredPanelTop, minPanelTop), maxPanelTop)
    : minPanelTop;
  const anchorSize = Math.max(bagRect.width, bagRect.height);
  const anchorLeft = bagRect.left + (bagRect.width - anchorSize) / 2;
  const anchorTop = bagRect.top + (bagRect.height - anchorSize) / 2;

  overlay.style.setProperty("--battle-inventory-anchor-left", `${anchorLeft}px`);
  overlay.style.setProperty("--battle-inventory-anchor-top", `${anchorTop}px`);
  overlay.style.setProperty("--battle-inventory-anchor-width", `${anchorSize}px`);
  overlay.style.setProperty("--battle-inventory-anchor-height", `${anchorSize}px`);
  overlay.style.setProperty("--battle-inventory-panel-left", `${panelLeft}px`);
  overlay.style.setProperty("--battle-inventory-panel-top", `${panelTop}px`);
}

export function createBattleLogOverlay(deps, context) {
  const overlay = document.createElement("section");
  overlay.className = "battle-log-overlay hidden";

  const modal = document.createElement("div");
  modal.className = "event-log-modal battle-log-modal";

  const title = document.createElement("h2");
  title.textContent = deps.translate(context.request.locale, "ui.eventLog");

  const list = document.createElement("ol");

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.dataset.battleLogAction = "back";
  backButton.textContent = deps.translate(context.request.locale, "ui.back");
  backButton.addEventListener("click", () => {
    overlay.classList.add("hidden");
  });

  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.dataset.battleLogAction = "download-trace";
  downloadButton.textContent = deps.translate(context.request.locale, "ui.downloadBattleTrace");
  downloadButton.addEventListener("click", () => {
    deps.downloadBattleTrace(context);
  });

  const actions = document.createElement("div");
  actions.className = "battle-log-actions";
  actions.append(downloadButton, backButton);

  modal.append(title, list, actions);
  overlay.append(modal);
  return overlay;
}

export function renderBattleLog(logOverlay, context) {
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

export function addBattleLog(context, message) {
  if (!message) {
    return;
  }

  context.battleLog.unshift(message);
}

export function refreshBattleLogOverlayLanguage(deps, logOverlay, context) {
  if (!logOverlay) {
    return;
  }
  const title = logOverlay.querySelector("h2");
  const backButton = logOverlay.querySelector('[data-battle-log-action="back"]');
  const downloadButton = logOverlay.querySelector('[data-battle-log-action="download-trace"]');
  if (title) {
    title.textContent = deps.translate(context.request.locale, "ui.eventLog");
  }
  if (backButton) {
    backButton.textContent = deps.translate(context.request.locale, "ui.back");
  }
  if (downloadButton) {
    downloadButton.textContent = deps.translate(context.request.locale, "ui.downloadBattleTrace");
  }
}

export function attachBattleInventoryTooltip(deps, context, element, { name, description, icon }) {
  attachBattleTooltip(deps, context, element, {
    name,
    description,
    icon,
  });
}

export function attachBattleTooltip(deps, context, element, { name, description, icon, getContent }, options = {}) {
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
      resolveAssetPath: deps.resolveAssetPath,
      translateTextKey: (key) => deps.translate(context.request.locale, key),
    });
    positionTooltip(event, tooltip);
    clearBattleTooltipHideTimeout();
    const hideDelay = deps.getBattleTooltipDurationMs(context);
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
    if (immediate || deps.getBattleTooltipDelayMs(context) <= 0) {
      show(event);
      return;
    }
    battleTooltipShowTimeoutId = window.setTimeout(() => {
      show(event);
    }, deps.getBattleTooltipDelayMs(context));
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

export function hideBattleTooltip() {
  if (battleTooltipHideTimeoutId) {
    window.clearTimeout(battleTooltipHideTimeoutId);
    battleTooltipHideTimeoutId = null;
  }

  const tooltips = document.querySelectorAll(".battle-item-tooltip, .item-tooltip");
  tooltips.forEach((tooltip) => tooltip.classList.remove("is-visible"));
}
