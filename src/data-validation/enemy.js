import {
  hasOptionalStringList,
  requireIntegerInRange,
  requireNumberInRange,
  requirePositiveInteger,
  requirePositiveNumber,
  requireString,
  validateCatalogAssetPath,
  validateOptionalStringList,
  validateRewardConfig,
} from "./common.js";

const BATTLE_ITEM_STAT_KEYS = ["damage", "heal", "aggression", "calm"];

export function validateEnemyConfig(enemyConfig, source, issues, requiredTextKeys, requiredItemIds) {
  if (!enemyConfig || typeof enemyConfig !== "object") {
    issues.push(`${source}: enemy config must be an object`);
    return;
  }

  if (requireString(enemyConfig.enemyId, `${source}.enemyId`, issues)) {
    // enemyId является идентификатором конкретного config-файла. Если нужна
    // общая сущность для вариантов сложности, используем явный baseEnemyId.
    const expectedEnemyId = getEnemyFileIdFromSource(source);
    if (expectedEnemyId && enemyConfig.enemyId !== expectedEnemyId) {
      issues.push(`${source}.enemyId: expected "${expectedEnemyId}" to match the enemy config file name`);
    }
  }
  if (enemyConfig.baseEnemyId !== undefined) {
    requireString(enemyConfig.baseEnemyId, `${source}.baseEnemyId`, issues);
  }
  if (requireString(enemyConfig.nameTextKey, `${source}.nameTextKey`, issues)) {
    requiredTextKeys.add(enemyConfig.nameTextKey);
  }
  if (requireString(enemyConfig.descriptionTextKey, `${source}.descriptionTextKey`, issues)) {
    requiredTextKeys.add(enemyConfig.descriptionTextKey);
  }
  requirePositiveInteger(enemyConfig.stageCount, `${source}.stageCount`, issues);
  if (enemyConfig.wall !== undefined) {
    requireIntegerInRange(enemyConfig.wall, `${source}.wall`, 0, Infinity, issues);
  }
  if (enemyConfig.box !== undefined) {
    requireIntegerInRange(enemyConfig.box, `${source}.box`, 0, Infinity, issues);
  }
  if (enemyConfig.vines !== undefined) {
    requireIntegerInRange(enemyConfig.vines, `${source}.vines`, 0, Infinity, issues);
  }
  if (enemyConfig.convert !== undefined) {
    issues.push(`${source}.convert: passive convert must be configured inside stages[].convert`);
  }
  if (!Array.isArray(enemyConfig.stages) || enemyConfig.stages.length === 0) {
    issues.push(`${source}.stages: must contain at least one stage`);
  } else {
    if (Number.isInteger(enemyConfig.stageCount) && enemyConfig.stageCount !== enemyConfig.stages.length) {
      issues.push(`${source}.stageCount: must match stages length`);
    }
    enemyConfig.stages.forEach((stage, index) => {
      validateEnemyStage(stage, `${source}.stages[${index}]`, issues, requiredTextKeys, requiredItemIds);
    });
  }

  if (enemyConfig.battle_music !== undefined) {
    if (requireString(enemyConfig.battle_music, `${source}.battle_music`, issues)) {
      validateCatalogAssetPath(
        enemyConfig.battle_music,
        "data/Assets/",
        `${source}.battle_music`,
        issues,
      );
    }
  }

  validateRewardConfig(enemyConfig.reward, `${source}.reward`, issues, requiredItemIds, requiredTextKeys);
}

function getEnemyFileIdFromSource(source) {
  const normalized = String(source || "").replaceAll("\\", "/").split("?")[0].split("#")[0];
  const match = normalized.match(/(?:^|\/)enemy\/([^/]+)\.jsonc$/);
  return match ? match[1] : "";
}

function validateEnemyStage(stage, path, issues, requiredTextKeys, requiredItemIds) {
  if (!stage || typeof stage !== "object") {
    issues.push(`${path}: stage must be an object`);
    return;
  }
  requireString(stage.stageId, `${path}.stageId`, issues);
  if (requireString(stage.nameTextKey, `${path}.nameTextKey`, issues)) {
    requiredTextKeys.add(stage.nameTextKey);
  }
  if (requireString(stage.appearance, `${path}.appearance`, issues)) {
    validateCatalogAssetPath(stage.appearance, "data/Assets/enemy/", `${path}.appearance`, issues);
  }
  if (stage.wall !== undefined) {
    requireIntegerInRange(stage.wall, `${path}.wall`, 0, Infinity, issues);
  }
  if (stage.box !== undefined) {
    requireIntegerInRange(stage.box, `${path}.box`, 0, Infinity, issues);
  }
  if (stage.vines !== undefined) {
    requireIntegerInRange(stage.vines, `${path}.vines`, 0, Infinity, issues);
  }
  if (stage.shield !== undefined) {
    requireIntegerInRange(stage.shield, `${path}.shield`, 0, Infinity, issues);
  }
  validateEnemyConvertEffects(stage.convert, `${path}.convert`, issues, requiredItemIds);
  validateEnemyItemStatModifiers(stage.itemStatModifiers, `${path}.itemStatModifiers`, issues, requiredItemIds);
  requirePositiveNumber(stage.health, `${path}.health`, issues);
  requirePositiveNumber(stage.aggression?.threshold, `${path}.aggression.threshold`, issues);
  requireNumberInRange(stage.aggression?.damage, `${path}.aggression.damage`, 0, Infinity, issues);
  requirePositiveNumber(stage.rage?.secondsToUltimate, `${path}.rage.secondsToUltimate`, issues);
  validateOptionalStringList(stage.rage?.targetTypes, `${path}.rage.targetTypes`, issues);
  validateOptionalStringList(stage.rage?.targetItemIds, `${path}.rage.targetItemIds`, issues, requiredItemIds);

  if (!stage.ultimate || typeof stage.ultimate !== "object") {
    issues.push(`${path}.ultimate: must be an object`);
    return;
  }
  if (requireString(stage.ultimate.nameTextKey, `${path}.ultimate.nameTextKey`, issues)) {
    requiredTextKeys.add(stage.ultimate.nameTextKey);
  }
  if (requireString(stage.ultimate.descriptionTextKey, `${path}.ultimate.descriptionTextKey`, issues)) {
    requiredTextKeys.add(stage.ultimate.descriptionTextKey);
  }
  if (!Array.isArray(stage.ultimate.effects)) {
    issues.push(`${path}.ultimate.effects: must be an array`);
  } else {
    validateEnemyUltimateEffects(stage.ultimate.effects, `${path}.ultimate.effects`, issues, requiredItemIds);
  }
}

function validateEnemyItemStatModifiers(modifiers, path, issues, requiredItemIds) {
  if (modifiers === undefined) {
    return;
  }
  if (!Array.isArray(modifiers)) {
    issues.push(`${path}: must be an array when present`);
    return;
  }

  modifiers.forEach((modifier, index) => {
    const prefix = `${path}[${index}]`;
    if (!modifier || typeof modifier !== "object" || Array.isArray(modifier)) {
      issues.push(`${prefix}: must be an object`);
      return;
    }

    const itemIds = modifier.itemIds ?? modifier.itemId;
    validateOptionalStringList(itemIds, `${prefix}.itemIds`, issues, requiredItemIds);
    validateOptionalStringList(modifier.itemTypes, `${prefix}.itemTypes`, issues);
    if (!hasOptionalStringList(itemIds) && !hasOptionalStringList(modifier.itemTypes)) {
      issues.push(`${prefix}: expected itemTypes, itemIds or itemId selector`);
    }

    if (!modifier.multipliers || typeof modifier.multipliers !== "object" || Array.isArray(modifier.multipliers)) {
      issues.push(`${prefix}.multipliers: must be an object`);
      return;
    }

    let hasStatMultiplier = false;
    for (const [statKey, multiplier] of Object.entries(modifier.multipliers)) {
      if (!BATTLE_ITEM_STAT_KEYS.includes(statKey)) {
        issues.push(`${prefix}.multipliers.${statKey}: expected one of ${BATTLE_ITEM_STAT_KEYS.join(", ")}`);
        continue;
      }
      hasStatMultiplier = true;
      requireNumberInRange(multiplier, `${prefix}.multipliers.${statKey}`, 0, Infinity, issues);
    }
    if (!hasStatMultiplier) {
      issues.push(`${prefix}.multipliers: expected at least one of ${BATTLE_ITEM_STAT_KEYS.join(", ")}`);
    }
  });
}

function validateEnemyUltimateEffects(effects, path, issues, requiredItemIds) {
  effects.forEach((effect, index) => {
    const prefix = `${path}[${index}]`;
    if (!effect || typeof effect !== "object") {
      issues.push(`${prefix}: must be an object`);
      return;
    }

    const effectType = String(effect.type || effect.effectId || effect.id || "").trim();
    if (!effectType) {
      issues.push(`${prefix}.type: expected non-empty string`);
      return;
    }

    if (isConvertUltimateEffectType(effectType)) {
      validateConvertItemsEffect(effect, prefix, issues, requiredItemIds);
      return;
    }

    if (isDamagePlayerByBoardItemsUltimateEffectType(effectType)) {
      validateBoardItemCountEffect(effect, prefix, issues, requiredItemIds, "damagePlayerByBoardItems");
      return;
    }

    if (isHealingEnemyByBoardItemsUltimateEffectType(effectType)) {
      validateBoardItemCountEffect(effect, prefix, issues, requiredItemIds, "HealingEnemyByBoardItems");
      return;
    }

    if (isRestoreEnemyShieldByBoardItemsUltimateEffectType(effectType)) {
      validateBoardItemCountEffect(effect, prefix, issues, requiredItemIds, "RestoreEnemyShieldByBoardItems");
      return;
    }

    if (isKamikazeUltimateEffectType(effectType)) {
      return;
    }
  });
}

function validateBoardItemCountEffect(effect, prefix, issues, requiredItemIds, effectName) {
  validateOptionalStringList(effect.count?.itemTypes ?? effect.countItemTypes ?? effect.itemTypes, `${prefix}.count.itemTypes`, issues);
  const countItemIds = effect.count?.itemIds
    ?? effect.count?.itemId
    ?? effect.countItemIds
    ?? effect.countItemId
    ?? effect.itemIds
    ?? effect.itemId;
  validateOptionalStringList(
    countItemIds,
    `${prefix}.count.itemIds`,
    issues,
    requiredItemIds,
  );
  const hasItemTypes = hasOptionalStringList(effect.count?.itemTypes ?? effect.countItemTypes ?? effect.itemTypes);
  const hasItemIds = hasOptionalStringList(countItemIds);
  if (!hasItemTypes && !hasItemIds) {
    issues.push(`${prefix}.count: expected itemTypes, itemIds or itemId for ${effectName}`);
  }
  requireNumberInRange(effect.modifier, `${prefix}.modifier`, 0, Infinity, issues);
}

function validateEnemyConvertEffects(convertEffects, path, issues, requiredItemIds) {
  if (convertEffects === undefined) {
    return;
  }
  if (!Array.isArray(convertEffects)) {
    issues.push(`${path}: must be an array when present`);
    return;
  }

  convertEffects.forEach((effect, index) => {
    const prefix = `${path}[${index}]`;
    if (!effect || typeof effect !== "object") {
      issues.push(`${prefix}: must be an object`);
      return;
    }

    const effectType = String(effect.type || effect.effectId || effect.id || "").trim();
    if (!isConvertUltimateEffectType(effectType)) {
      issues.push(`${prefix}.type: expected "convertItems"`);
      return;
    }

    requireNumberInRange(effect.chance, `${prefix}.chance`, 0, 1, issues);
    validateConvertItemsEffect(effect, prefix, issues, requiredItemIds);
  });
}

function validateConvertItemsEffect(effect, prefix, issues, requiredItemIds) {
  validateOptionalStringList(effect.from?.itemTypes ?? effect.fromItemTypes ?? effect.itemTypes, `${prefix}.from.itemTypes`, issues);
  const fromItemIds = effect.from?.itemIds
    ?? effect.from?.itemId
    ?? effect.fromItemIds
    ?? effect.fromItemId
    ?? effect.itemIds
    ?? effect.itemId;
  validateOptionalStringList(
    fromItemIds,
    `${prefix}.from.itemIds`,
    issues,
    requiredItemIds,
  );
  const hasItemTypes = hasOptionalStringList(effect.from?.itemTypes ?? effect.fromItemTypes ?? effect.itemTypes);
  const hasItemIds = hasOptionalStringList(fromItemIds);
  if (!hasItemTypes && !hasItemIds) {
    issues.push(`${prefix}.from: expected itemTypes, itemIds or itemId for convertItems`);
  }

  const targetItemIds = effect.to?.itemIds ?? effect.toItemIds ?? effect.to?.itemId ?? effect.toItemId;
  validateOptionalStringList(targetItemIds, `${prefix}.to.itemIds`, issues, requiredItemIds);
  if (!hasOptionalStringList(targetItemIds)) {
    issues.push(`${prefix}.to: expected itemId or itemIds for convertItems`);
  }
}

function isConvertUltimateEffectType(effectType) {
  return ["convertItems", "convert", "conversion", "преобразование"].includes(effectType);
}

function isDamagePlayerByBoardItemsUltimateEffectType(effectType) {
  return ["damagePlayerByBoardItems", "damagePlayerByItems", "damageByBoardItems", "damagePlayer", "урон"].includes(effectType);
}

function isHealingEnemyByBoardItemsUltimateEffectType(effectType) {
  return [
    "HealingEnemyByBoardItems",
    "healingEnemyByBoardItems",
    "healEnemyByBoardItems",
    "enemyHealByBoardItems",
    "лечение",
  ].includes(effectType);
}

function isRestoreEnemyShieldByBoardItemsUltimateEffectType(effectType) {
  return [
    "RestoreEnemyShieldByBoardItems",
    "restoreEnemyShieldByBoardItems",
    "HealingEnemyShieldByBoardItems",
    "healingEnemyShieldByBoardItems",
    "enemyShieldByBoardItems",
    "щит",
  ].includes(effectType);
}

function isKamikazeUltimateEffectType(effectType) {
  return ["kamikaze", "Kamikaze", "enemyKamikaze", "kamikazeEnemy"].includes(effectType);
}
