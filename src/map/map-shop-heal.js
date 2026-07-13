export function createMapShopHealController(deps) {
  const {
    state,
    elements,
    translate,
    formatText,
    setEventImage,
    getItemName,
    getItemDescription,
    getItemImagePath,
    attachMapItemTooltip,
    getInventoryQuantity,
    isItemBlockedByInventoryLimit,
    changeInventoryQuantity,
    addLog,
    render,
    scrollAvailableNodesIntoActionZone,
  } = deps;

  function openHeal(node, options = {}) {
    // Данные лечения приходят из payload выбранной точки: healPercent, goldPrice,
    // dialogTextKey и eventImage. Окно не меняет состояние до applyHealing.
    state.activeHealNode = node;
    state.activeHealCompletion = typeof options.onClose === "function" ? options.onClose : null;
    const healAmount = getHealAmount(node.payload);
    const price = node.payload.goldPrice || 0;
    elements.healTitle.textContent = translate("events.heal.title");
    elements.healAmountText.textContent = formatText("events.heal.amount", {
      amount: healAmount,
    });
    elements.healCurrentHpText.textContent = formatText("events.heal.currentHp", {
      current: state.playerState.health.current,
      max: state.playerState.health.max,
    });
    elements.healDialogText.textContent = translate(node.payload.dialogTextKey);
    setEventImage(
      elements.healEventImage,
      node.payload.eventImage,
      translate("events.heal.title"),
    );
    elements.healEventImage.alt = translate("events.heal.title");
    elements.healApplyButton.textContent =
      price > 0
        ? formatText("healer.paidThanks", { price })
        : translate("healer.freeThanks");
    elements.healApplyButton.disabled = false;
    hideHealError();
    elements.healLeaveButton.textContent = translate("ui.leave");
    elements.healOverlay.classList.remove("hidden");
    addLog(
      formatText("log.healOpened", {
        node: node.id,
        amount: healAmount,
        price,
        current: state.playerState.health.current,
        max: state.playerState.health.max,
      }),
    );
  }

  function closeHeal(options = {}) {
    if (!elements.healOverlay) {
      return;
    }
    elements.healOverlay.classList.add("hidden");
    const completion = state.activeHealCompletion;
    state.activeHealNode = null;
    state.activeHealCompletion = null;
    let completedMap = false;
    if (typeof completion === "function" && options.complete !== false) {
      completedMap = completion() === true;
    }
    if (options.scrollToNext && !completedMap) {
      scrollAvailableNodesIntoActionZone();
    }
  }

  function applyHealing() {
    // Проверка золота происходит до изменения HP и до закрытия окна. Если денег
    // не хватает, показываем локализованную ошибку и оставляем игрока в оверлее.
    const node = state.activeHealNode || getCurrentNode();
    if (!node || node.eventType !== "heal") {
      closeHeal({ scrollToNext: true });
      return;
    }
    const price = node.payload.goldPrice || 0;
    if (price > getInventoryQuantity("gold")) {
      showHealError(translate("ui.notEnoughGold"));
      return;
    }
    if (price > 0) {
      changeInventoryQuantity("gold", -price);
    }
    const healAmount = getHealAmount(node.payload);
    state.playerState.health.current = Math.min(
      state.playerState.health.max,
      state.playerState.health.current + healAmount,
    );
    addLog(
      formatText("log.healApplied", {
        amount: healAmount,
        current: state.playerState.health.current,
        max: state.playerState.health.max,
        gold: getInventoryQuantity("gold"),
      }),
    );
    render();
    closeHeal({ scrollToNext: true });
  }

  function showHealError(message) {
    elements.healErrorText.textContent = message;
    elements.healErrorText.classList.remove("hidden");
  }

  function hideHealError() {
    if (!elements.healErrorText) {
      return;
    }
    elements.healErrorText.classList.add("hidden");
  }

  function getHealAmount(payload) {
    return Math.ceil((state.playerState.health.max * payload.healPercent) / 100);
  }

  function getCurrentNode() {
    // После выбора события currentNodeId нужен обработчикам shop/heal, чтобы они
    // нашли payload активной точки даже после перерендера карты.
    for (const level of state.generatedMap.levels) {
      const found = level.nodes.find((node) => node.id === state.currentNodeId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function openShop(node, options = {}) {
    // Магазин хранит активную точку отдельно от currentNodeId, потому что выбор
    // товаров происходит уже внутри оверлея и должен ссылаться на payload магазина.
    state.activeShopNode = node;
    state.activeShopCompletion = typeof options.onClose === "function" ? options.onClose : null;
    state.shopSelection = new Map();
    hideShopConfirm();
    hideShopError();
    elements.shopTitle.textContent = translate("events.shop.title");
    elements.shopLeaveButton.textContent = translate("ui.leave");
    elements.shopBuyButton.textContent = translate("ui.purchase");
    elements.inventoryTitle.textContent = translate("ui.inventory");
    elements.shopDialogText.textContent = translate(node.payload.dialogTextKey);
    elements.shopOverlay.classList.toggle("is-tutorial-active", isShopTutorialActive(node));
    setEventImage(
      elements.shopEventImage,
      node.payload.eventImage,
      translate("events.shop.traderAlt"),
    );
    elements.shopOverlay.classList.remove("hidden");
    renderShop();
    addLog(
      formatText("log.shopOpened", {
        node: node.id,
        offers: getShopItems(node).length,
        gold: getInventoryQuantity("gold"),
      }),
    );
  }

  function closeShop(options = {}) {
    if (!elements.shopOverlay) {
      return;
    }
    elements.shopOverlay.classList.add("hidden");
    elements.shopOverlay.classList.remove("is-tutorial-active");
    const completion = state.activeShopCompletion;
    state.activeShopNode = null;
    state.activeShopCompletion = null;
    state.shopSelection = new Map();
    hideShopConfirm();
    hideShopError();
    let completedMap = false;
    if (typeof completion === "function" && options.complete !== false) {
      completedMap = completion() === true;
    }
    if (options.scrollToNext && !completedMap) {
      scrollAvailableNodesIntoActionZone();
    }
  }

  function renderShop() {
    if (!state.activeShopNode) {
      return;
    }

    elements.shopItems.innerHTML = "";
    const goods = getShopItems(state.activeShopNode);
    syncShopSelectionToGoods(getPurchasableShopItems(state.activeShopNode));
    for (const item of goods) {
      elements.shopItems.append(createShopItemCard(item));
    }

    renderInventory();
    updateShopBuyButton();
  }

  function createShopItemCard(item) {
    // Одна торговая позиция выбирается максимум один раз. Ключ включает itemId,
    // amount и goldPrice, поэтому две разные позиции с тем же itemId не сольются.
    const offerKey = getShopOfferKey(item);
    const isInventoryLimitBlocked = isItemBlockedByInventoryLimit(item.itemId);
    const isSelected = !isInventoryLimitBlocked && state.shopSelection.has(offerKey);
    const amount = item.amount || 1;
    const card = document.createElement("article");
    card.className = "shop-item-card";
    card.dataset.itemId = item.itemId || "";
    card.dataset.itemAmount = String(amount);
    card.dataset.goldPrice = String(item.goldPrice || 0);
    if (isInventoryLimitBlocked) {
      card.classList.add("shop-item-card--maxed");
      card.dataset.inventoryLimitBlocked = "true";
    }
    if (isSelected) {
      card.classList.add("selected");
    }
    const tutorial = getShopTutorial();
    const isRequiredTutorialOffer = tutorial?.requiredItemIds?.includes(item.itemId) === true;
    const showTutorialSelectArrow = isRequiredTutorialOffer && !isSelected && !isInventoryLimitBlocked;
    const image = document.createElement("img");
    image.src = getItemImagePath(item.itemId);
    image.alt = getItemName(item.itemId);

    const name = document.createElement("strong");
    name.textContent = getItemName(item.itemId);

    const price = document.createElement("span");
    price.textContent = `${amount} × ${getItemName(item.itemId)} · ${item.goldPrice} ${getItemName("gold")}`;

    const maxBadge = document.createElement("b");
    maxBadge.className = "item-max-badge";
    maxBadge.textContent = translate("ui.itemMax");

    const controls = document.createElement("div");
    controls.className = "quantity-controls";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.disabled = isInventoryLimitBlocked;
    toggle.textContent = isInventoryLimitBlocked
      ? translate("ui.itemMax")
      : isSelected
        ? translate("ui.selected")
        : translate("ui.select");
    toggle.classList.toggle("shop-select-button--tutorial-required", showTutorialSelectArrow);
    toggle.addEventListener("click", () => toggleShopOffer(item));

    controls.append(toggle);
    attachMapItemTooltip(card, {
      name: getItemName(item.itemId),
      description: getItemDescription(item.itemId),
      icon: getItemImagePath(item.itemId),
    });
    card.append(image);
    if (isInventoryLimitBlocked) {
      card.append(maxBadge);
    }
    card.append(name, price, controls);
    return card;
  }

  function toggleShopOffer(item) {
    hideShopConfirm();
    hideShopError();
    const offerKey = getShopOfferKey(item);
    if (isItemBlockedByInventoryLimit(item.itemId)) {
      state.shopSelection.delete(offerKey);
      renderShop();
      return;
    }
    if (state.shopSelection.has(offerKey)) {
      state.shopSelection.delete(offerKey);
    } else {
      state.shopSelection.set(offerKey, item);
    }
    renderShop();
  }

  function updateShopBuyButton() {
    const total = getShopSelectionTotal();
    const isTutorialSelectionComplete = isShopTutorialSelectionComplete();
    elements.shopBuyButton.disabled = total <= 0 || !isTutorialSelectionComplete;
    elements.shopLeaveButton.disabled = isShopTutorialActive();
    elements.shopBuyButton.classList.toggle(
      "shop-buy-button--tutorial-required",
      isShopTutorialActive() && total > 0 && isTutorialSelectionComplete,
    );
    elements.shopBuyButton.textContent =
      total > 0
        ? `${translate("ui.purchase")} (${total} ${getItemName("gold")})`
        : translate("ui.purchase");
  }

  function showShopConfirm() {
    // Подтверждение покупки живет внутри игрового интерфейса, без browser confirm.
    // Недостаток золота проверяется до показа подтверждения.
    const total = getShopSelectionTotal();
    if (total <= 0 || !isShopTutorialSelectionComplete()) {
      if (isShopTutorialActive()) {
        showShopError(translate(getShopTutorial().wrongTextKey));
      }
      return;
    }
    if (total > getInventoryQuantity("gold")) {
      showShopError(translate("ui.notEnoughGold"));
      return;
    }

    elements.shopConfirmText.textContent = `${translate(
      "ui.purchase.question",
    )} ${total} ${getItemName("gold")}`;
    elements.shopConfirm.classList.remove("hidden");
    elements.shopBuyButton.classList.remove("shop-buy-button--tutorial-required");
    elements.shopConfirmNoButton.disabled = false;
  }

  function hideShopConfirm() {
    if (!elements.shopConfirm) {
      return;
    }
    elements.shopConfirm.classList.add("hidden");
    elements.shopConfirmNoButton.disabled = false;
    if (state.activeShopNode) {
      updateShopBuyButton();
    }
  }

  function showShopError(message) {
    elements.shopErrorText.textContent = message;
    elements.shopErrorText.classList.remove("hidden");
  }

  function hideShopError() {
    if (!elements.shopErrorText) {
      return;
    }
    elements.shopErrorText.classList.add("hidden");
  }

  function confirmShopPurchase() {
    // Деньги списываются за сумму выбранных позиций, затем каждая позиция добавляет
    // amount предметов в инвентарь. После успешной покупки магазин закрывается.
    syncShopSelectionToGoods(getPurchasableShopItems(state.activeShopNode));
    const total = getShopSelectionTotal();
    if (total <= 0 || !isShopTutorialSelectionComplete() || total > getInventoryQuantity("gold")) {
      showShopError(translate("ui.notEnoughGold"));
      return;
    }
    changeInventoryQuantity("gold", -total);
    const purchasedItems = [...state.shopSelection.values()]
      .map((item) => `${item.amount || 1}x ${getItemName(item.itemId)}`)
      .join(", ");
    for (const item of state.shopSelection.values()) {
      changeInventoryQuantity(item.itemId, item.amount || 1);
    }

    addLog(
      formatText("log.shopPurchased", {
        items: purchasedItems,
        total,
        gold: getInventoryQuantity("gold"),
      }),
    );
    render();
    closeShop({ scrollToNext: true });
  }

  function getShopSelectionTotal() {
    if (!state.activeShopNode) {
      return 0;
    }
    const goodsById = new Map(
      getPurchasableShopItems(state.activeShopNode).map((item) => [getShopOfferKey(item), item]),
    );
    let total = 0;
    for (const offerKey of state.shopSelection.keys()) {
      total += goodsById.get(offerKey)?.goldPrice || 0;
    }
    return total;
  }

  function getShopOfferKey(item) {
    return `${item.itemId}:${item.amount || 1}:${item.goldPrice}`;
  }

  function getShopItems(node) {
    return node?.payload?.items || [];
  }

  function getShopTutorial(node = state.activeShopNode) {
    const tutorial = node?.payload?.tutorial;
    return tutorial?.enabled === true ? tutorial : null;
  }

  function isShopTutorialActive(node = state.activeShopNode) {
    return Boolean(getShopTutorial(node));
  }

  function isShopTutorialSelectionComplete() {
    const tutorial = getShopTutorial();
    if (!tutorial) {
      return true;
    }
    const selectedItemIds = new Set([...state.shopSelection.values()].map((item) => item.itemId));
    return tutorial.requiredItemIds.every((itemId) => selectedItemIds.has(itemId));
  }

  function getPurchasableShopItems(node) {
    return getShopItems(node).filter((item) => !isItemBlockedByInventoryLimit(item.itemId));
  }

  function syncShopSelectionToGoods(goods) {
    const availableKeys = new Set(goods.map((item) => getShopOfferKey(item)));
    for (const offerKey of state.shopSelection.keys()) {
      if (!availableKeys.has(offerKey)) {
        state.shopSelection.delete(offerKey);
      }
    }
  }

  function renderInventory() {
    elements.inventoryItems.innerHTML = "";
    for (const item of state.playerState.inventory) {
      const card = document.createElement("article");
      card.className = "inventory-item-card";

      const image = document.createElement("img");
      image.src = getItemImagePath(item.itemId);
      image.alt = getItemName(item.itemId);

      const name = document.createElement("strong");
      name.textContent = getItemName(item.itemId);

      const quantity = document.createElement("span");
      quantity.textContent = String(item.quantity);

      attachMapItemTooltip(card, {
        name: getItemName(item.itemId),
        description: getItemDescription(item.itemId),
        icon: getItemImagePath(item.itemId),
      });
      card.append(image, name, quantity);
      elements.inventoryItems.append(card);
    }
  }

  return {
    openShop,
    closeShop,
    showShopConfirm,
    hideShopConfirm,
    confirmShopPurchase,
    openHeal,
    closeHeal,
    applyHealing,
  };
}
