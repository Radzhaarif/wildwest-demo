const ITEM_ICON_TOKEN_RE = /\{item:([^{}\s]+)\}(\s*\\s\{([0-9]+(?:\.[0-9]+)?)\})?/g;

export function renderInlineRichText(target, text, options = {}) {
  if (!target) {
    return;
  }

  target.replaceChildren(...createInlineRichTextNodes(text, options));
}

export function createInlineRichTextNodes(text, options = {}) {
  // Rich-text сейчас поддерживает только item token. Если токен не найден в
  // каталоге, оставляем исходный текст, чтобы локаль не ломала UI.
  const source = String(text || "");
  const nodes = [];
  let lastIndex = 0;

  for (const match of source.matchAll(ITEM_ICON_TOKEN_RE)) {
    const [token, itemId, , sizeValue] = match;
    if (match.index > lastIndex) {
      nodes.push(document.createTextNode(source.slice(lastIndex, match.index)));
    }

    nodes.push(createItemIconNode(itemId, `{item:${itemId}}`, options, sizeValue));
    lastIndex = match.index + token.length;
  }

  if (lastIndex < source.length) {
    nodes.push(document.createTextNode(source.slice(lastIndex)));
  }

  return nodes.length > 0 ? nodes : [document.createTextNode("")];
}

function createItemIconNode(itemId, fallbackText, options, sizeValue) {
  const item = findItemDefinition(options.itemCatalogById || options.itemCatalog, itemId);
  if (!item?.icon) {
    return document.createTextNode(fallbackText);
  }

  const image = document.createElement("img");
  image.className = "inline-item-icon";
  image.src = typeof options.resolveAssetPath === "function"
    ? options.resolveAssetPath(item.icon)
    : item.icon;
  const itemName = typeof options.translateTextKey === "function"
    ? options.translateTextKey(item.nameTextKey)
    : item.nameTextKey;
  image.alt = itemName || itemId;
  image.title = itemName || itemId;
  image.dataset.itemId = itemId;
  const iconScale = Number(sizeValue);
  if (Number.isFinite(iconScale) && iconScale > 0) {
    image.style.setProperty("--inline-item-icon-scale", iconScale);
  }
  return image;
}

function findItemDefinition(catalog, itemId) {
  if (!catalog || !itemId) {
    return null;
  }
  if (catalog instanceof Map) {
    return catalog.get(itemId) || null;
  }
  if (Array.isArray(catalog)) {
    return catalog.find((item) => item.itemId === itemId) || null;
  }
  if (Array.isArray(catalog.items)) {
    return catalog.items.find((item) => item.itemId === itemId) || null;
  }
  return null;
}
