export function createMapItemsController(deps) {
  const {
    state,
    translate,
    resolveAssetPath,
  } = deps;

  function normalizePlayerHealthByInventory(playerState = state.playerState) {
    // Max HP зависит от инвентаря (например, red). После загрузки, покупки,
    // награды и боя всегда нормализуем current/max через этот слой.
    if (!playerState || !playerState.health) {
      return;
    }

    const healthState = playerState.health;
    const inventory = Array.isArray(playerState.inventory) ? playerState.inventory : [];

    const maxHpBonus = inventory.reduce((total, entry) => {
      const item = getItemDefinition(entry?.itemId);
      const qty = Number.isFinite(entry?.quantity) ? Math.max(0, Math.trunc(entry.quantity)) : 0;
      const modifier = Number(item?.max_hp_modif);
      return total + (Number.isFinite(modifier) ? modifier * qty : 0);
    }, 0);

    const defaultMax =
      Number.isFinite(Number(healthState.baseMax)) && Number(healthState.baseMax) > 0
        ? Number(healthState.baseMax)
        : Math.max(1, (Number(healthState.max) || 1) - maxHpBonus);

    healthState.baseMax = Math.max(1, defaultMax);
    healthState.max = healthState.baseMax + maxHpBonus;
    healthState.current = Math.max(0, Math.min(Number.isFinite(healthState.current) ? healthState.current : 0, healthState.max));
  }

  function getInventoryQuantity(itemId) {
    return state.playerState.inventory.find((item) => item.itemId === itemId)?.quantity || 0;
  }

  function getLimitedItemInventoryThreshold() {
    const threshold = Math.floor(Number(state.experienceTable?.limitedItemInventoryThreshold) || 0);
    return Math.max(0, threshold);
  }

  function isItemBlockedByInventoryLimit(itemId) {
    if (!itemId) {
      return false;
    }
    const item = getItemDefinition(itemId);
    const threshold = getLimitedItemInventoryThreshold();
    return item.limitByInventory === true && threshold > 0 && getInventoryQuantity(itemId) >= threshold;
  }

  function isRewardBlockedByInventoryLimit(reward) {
    if (!reward || (reward.type !== undefined && reward.type !== "item")) {
      return false;
    }
    return isItemBlockedByInventoryLimit(reward.itemId);
  }

  function changeInventoryQuantity(itemId, delta) {
    // Инвентарь расширяем лениво: если магазин или награда добавит новый itemId,
    // запись создастся автоматически. Количество не уходит ниже нуля.
    let entry = state.playerState.inventory.find((item) => item.itemId === itemId);
    if (!entry) {
      entry = { itemId, quantity: 0 };
      state.playerState.inventory.push(entry);
    }
    entry.quantity = Math.max(0, entry.quantity + delta);
    normalizePlayerHealthByInventory();
  }

  function getSortedItemDefinitions() {
    return [...state.itemCatalogById.values()].sort((a, b) => {
      return getItemHudOrder(a.itemId) - getItemHudOrder(b.itemId) || a.itemId.localeCompare(b.itemId);
    });
  }

  function getItemHudOrder(itemId) {
    const definition = getItemDefinition(itemId);
    return typeof definition.hudOrder === "number" ? definition.hudOrder : 1000;
  }

  function getItemDefinition(itemId) {
    return (
      state.itemCatalogById.get(itemId) || {
        itemId,
        nameTextKey: `items.${itemId}.name`,
        descriptionTextKey: `items.${itemId}.description`,
        icon: "",
        bigIcon: "",
      }
    );
  }

  function getItemName(itemId) {
    return translate(getItemDefinition(itemId).nameTextKey);
  }

  function getItemDescription(itemId) {
    return translate(getItemDefinition(itemId).descriptionTextKey);
  }

  function getItemImagePath(itemId) {
    return resolveAssetPath(getItemDefinition(itemId).icon);
  }

  function getItemBigImagePath(itemId) {
    return resolveAssetPath(getItemDefinition(itemId).bigIcon);
  }

  return {
    normalizePlayerHealthByInventory,
    getInventoryQuantity,
    getLimitedItemInventoryThreshold,
    isItemBlockedByInventoryLimit,
    isRewardBlockedByInventoryLimit,
    changeInventoryQuantity,
    getSortedItemDefinitions,
    getItemHudOrder,
    getItemDefinition,
    getItemName,
    getItemDescription,
    getItemImagePath,
    getItemBigImagePath,
  };
}
