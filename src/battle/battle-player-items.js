export function getItemLabel(deps, context, item, itemId) {
  return deps.translate(context.request.locale, item?.nameTextKey) || itemId || "";
}

export function getItemDescription(deps, context, item, itemId) {
  return deps.translate(context.request.locale, item?.descriptionTextKey) || "";
}

export function getBattleHandItemIds(deps, context) {
  const itemIds = deps.getBattleUiConfig(context).handItemIds;
  return Array.isArray(itemIds) && itemIds.length > 0 ? itemIds : deps.DEFAULT_HAND_ITEM_IDS;
}

export function getInventoryQuantity(playerState, itemId) {
  return playerState?.inventory?.find((item) => item.itemId === itemId)?.quantity || 0;
}

export function changeInventoryQuantity(playerState, itemId, delta) {
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
