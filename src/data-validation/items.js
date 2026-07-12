import {
  requireNumberInRange,
  requireString,
  validateCatalogAssetPath,
} from "./common.js";

const MIN_BATTLE_BOARD_DROP_TYPES = 3;

export function validateItemCatalog(itemCatalog, issues, requiredTextKeys) {
  const itemCatalogById = new Map();
  const itemBonusReferences = [];

  if (!itemCatalog || typeof itemCatalog !== "object") {
    issues.push("data/settings/items.jsonc: catalog must be an object");
    return itemCatalogById;
  }

  if (!Array.isArray(itemCatalog.items) || itemCatalog.items.length === 0) {
    issues.push("data/settings/items.jsonc.items: must contain at least one item");
    return itemCatalogById;
  }

  itemCatalog.items.forEach((item, index) => {
    const prefix = `data/settings/items.jsonc.items[${index}]`;
    if (!item || typeof item !== "object") {
      issues.push(`${prefix}: item must be an object`);
      return;
    }

    if (requireString(item.itemId, `${prefix}.itemId`, issues)) {
      if (itemCatalogById.has(item.itemId)) {
        issues.push(`${prefix}.itemId: duplicate item "${item.itemId}"`);
      } else {
        itemCatalogById.set(item.itemId, item);
      }
    }
    if (requireString(item.nameTextKey, `${prefix}.nameTextKey`, issues)) {
      requiredTextKeys.add(item.nameTextKey);
    }
    if (requireString(item.descriptionTextKey, `${prefix}.descriptionTextKey`, issues)) {
      requiredTextKeys.add(item.descriptionTextKey);
    }
    if (requireString(item.icon, `${prefix}.icon`, issues)) {
      validateCatalogAssetPath(item.icon, "data/Assets/item/", `${prefix}.icon`, issues);
    }
    if (requireString(item.bigIcon, `${prefix}.bigIcon`, issues)) {
      validateCatalogAssetPath(item.bigIcon, "data/Assets/big_icon/", `${prefix}.bigIcon`, issues);
    }
    if (item.sound_effect !== undefined && requireString(item.sound_effect, `${prefix}.sound_effect`, issues)) {
      validateCatalogAssetPath(item.sound_effect, "data/Assets/sound/", `${prefix}.sound_effect`, issues);
    }
    if (item.category !== undefined) {
      requireString(item.category, `${prefix}.category`, issues);
    }
    if (item.limitByInventory !== undefined && typeof item.limitByInventory !== "boolean") {
      issues.push(`${prefix}.limitByInventory: expected boolean`);
    }
    if (isBattleMatchItemCategory(item.category)) {
      requireString(item.type, `${prefix}.type`, issues);
      requireNumberInRange(item.damage, `${prefix}.damage`, 0, Infinity, issues);
      requireNumberInRange(item.heal, `${prefix}.heal`, 0, Infinity, issues);
      requireNumberInRange(item.aggression, `${prefix}.aggression`, 0, Infinity, issues);
      requireNumberInRange(item.calm, `${prefix}.calm`, 0, Infinity, issues);
      if (item.dmgperturn !== undefined) {
        requireNumberInRange(item.dmgperturn, `${prefix}.dmgperturn`, 0, Infinity, issues);
      }
      requireNumberInRange(item.Leave_side, `${prefix}.Leave_side`, 0, 360, issues);
      requireNumberInRange(item.death_time, `${prefix}.death_time`, 0, Infinity, issues);
    }
    collectOptionalItemReference(item.createsOnFour, `${prefix}.createsOnFour`, issues, itemBonusReferences);
    collectOptionalItemReference(item.createsOnFive, `${prefix}.createsOnFive`, issues, itemBonusReferences);
    if (item.showInHudAlways !== undefined && typeof item.showInHudAlways !== "boolean") {
      issues.push(`${prefix}.showInHudAlways: expected boolean`);
    }
    if (item.hudOrder !== undefined && (typeof item.hudOrder !== "number" || !Number.isFinite(item.hudOrder))) {
      issues.push(`${prefix}.hudOrder: expected finite number`);
    }
    if (item.hudValue !== undefined && !["health", "experience"].includes(item.hudValue)) {
      issues.push(`${prefix}.hudValue: expected "health" or "experience" when present`);
    }
    if (item.battleTimeStopSeconds !== undefined) {
      requireNumberInRange(item.battleTimeStopSeconds, `${prefix}.battleTimeStopSeconds`, 0, Infinity, issues);
    }
    if (item.battleUse !== undefined && item.battleUse !== "battery") {
      issues.push(`${prefix}.battleUse: expected "battery" when present`);
    }
    if (item.max_hp_modif !== undefined) {
      requireNumberInRange(item.max_hp_modif, `${prefix}.max_hp_modif`, 0, Infinity, issues);
    }
    if (item.heal_hp_modif !== undefined) {
      requireNumberInRange(item.heal_hp_modif, `${prefix}.heal_hp_modif`, 0, Infinity, issues);
    }
    validateItemModifiers(item, prefix, issues, itemBonusReferences);
    validateItemTransform(item, prefix, issues, itemBonusReferences);
  });

  for (const reference of itemBonusReferences) {
    if (!itemCatalogById.has(reference.itemId)) {
      issues.push(`${reference.path}: unknown itemId "${reference.itemId}"`);
    }
  }
  validateBattleDropTypeDiversity(itemCatalog.items, issues);

  return itemCatalogById;
}

function isBattleMatchItemCategory(category) {
  return category === "match-3" || category === "rare_match-3";
}

function validateBattleDropTypeDiversity(items, issues) {
  const dropTypes = new Set();

  for (const item of items) {
    if (item?.category === "match-3" && item.battleUse !== "battery" && typeof item.type === "string" && item.type.trim() !== "") {
      dropTypes.add(item.type);
    }
  }

  if (dropTypes.size < MIN_BATTLE_BOARD_DROP_TYPES) {
    const typeList = [...dropTypes].join(", ") || "none";
    issues.push(
      `data/settings/items.jsonc: too few match-3 types for battle board; expected at least `
      + `${MIN_BATTLE_BOARD_DROP_TYPES} different type values among category "match-3" items, found ${dropTypes.size} (${typeList})`,
    );
  }
}

function validateItemModifiers(item, prefix, issues, references) {
  if (item.modificate === undefined) {
    return;
  }

  if (!Array.isArray(item.modificate)) {
    issues.push(`${prefix}.modificate: expected array when present`);
    return;
  }

  item.modificate.forEach((modifier, index) => {
    const modifierPrefix = `${prefix}.modificate[${index}]`;
    if (!modifier || typeof modifier !== "object") {
      issues.push(`${modifierPrefix}: expected object`);
      return;
    }
    if (requireString(modifier.itemId, `${modifierPrefix}.itemId`, issues)) {
      references.push({
        itemId: modifier.itemId,
        path: `${modifierPrefix}.itemId`,
      });
    }
    requireNumberInRange(modifier.damage, `${modifierPrefix}.damage`, 0, Infinity, issues);
    requireNumberInRange(modifier.heal, `${modifierPrefix}.heal`, 0, Infinity, issues);
    requireNumberInRange(modifier.aggression, `${modifierPrefix}.aggression`, 0, Infinity, issues);
    requireNumberInRange(modifier.calm, `${modifierPrefix}.calm`, 0, Infinity, issues);
  });
}

function validateItemTransform(item, prefix, issues, references) {
  const hasTransform =
    item.transform_chance !== undefined ||
    item.transform_from_itemId !== undefined ||
    item.transform_to_itemId !== undefined;

  if (!hasTransform) {
    return;
  }

  requireNumberInRange(item.transform_chance, `${prefix}.transform_chance`, 0, 100, issues);
  if (requireString(item.transform_from_itemId, `${prefix}.transform_from_itemId`, issues)) {
    references.push({
      itemId: item.transform_from_itemId,
      path: `${prefix}.transform_from_itemId`,
    });
  }
  if (requireString(item.transform_to_itemId, `${prefix}.transform_to_itemId`, issues)) {
    references.push({
      itemId: item.transform_to_itemId,
      path: `${prefix}.transform_to_itemId`,
    });
  }
}

function collectOptionalItemReference(value, path, issues, references) {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${path}: expected non-empty itemId string`);
    return;
  }
  references.push({ itemId: value, path });
}

export function validateRequiredItems(requiredItemIds, itemCatalogById, issues) {
  for (const itemId of requiredItemIds) {
    if (!itemCatalogById.has(itemId)) {
      issues.push(
        `data/settings/items.jsonc: missing itemId "${itemId}" referenced by game data`,
      );
    }
  }
}
