export function createMapHudRenderer(deps) {
  const {
    state,
    elements,
    translate,
    getSortedItemDefinitions,
    getItemHudOrder,
    getInventoryQuantity,
    getItemName,
    getItemDescription,
    getItemImagePath,
    attachMapItemTooltip,
    getNextExperienceLevel,
  } = deps;

  function renderHud() {
    // HUD читает порядок, подписи и иконки из каталога предметов. Базовые строки
    // отмечены showInHudAlways, а остальные предметы появляются только при quantity > 0.
    if (!state.playerState) {
      return;
    }

    const baseHudItems = getSortedItemDefinitions().filter((item) => item.showInHudAlways);
    const renderedItemIds = new Set(baseHudItems.map((item) => item.itemId));
    elements.mapHud.innerHTML = "";

    for (const item of baseHudItems) {
      if (item.hudValue === "health") {
        elements.mapHud.append(createHealthHudItem(item));
      } else if (item.hudValue === "experience") {
        elements.mapHud.append(createExperienceHudItem(item));
      } else {
        elements.mapHud.append(createInventoryHudItem(item.itemId, getInventoryQuantity(item.itemId)));
      }
    }

    const inventoryItems = [...state.playerState.inventory].sort((a, b) => {
      return getItemHudOrder(a.itemId) - getItemHudOrder(b.itemId) || a.itemId.localeCompare(b.itemId);
    });
    for (const item of inventoryItems) {
      if (renderedItemIds.has(item.itemId) || item.quantity <= 0) {
        continue;
      }
      elements.mapHud.append(createInventoryHudItem(item.itemId, item.quantity));
    }
  }

  function createHealthHudItem(item) {
    return createHudItem({
      itemId: item.itemId,
      imageSrc: getItemImagePath(item.itemId),
      label: getItemName(item.itemId),
      title: getItemDescription(item.itemId),
      value: `${state.playerState.health.current}/${state.playerState.health.max}`,
    });
  }

  function createExperienceHudItem(item) {
    return createHudItem({
      itemId: item.itemId,
      imageSrc: getItemImagePath(item.itemId),
      label: getItemName(item.itemId),
      title: getItemDescription(item.itemId),
      value: getExperienceHudValue(),
    });
  }

  function getExperienceHudValue() {
    const total = state.playerState.experience?.total || 0;
    const nextLevel = getNextExperienceLevel(total);
    if (!nextLevel) {
      return translate("ui.maxLevel");
    }
    return `${total}/${nextLevel.requiredExperience}`;
  }

  function createInventoryHudItem(itemId, quantity) {
    return createHudItem({
      itemId,
      imageSrc: getItemImagePath(itemId),
      label: getItemName(itemId),
      title: getItemDescription(itemId),
      value: String(quantity),
    });
  }

  function createHudItem({ itemId, imageSrc, label, title, value }) {
    const item = document.createElement("div");
    item.className = "hud-item";
    item.dataset.itemId = itemId || "";
    item.dataset.hudValue = String(value);

    const image = document.createElement("img");
    image.src = imageSrc;
    image.alt = "";

    const text = document.createElement("span");
    text.textContent = value;

    attachMapItemTooltip(item, {
      name: label || "",
      description: title || "",
      icon: imageSrc,
    });
    item.append(image, text);
    return item;
  }

  return {
    renderHud,
  };
}
